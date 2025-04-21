# n8n-nodes-neo4jtool (中文使用手冊)

這是一個 n8n 社群節點包，旨在提供一系列針對特定業務邏輯（特別是預約系統相關）的 Neo4j 操作節點。這些節點被設計為功能單一、職責明確，方便在 n8n 工作流程或 AI Agent 中進行組合和選用。

[n8n](https://n8n.io/) 是一個 [fair-code licensed](https://docs.n8n.io/reference/license/) 的工作流程自動化平台。

**目錄**

*   [安裝與設定](#安裝與設定)
*   [核心概念](#核心概念)
    *   [數據模型概覽](#數據模型概覽)
    *   [Resource 節點](#resource-節點)
    *   [Business.booking\_mode](#businessbooking_mode)
    *   [BusinessHours 節點](#businesshours-節點)
*   [節點使用說明](#節點使用說明)
    *   [User Operations](#user-operations)
    *   [Business Operations](#business-operations)
    *   [Business Hours Operations](#business-hours-operations)
    *   [Resource Operations](#resource-operations)
    *   [Service Operations](#service-operations)
    *   [Customer Operations](#customer-operations)
    *   [Staff Operations](#staff-operations)
    *   [Staff Availability Operations](#staff-availability-operations)
    *   [Booking & Availability Operations](#booking--availability-operations)
    *   [Business Verification](#business-verification)
*   [典型工作流程範例](#典型工作流程範例)
    *   [範例 1：新用戶首次預約餐廳 (ResourceOnly)](#範例-1新用戶首次預約餐廳-resourceonly)
    *   [範例 2：現有客戶預約理髮 (StaffAndResource)](#範例-2現有客戶預約理髮-staffandresource)
    *   [範例 3：預約線上諮詢 (StaffOnly)](#範例-3預約線上諮詢-staffonly)
    *   [範例 4：修改預約時間或狀態](#範例-4修改預約時間或狀態)
    *   [範例 5：商家管理資源](#範例-5商家管理資源)
    *   [範例 6：設定/更新商家營業時間](#範例-6設定更新商家營業時間)
*   [常見問題與除錯](#常見問題與除錯)
*   [兼容性](#兼容性)
*   [資源](#資源)

## 安裝與設定

請遵循 n8n 社群節點文件中的[安裝指南](https://docs.n8n.io/integrations/community-nodes/installation/)。

**憑證設定 (Credentials)**

要使用這些節點，您需要在 n8n 中設定名為 `neo4jApi` 的 Neo4j 憑證。這需要您 Neo4j 實例的以下資訊：

*   **Host**: Neo4j 實例的主機位址，包含協議 (例如 `neo4j://localhost`, `bolt://your-server.com`, `neo4j+s://your-aura-instance.databases.neo4j.io`)。
*   **Port**: Neo4j Bolt 協議的端口號 (通常是 `7687`)。
*   **Database**: 要連接的數據庫名稱 (可選，預設為 `neo4j`)。
*   **Username**: 用於 Neo4j 身份驗證的用戶名。
*   **Password**: 指定用戶名的密碼。

## 核心概念

### 數據模型概覽

此節點包圍繞一個預約系統的數據模型設計，核心實體包括：

*   **User:** 系統的終端用戶，可以擁有商家或成為客戶/員工。
*   **Business:** 提供服務的商家實體。
*   **Service:** 商家提供的具體服務項目。
*   **Customer:** 在特定商家註冊的客戶記錄。
*   **Staff:** 為商家提供服務的員工。
*   **Booking:** 代表一次預約記錄。
*   **Resource:** 代表可預約的實體資源（例如桌位、座位）。
*   **StaffAvailability:** 記錄員工的常規可用時間。
*   **BusinessHours:** 記錄商家的結構化營業時間。
*   (其他輔助節點如 Payment, MembershipLevel 等)

### Resource 節點

`Resource` 節點用於表示可以被預約的物理或邏輯資源。

*   **`type` (類型):** 字串，用於區分不同種類的資源 (例如 'Table', 'Seat', 'Room')。建議使用 `ListResourceTypes` 節點查詢現有類型以保持一致。
*   **`name` (名稱):** 字串，用於標識具體的資源實例 (例如 'T1', '靠窗座位')。
*   **`capacity` (容量):** 整數 (可選)，表示資源可容納的數量（例如桌子可坐人數）。
*   **`properties` (屬性):** 存儲為 JSON 字串，用於記錄資源的其他特定屬性 (例如 `{"feature": "window_view"}`)。
*   **關係:**
    *   `(:Business)-[:HAS_RESOURCE]->(:Resource)`
    *   `(:Booking)-[:RESERVES_RESOURCE]->(:Resource)`

### Business.booking\_mode

`Business` 節點上的 `booking_mode` 屬性決定了在查找可用時段時需要執行的檢查邏輯：

*   **`ResourceOnly`**: 只檢查資源是否可用。適用於餐廳訂位等場景。
*   **`StaffOnly`**: 只檢查員工是否有空且能提供服務。適用於線上諮詢等場景。
*   **`StaffAndResource`**: 同時檢查員工和資源的可用性。適用於理髮沙龍等場景。
*   **`TimeOnly`**: 只檢查商家營業時間和是否有時間衝突，不關心具體員工或資源。

### BusinessHours 節點

`BusinessHours` 節點用於存儲結構化的營業時間信息，取代了原先 `Business` 節點上的 `business_hours` 字串。

*   **屬性:**
    *   `business_id`: (STRING) 關聯的商家 ID。
    *   `day_of_week`: (INTEGER) 星期幾 (0=週日, ..., 6=週六)。
    *   `start_time`: (TIME) 當天開始營業時間 (UTC)。
    *   `end_time`: (TIME) 當天結束營業時間 (UTC)。
*   **關係:**
    *   `(:Business)-[:HAS_HOURS]->(:BusinessHours)`

使用結構化 `BusinessHours` 可以讓查找可用時段的節點更準確地根據營業時間過濾可用時段。

## 節點使用說明

以下是按實體類型分組的節點說明：

### User Operations

*   **Neo4j: Find User by External ID (`neo4jFindUserByExternalId`)**
    *   **功能:** 根據外部應用 ID 查找用戶。這是查找用戶的主要入口點。
    *   **參數:** `externalId` (必填)。
    *   **輸出:** 匹配的 User 節點屬性。
*   **Neo4j: Create User (`neo4jCreateUser`)**
    *   **功能:** 創建一個新的用戶記錄。通常在用戶首次與系統交互時自動調用。
    *   **參數:** `external_id`, `name`, `email`, `phone`, `notification_enabled` (均為必填)。
    *   **輸出:** 新創建的 User 節點屬性 (包含內部 `id`)。
*   **Neo4j: Update User (`neo4jUpdateUser`)**
    *   **功能:** 根據內部 User ID (`id`) 更新用戶資訊（支持部分更新）。
    *   **參數:** `userId` (必填), `name` (可選), `email` (可選), `phone` (可選), `notification_enabled` (可選)。
    *   **輸出:** 更新後的 User 節點屬性。

### Business Operations

*   **Neo4j Create Business (`neo4jCreateBusiness`)**
    *   **功能:** 創建新的商家記錄並關聯所有者。**注意:** 營業時間需通過 `SetBusinessHours` 單獨設置。
    *   **參數:** `ownerUserId` (必填), `name` (必填), `type` (必填), `address` (必填), `phone` (必填), `email` (必填), `description` (必填), `booking_mode` (必填, 選項: ResourceOnly, StaffOnly, StaffAndResource, TimeOnly)。
    *   **輸出:** 新創建的 Business 節點屬性 (包含 `business_id`)。
*   **Neo4j: Find Business by Name (`neo4jFindBusinessByName`)**
    *   **功能:** 根據名稱模糊查找商家。*注意：由於名稱可能重複，建議優先使用其他唯一標識符查找商家。AI Agent 需處理可能的多個結果。*
    *   **參數:** `searchTerm` (必填)。
    *   **輸出:** 匹配的 Business 節點屬性列表。
*   **Neo4j Update Business (`neo4jUpdateBusiness`)**
    *   **功能:** 根據 `businessId` 更新商家資訊（支持部分更新）。**注意:** 營業時間需通過 `SetBusinessHours` 或 `DeleteBusinessHours` 單獨管理。
    *   **參數:** `businessId` (必填), `name` (可選), `type` (可選), `address` (可選), `phone` (可選), `email` (可選), `description` (可選), `booking_mode` (可選, 選項: ResourceOnly, StaffOnly, StaffAndResource, TimeOnly)。
    *   **輸出:** 更新後的 Business 節點屬性。
*   **Neo4j: Delete Business (`neo4jDeleteBusiness`)**
    *   **功能:** 根據 `businessId` 刪除商家及其所有關聯關係 (包括營業時間、資源、服務、客戶、員工、預約等，請謹慎!)。
    *   **參數:** `businessId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "deletedBusinessId": "..." }`。
*   **Neo4j: Find Services by Business (`neo4jFindServicesByBusiness`)**
    *   **功能:** 查找指定商家提供的所有服務。
    *   **參數:** `businessId` (必填)。
    *   **輸出:** 該商家提供的 Service 節點屬性列表。

### Business Hours Operations

*   **Neo4j Set Business Hours (`neo4jSetBusinessHours`)**
    *   **功能:** 設定或更新指定商家的營業時間 (會**覆蓋**該商家所有舊的營業時間設定)。
    *   **參數:** `businessId` (必填), `hoursData` (必填, JSON 陣列格式 `[{"day_of_week": 0-6, "start_time": "HH:MM", "end_time": "HH:MM"}, ...]` (時間應為 UTC))。
    *   **輸出:** 成功訊息 `{ "success": true, "businessId": "...", "deletedCount": ..., "hoursSetCount": ... }`。
*   **Neo4j Get Business Hours (`neo4jGetBusinessHours`)**
    *   **功能:** 獲取指定商家的營業時間列表。
    *   **參數:** `businessId` (必填)。
    *   **輸出:** 營業時間物件列表 `[{ "day_of_week": 0-6, "start_time": "HH:MM", "end_time": "HH:MM" }, ...]` (時間為 UTC)。
*   **Neo4j: Delete Business Hours (`neo4jDeleteBusinessHours`)**
    *   **功能:** 刪除指定商家的所有營業時間記錄。
    *   **參數:** `businessId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "businessId": "...", "nodesDeleted": ... }`。

### Resource Operations

*   **Neo4j Create Resource (`neo4jCreateResource`)**
    *   **功能:** 創建新的資源記錄並關聯到商家。
    *   **參數:** `businessId` (必填), `type` (必填), `name` (必填), `capacity` (可選), `propertiesJson` (可選, JSON 字串)。
    *   **輸出:** 新創建的 Resource 節點屬性 (properties 將是 JSON 字串, 包含 `resource_id`)。
*   **Neo4j Update Resource (`neo4jUpdateResource`)**
    *   **功能:** 根據 `resourceId` 更新資源資訊（支持部分更新）。
    *   **參數:** `resourceId` (必填), `type` (可選), `name` (可選), `capacity` (可選), `propertiesJson` (可選, JSON 字串)。
    *   **輸出:** 更新後的 Resource 節點屬性 (properties 將是 JSON 字串)。
*   **Neo4j: Delete Resource (`neo4jDeleteResource`)**
    *   **功能:** 根據 `resourceId` 刪除資源及其關聯關係。
    *   **參數:** `resourceId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "deletedResourceId": "..." }`。
*   **Neo4j: List Resource Types (`neo4jListResourceTypes`)**
    *   **功能:** 查詢指定商家下已存在的所有資源類型。
    *   **參數:** `businessId` (必填)。
    *   **輸出:** 包含資源類型字串的列表，例如 `[{ "resourceType": "Table" }, { "resourceType": "Seat" }]`。

### Service Operations

*   **Neo4j: Create Service (`neo4jCreateService`)**
    *   **功能:** 為指定商家創建新的服務項目。
    *   **參數:** `businessId` (必填), `name` (必填), `duration_minutes` (必填), `description` (必填), `price` (可選)。
    *   **輸出:** 新創建的 Service 節點屬性 (包含 `service_id`)。
*   **Neo4j: Update Service (`neo4jUpdateService`)**
    *   **功能:** 根據 `serviceId` 更新服務資訊（支持部分更新）。
    *   **參數:** `serviceId` (必填), `name` (可選), `duration_minutes` (可選), `description` (可選), `price` (可選)。
    *   **輸出:** 更新後的 Service 節點屬性。
*   **Neo4j: Delete Service (`neo4jDeleteService`)**
    *   **功能:** 根據 `serviceId` 刪除服務及其關聯關係。
    *   **參數:** `serviceId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "deletedServiceId": "..." }`。

### Customer Operations

*   **Neo4j: Create Customer (`neo4jCreateCustomer`)**
    *   **功能:** 為指定商家創建新的客戶記錄並關聯用戶。通常在用戶首次與某商家互動（例如預約）前，由 AI Agent 判斷是否需要調用。
    *   **參數:** `businessId` (必填), `userId` (必填), `name` (必填), `phone` (必填), `email` (必填)。
    *   **輸出:** 新創建的 Customer 節點屬性 (包含 `customer_id`)。
*   **Neo4j: Find Customer by External ID & Business ID (`neo4jFindCustomerByExternalIdAndBusinessId`)**
    *   **功能:** 根據用戶 External ID 和商家 ID 查找客戶記錄。這是查找特定商家客戶的主要方式。
    *   **參數:** `externalId` (必填), `businessId` (必填)。
    *   **輸出:** 匹配的 Customer 節點屬性 (如果存在)。
*   **Neo4j: Update Customer (`neo4jUpdateCustomer`)**
    *   **功能:** 根據 `customerId` 更新客戶資訊（支持部分更新）。
    *   **參數:** `customerId` (必填), `name` (可選), `phone` (可選), `email` (可選)。
    *   **輸出:** 更新後的 Customer 節點屬性。
*   **Neo4j: Delete Customer (`neo4jDeleteCustomer`)**
    *   **功能:** 根據 `customerId` 刪除客戶及其關聯關係。
    *   **參數:** `customerId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "deletedCustomerId": "..." }`。

### Staff Operations

*   **Neo4j: Create Staff (`neo4jCreateStaff`)**
    *   **功能:** 為指定商家創建新的員工記錄。**注意:** 員工需後續通過流程與 User 帳號關聯。
    *   **參數:** `businessId` (必填), `name` (必填), `email` (可選)。
    *   **輸出:** 新創建的 Staff 節點屬性 (包含 `staff_id`)。
*   **Neo4j: Update Staff (`neo4jUpdateStaff`)**
    *   **功能:** 根據 `staffId` 更新員工資訊（支持部分更新）。
    *   **參數:** `staffId` (必填), `name` (可選), `email` (可選)。
    *   **輸出:** 更新後的 Staff 節點屬性。
*   **Neo4j: Delete Staff (`neo4jDeleteStaff`)**
    *   **功能:** 根據 `staffId` 刪除員工及其關聯關係 (例如可用性、服務能力)。
    *   **參數:** `staffId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "deletedStaffId": "..." }`。
*   **Neo4j: Link Staff to User (`neo4jLinkStaffToUser`)**
    *   **功能:** 將現有的員工記錄關聯到一個用戶帳號。通常在員工註冊或報到流程中使用。
    *   **參數:** `staffId` (必填), `userId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "staffId": "...", "userId": "..." }`。
*   **Neo4j: Link Staff to Service (`neo4jLinkStaffToService`)**
    *   **功能:** 指定某個員工可以提供哪些服務 (創建 `[:CAN_PROVIDE]` 關係)。
    *   **參數:** `staffId` (必填), `serviceId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "staffId": "...", "serviceId": "..." }`。
*   **Neo4j: Find Staff by External ID (`neo4jFindStaffByExternalId`)**
    *   **功能:** 根據用戶 External ID 查找關聯的員工記錄。假設員工已完成報到並關聯 User。
    *   **參數:** `externalId` (必填)。
    *   **輸出:** 匹配的 Staff 節點列表。

### Staff Availability Operations

*   **Neo4j Set Staff Availability (`neo4jSetStaffAvailability`)**
    *   **功能:** 設定或更新指定員工在特定星期幾的可用起訖時間。會覆蓋當天舊設定。
    *   **參數:** `staffId` (必填), `dayOfWeek` (必填, 0=Sun, 6=Sat), `startTime` (必填, HH:MM, UTC), `endTime` (必填, HH:MM, UTC)。
    *   **輸出:** 更新後的 StaffAvailability 記錄 (時間為 HH:MM UTC)。

### Booking & Availability Operations

*   **Neo4j Find Available Slots TimeOnly (`neo4jFindAvailableSlotsTimeOnly`)**
    *   **功能:** 根據時間查找可用的預約時間段 (僅考慮時間衝突)。
    *   **參數:** `businessId` (必填), `serviceId` (必填), `startDateTime` (必填, ISO8601 含時區), `endDateTime` (必填, ISO8601 含時區), `intervalMinutes` (可選, 預設 15)。
    *   **輸出:** 可用預約起始時間的列表 (UTC ISO 8601 格式)，例如 `[{ "availableSlot": "2025-04-16T02:00:00Z" }, ...]`。
*   **Neo4j Find Available Slots StaffOnly (`neo4jFindAvailableSlotsStaffOnly`)**
    *   **功能:** 根據時間和員工可用性查找可用的預約時間段。
    *   **參數:** `businessId` (必填), `serviceId` (必填), `startDateTime` (必填, ISO8601 含時區), `endDateTime` (必填, ISO8601 含時區), `intervalMinutes` (可選, 預設 15), `requiredStaffId` (必填)。
    *   **輸出:** 可用預約起始時間的列表 (UTC ISO 8601 格式)。
*   **Neo4j Find Available Slots ResourceOnly (`neo4jFindAvailableSlotsResourceOnly`)**
    *   **功能:** 根據時間和資源可用性查找可用的預約時間段。
    *   **參數:** `businessId` (必填), `serviceId` (必填), `startDateTime` (必填, ISO8601 含時區), `endDateTime` (必填, ISO8601 含時區), `intervalMinutes` (可選, 預設 15), `requiredResourceType` (必填), `requiredResourceCapacity` (可選, 預設 1)。
    *   **輸出:** 可用預約起始時間的列表 (UTC ISO 8601 格式)。
*   **Neo4j Find Available Slots StaffAndResource (`neo4jFindAvailableSlotsStaffAndResource`)**
    *   **功能:** 根據時間、員工和資源可用性查找可用的預約時間段。
    *   **參數:** `businessId` (必填), `serviceId` (必填), `startDateTime` (必填, ISO8601 含時區), `endDateTime` (必填, ISO8601 含時區), `intervalMinutes` (可選, 預設 15), `requiredStaffId` (必填), `requiredResourceType` (必填), `requiredResourceCapacity` (可選, 預設 1)。
    *   **輸出:** 可用預約起始時間的列表 (UTC ISO 8601 格式)。
*   **Neo4j Create Booking (`neo4jCreateBooking`)**
    *   **功能:** 創建新的預約記錄並建立關聯。**前提:** Customer, Business, Service (及可選的 Staff) 必須已存在。AI Agent/工作流程需負責在調用此節點前確保 Customer 存在或創建 Customer。
    *   **參數:** `customerId` (必填), `businessId` (必填), `serviceId` (必填), `bookingTime` (必填, ISO8601 含時區), `staffId` (可選), `notes` (可選)。
    *   **輸出:** 新創建的 Booking 節點屬性 (包含 `booking_id`)。
*   **Neo4j Update Booking (`neo4jUpdateBooking`)**
    *   **功能:** 根據 `bookingId` 更新預約資訊（支持部分更新）。
    *   **參數:** `bookingId` (必填), `bookingTime` (可選, ISO8601 含時區), `status` (可選), `staffId` (可選, 留空以移除關係), `notes` (可選)。
    *   **輸出:** 更新後的 Booking 節點屬性。
*   **Neo4j: Delete Booking (`neo4jDeleteBooking`)**
    *   **功能:** 根據 `bookingId` 刪除預約及其關聯關係。
    *   **參數:** `bookingId` (必填)。
    *   **輸出:** 成功訊息 `{ "success": true, "deletedBookingId": "..." }`。

### Business Verification

*   **Neo4j Verify Business Setup (`neo4jVerifyBusinessSetup`)**
    *   **功能:** 檢查商家是否已完成所有必要設置，能夠開始接受預約。
    *   **參數:** `businessId` (必填)。
    *   **輸出:** 包含詳細檢查結果的 JSON 對象，包括 `overallStatus` ('ready' 或 'incomplete') 和 `recommendations`。

## 典型工作流程範例

### 範例 1：新用戶首次預約餐廳 (ResourceOnly)

1.  **(外部觸發)** 獲取用戶 `external_id`。
2.  **`FindUserByExternalId`**: 查找用戶是否存在。
3.  **(If User Not Found)** `CreateUser`: 創建新用戶。
4.  **(Get `userId`)** 從步驟 2 或 3 獲取用戶內部 `userId`。
5.  **(假設已知餐廳 `businessId`)**
6.  **`FindCustomerByExternalIdAndBusinessId`**: 檢查客戶記錄是否存在。
7.  **(If Customer Not Found)** `CreateCustomer`: 使用 `userId` 和 `businessId` 創建客戶記錄。
8.  **(Get `customerId`)** 從步驟 6 或 7 獲取客戶 `customerId`。
9.  **(假設已知服務 `serviceId`)**
10. **`ListResourceTypes`**: (可選) 查詢餐廳有哪些資源類型 (例如 'Table')。
11. **`FindAvailableSlotsResourceOnly`**: 提供 `businessId`, `serviceId`, 時間範圍 (ISO8601 含時區), `requiredResourceType='Table'`, (可選) `requiredResourceCapacity`。
12. **(用戶/AI 選擇時段)** 從返回結果中選擇一個 `availableSlot` (UTC ISO8601)。
13. **`CreateBooking`**: 提供 `customerId`, `businessId`, `serviceId`, `chosenSlot` (UTC ISO8601)。

### 範例 2：現有客戶預約理髮 (StaffAndResource)

1.  **(外部觸發)** 獲取用戶 `external_id`。
2.  **`FindUserByExternalId`**: 找到用戶 `userId`。
3.  **(假設已知沙龍 `businessId`)**
4.  **`FindCustomerByExternalIdAndBusinessId`**: 找到客戶 `customerId`。
5.  **(假設已知服務 `serviceId`)**
6.  **(假設已知員工 `staffId` 和資源類型 `resourceType='Seat'`)**
7.  **`FindAvailableSlotsStaffAndResource`**: 提供 `businessId`, `serviceId`, 時間範圍 (ISO8601 含時區), `requiredStaffId`, `requiredResourceType`。
8.  **(用戶/AI 選擇時段)**
9.  **`CreateBooking`**: 提供 `customerId`, `businessId`, `serviceId`, `chosenSlot` (UTC ISO8601), `staffId`。

### 範例 3：預約線上諮詢 (StaffOnly)

1.  **(外部觸發)** 獲取用戶 `external_id`。
2.  **`FindUserByExternalId`**: 找到用戶 `userId`。
3.  **(假設已知諮詢公司 `businessId`)**
4.  **`FindCustomerByExternalIdAndBusinessId`**: 找到客戶 `customerId`。
5.  **(假設已知服務 `serviceId`)**
6.  **(假設已知員工 `staffId`)**
7.  **`FindAvailableSlotsStaffOnly`**: 提供 `businessId`, `serviceId`, 時間範圍 (ISO8601 含時區), `requiredStaffId`。
8.  **(用戶/AI 選擇時段)**
9.  **`CreateBooking`**: 提供 `customerId`, `businessId`, `serviceId`, `chosenSlot` (UTC ISO8601), `staffId`。

### 範例 4：修改預約時間或狀態

1.  **(外部觸發/查找)** 獲取要修改的 `bookingId`。
2.  **`UpdateBooking`**: 提供 `bookingId` 和新的 `bookingTime` (UTC ISO8601) 或 `status`。

### 範例 5：商家管理資源

1.  **(商家操作)** 獲取商家 `businessId`。
2.  **`ListResourceTypes`**: 查看現有資源類型。
3.  **`CreateResource`**: 添加新資源 (例如新桌子 'T5')。
4.  **`UpdateResource`**: 修改資源屬性 (例如修改 'T1' 的容量)。
5.  **`DeleteResource`**: 刪除不再使用的資源。

### 範例 6：設定/更新商家營業時間

1.  **(商家操作)** 獲取商家 `businessId`。
2.  **`SetBusinessHours`**: 提供 `businessId` 和包含每天營業時間 (HH:MM UTC) 的 JSON 陣列。
3.  **(驗證)** 可選用 `GetBusinessHours` 檢查是否設定成功 (返回 HH:MM UTC)。

## 常見問題與除錯

*   **"Could not get parameter" 錯誤:** 通常表示節點的輸入數據結構有問題，或者 `getNodeParameter` 的預設值與屬性定義不匹配。檢查上游節點的輸出和節點程式碼中的參數讀取邏輯。
*   **"Cannot read properties of null (reading 'low')" / 類型錯誤:** 常常發生在嘗試處理 Neo4j 特殊類型（如 Integer）或錯誤物件時。檢查 `neo4j.int()` 的使用（確保輸入非 null/undefined），以及錯誤處理函數 (`parseNeo4jError`) 是否能正確處理各種錯誤情況。
*   **Cypher 語法錯誤:** 直接在 Neo4j Browser 中測試節點內的 Cypher 查詢是個好方法。注意 `WITH` 子句在寫操作後繼續讀取/匹配時的必要性。
*   **節點未按預期創建/更新數據 (無錯誤):** 檢查 Cypher 查詢邏輯是否正確，參數是否正確傳遞（可添加日誌調試），以及是否存在未預期的資料庫約束或條件導致操作被靜默阻止。
*   **`FindAvailableSlots...` 結果不準確:** 檢查對應模式的 Cypher 查詢中時間比較、資源/員工匹配邏輯是否正確。`StaffAvailability` 和 `BusinessHours` 的時間範圍比較尤其需要注意（確保都在 UTC 基準下比較）。確保 `generateTimeSlotsWithBusinessHours` 函數（在節點內部）的邏輯正確。

## 兼容性

*   Minimum n8n version: (Requires testing, likely >=1.0)
*   Minimum Node.js version: >=18.10 (as specified in `package.json`)

## 資源

*   [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
*   [Neo4j Documentation](https://neo4j.com/docs/)
*   [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/current/)
