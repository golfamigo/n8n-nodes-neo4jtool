# 開發計劃：增強 Neo4j 節點以支持資源和可用性檢查

**目標:** 擴展現有的 n8n-nodes-neo4jtool 節點包，使其能夠處理預約時的資源（如座位、桌位）和員工可用性檢查，提高預約功能的實用性和準確性，並方便 AI Agent 選用。

**核心變更：**

1.  **引入資源管理:** 添加通用的 `Resource` 節點來代表可預約的實體資源。
2.  **引入預約模式:** 在 `Business` 節點上添加 `booking_mode` 屬性，以區分不同的預約檢查邏輯。
3.  **實現可用性檢查:** 創建一個核心的 `FindAvailableSlots` 節點，根據商家的 `booking_mode` 智能地檢查資源和/或員工的可用性。
4.  **輔助節點:** 添加用於管理資源類型和資源本身的 CRUD 節點。
5.  **更新現有節點:** 修改 `CreateBooking`, `CreateBusiness`, `UpdateBusiness` 以支持新的 Schema 和邏輯。

## 1. Schema 設計變更

**a. 新增節點標籤:**

*   `Resource`: 代表可預約的實體資源。
    *   **建議屬性:**
        *   `resource_id`: STRING (唯一 ID, 使用 `randomUUID()`)
        *   `business_id`: STRING (關聯的商家 ID, 建立索引)
        *   `type`: STRING (資源類型, 例如 'Table', 'Seat', 'Room', 'Equipment', 建立索引)
        *   `name`: STRING (資源名稱/編號, 例如 'Table 5', 'Window Seat 2', 'VIP Room', 建立索引)
        *   `capacity`: INTEGER (可選, 資源容量)
        *   `properties`: MAP (可選, 存儲其他特定屬性)
        *   `created_at`: DATETIME
        *   `updated_at`: DATETIME

**b. 修改節點標籤:**

*   `Business`:
    *   **新增屬性:** `booking_mode`: STRING (建議值: 'ResourceOnly', 'StaffOnly', 'StaffAndResource', 'TimeOnly', 建立索引) - 指示該商家的預約需要檢查哪些可用性。

**c. 新增關係:**

*   `(:Business)-[:HAS_RESOURCE]->(:Resource)`
*   `(:Booking)-[:RESERVES_RESOURCE]->(:Resource)`

**d. 建議約束:**

*   `CREATE CONSTRAINT unique_resource_id IF NOT EXISTS FOR (r:Resource) REQUIRE r.resource_id IS UNIQUE;`
*   `CREATE INDEX index_resource_business_id IF NOT EXISTS FOR (r:Resource) ON (r.business_id);`
*   `CREATE INDEX index_resource_type IF NOT EXISTS FOR (r:Resource) ON (r.type);`
*   `CREATE INDEX index_resource_name IF NOT EXISTS FOR (r:Resource) ON (r.name);`
*   `CREATE INDEX index_business_booking_mode IF NOT EXISTS FOR (b:Business) ON (b.booking_mode);`

**e. 更新後的 Schema (Mermaid):**

```mermaid
graph TD
    B(Business)
    S(Service)
    St(Staff)
    SA(StaffAvailability)
    BH(BusinessHours)
    Bk(Booking)
    C(Customer)
    U(User)
    Cat(Category)
    Res(Resource) # <-- 新增

    B -- OWNS --> U
    B -- EMPLOYS --> St
    B -- OFFERS --> S
    B -- HAS_HOURS --> BH
    B -- HAS_RESOURCE --> Res # <-- 新增關係

    S -- BELONGS_TO_CATEGORY --> Cat
    Cat -- BELONGS_TO --> B

    St -- HAS_USER_ACCOUNT --> U
    St -- HAS_AVAILABILITY --> SA
    St -- CAN_PROVIDE --> S

    C -- HAS_USER_ACCOUNT --> U
    C -- REGISTERED_WITH --> B
    C -- MAKES --> Bk

    Bk -- BOOKED_BY --> C
    Bk -- AT_BUSINESS --> B
    Bk -- FOR_SERVICE --> S
    Bk -- SERVED_BY --> St
    Bk -- RESERVES_RESOURCE --> Res # <-- 新增關係
```

## 2. 節點開發/修改計劃

**a. 新增節點:**

*   **`Neo4jCreateResource`**: 創建新的 `Resource` 節點並關聯到 `Business`。
*   **`Neo4jUpdateResource`**: 更新現有 `Resource` 節點的屬性。
*   **`Neo4jDeleteResource`**: 刪除 `Resource` 節點及其關係。
*   **`Neo4jListResourceTypes`**: 查詢指定商家下已存在的 `Resource.type` 列表。
*   **`Neo4jFindAvailableSlots`**:
    *   **核心功能:** 根據輸入的 `businessId`, `serviceId`, `startDateTime`, `endDateTime` 以及可選的 `requiredResourceType`, `requiredResourceCapacity`, `requiredStaffId` 查找可用預約時間段。
    *   **內部邏輯:**
        1.  查詢 `Business` 的 `booking_mode`。
        2.  根據 `booking_mode` 決定執行哪些檢查：
            *   'ResourceOnly': 檢查資源預約情況。
            *   'StaffOnly': 檢查員工可用性和預約情況。
            *   'StaffAndResource': 同時檢查資源和員工。
            *   'TimeOnly': 檢查商家營業時間 (`BusinessHours`) 和是否有任何預約衝突。
        3.  綜合 `BusinessHours`, `StaffAvailability` (如果需要), `Booking` (檢查 `[:SERVED_BY]` 和 `[:RESERVES_RESOURCE]`) 來計算最終可用時段列表。

**b. 修改節點:**

*   **`Neo4jCreateBusiness`**: 添加 `booking_mode` 參數 (設為 required，提供建議選項)。
*   **`Neo4jUpdateBusiness`**: 添加 `booking_mode` 參數 (設為 optional)。
*   **`Neo4jCreateBooking`**: 添加可選的 `resourceId` 參數。如果提供，則在創建 Booking 後添加 `[:RESERVES_RESOURCE]` 關係。

## 3. 更新 TaskInstructions.md

*   將更新後的 Schema 描述（包括 `Resource` 和 `booking_mode`）添加到文件頂部。
*   添加 `Neo4jCreateResource`, `Neo4jUpdateResource`, `Neo4jDeleteResource`, `Neo4jListResourceTypes`, `Neo4jFindAvailableSlots` 的指令範例。
*   修改 `Neo4jCreateBusiness`, `Neo4jUpdateBusiness`, `Neo4jCreateBooking` 的指令範例以反映新的參數。

## 4. 實施步驟

1.  **手動更新 Neo4j Schema:** 在目標數據庫中執行必要的 `CREATE CONSTRAINT` 和 `CREATE INDEX` 語句。
2.  **更新 `TaskInstructions.md`:** 按照上述計劃修改文件。
3.  **開發/修改節點:** 按照更新後的 `TaskInstructions.md` 和 `NodeTemplate.ts.txt` 實現所有新的和修改的節點。
4.  **更新 `package.json`:** 註冊所有新節點。
5.  **測試:** 進行全面的測試，確保所有節點按預期工作，特別是 `FindAvailableSlots` 在不同 `booking_mode` 下的邏輯。

---
*計劃確認於 2025-04-15*
