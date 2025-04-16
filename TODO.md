# Neo4j 節點包待改進事項

1.  **Category 管理節點:**
    *   **現狀:** Schema 中已定義 `Category` 節點及與 `Business` 和 `Service` 的關係。`CreateService` 和 `UpdateService` 節點支持關聯到已存在的 Category。
    *   **待辦:** 目前缺少專門用於創建、更新、刪除和查找 `Category` 實體的 n8n 節點。
    *   **原因:** 考慮到目標用戶為小企業，暫緩實現以簡化節點列表。
    *   **未來:** 如果用戶反饋需要更精細的服務分類管理功能，或者 AI Agent 需要查詢分類信息，可以開發 `Neo4jCreateCategory`, `Neo4jUpdateCategory`, `Neo4jDeleteCategory`, `Neo4jFindCategoriesByBusiness` 等節點。

2.  **結構化 BusinessHours:**
    *   **現狀:** `Business.business_hours` 屬性目前存儲為自由格式的字串。Schema 中預留了 `BusinessHours` 節點和 `[:HAS_HOURS]` 關係。
    *   **待辦:** `CreateBusiness`, `UpdateBusiness` 節點尚未支持創建/更新結構化的 `BusinessHours` 節點。`FindAvailableSlots` 節點的 Cypher 查詢也尚未完全實現基於 `BusinessHours` 節點的營業時間過濾。
    *   **未來:** 開發管理 `BusinessHours` 的節點，並完善 `FindAvailableSlots` 的查詢邏輯，以實現更精確的基於營業時間的可用性判斷。

3.  **`FindAvailableSlots` 查詢優化:**
    *   **現狀:** `FindAvailableSlots` 中的 Cypher 查詢邏輯（特別是生成潛在時間點和檢查 `StaffAvailability` 的部分）目前較為簡化。
    *   **待辦:** 需要根據實際性能需求和更複雜的業務規則（如不同日期的特殊營業時間、員工休息時間等）進一步優化和完善查詢。可能需要引入 APOC 函數或將部分邏輯移至節點的 TypeScript 代碼中處理。

4.  **`FindCustomer` 節點:**
    *   **現狀:** 在預約工作流程範例中，提到了需要一個 `FindCustomer` 節點來查找客戶 ID，但目前尚未創建。
    *   **待辦:** 開發 `Neo4jFindCustomer` 節點，可以根據 `userId` 和 `businessId`，或者根據客戶姓名/電話/郵件（在特定商家範圍內）進行查找。

5.  **MCP 工具參數問題:**
    *   **現狀:** `neo4j` MCP 伺服器的 `write-neo4j-cypher` 工具似乎不支持參數化查詢，導致創建測試數據時需要將參數嵌入查詢字串。
    *   **待辦:** 如果可能，調查或聯繫 MCP 伺服器提供者，確認正確的參數傳遞方式，或者考慮在節點包內部實現一個更健壯的 Cypher 執行方式（如果需要繞過 MCP）。
