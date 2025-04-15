# Neo4j 常用操作與 Cypher 查詢 (基於 Schema 分析)

## 注意事項

*   **參數化查詢:** 以下查詢使用 `$parameterName` 語法表示參數。在 n8n 中，應將參數值傳遞給 Neo4j 節點的 `parameters` 欄位（如果可用）或安全地嵌入查詢字串。
*   **唯一性:** `MERGE` 語句依賴於節點的唯一標識符（如 `business_id`, `service_id`, `email` 等）。請確保用於 `MERGE` 的屬性在你的資料中確實具有唯一性約束，或根據實際情況調整匹配邏輯。
*   **時間戳:** 查詢中使用了 `datetime()` 函數生成時間戳，請確保你的 Neo4j 版本支援。
*   **事務:** 單一查詢具有原子性。跨多個查詢的事務需在 n8n 工作流層面處理。
*   **錯誤處理:** 實際流程中應加入錯誤處理邏輯。

## Business (商家)

**1. 創建或更新商家 (Create/Update Business)**
   *   需求：需要擁有者 User ID (`ownerUserId`) 和商家詳細資訊。
   *   邏輯：根據 `business_id` 查找或創建商家，設定屬性，並確保與擁有者的 `[:OWNS]` 關係存在。
   *   Cypher:
     ```cypher
     // Parameters: $ownerUserId, $businessId, $name, $type, $address, $phone, $email, $description
     MATCH (u:User {id: $ownerUserId})
     MERGE (b:Business {business_id: $businessId}) // Find or create business by unique ID
     ON CREATE SET b.name = $name, b.type = $type, b.address = $address, b.phone = $phone, b.email = $email, b.description = $description, b.created_at = datetime(), b.updated_at = datetime(), b.is_system = false
     ON MATCH SET b.name = $name, b.type = $type, b.address = $address, b.phone = $phone, b.email = $email, b.description = $description, b.updated_at = datetime()
     MERGE (u)-[:OWNS]->(b) // Ensure ownership relationship
     RETURN b {.*, business_id: b.business_id} AS business
     ```

**2. 按名稱查找商家 (Find Business by Name - Fuzzy)**
   *   Cypher:
     ```cypher
     // Parameter: $searchTerm
     MATCH (b:Business) WHERE b.name CONTAINS $searchTerm RETURN b {.*, business_id: b.business_id} AS business
     ```

**3. 按 ID 查找商家 (Find Business by ID)**
   *   Cypher:
     ```cypher
     // Parameter: $businessId
     MATCH (b:Business {business_id: $businessId}) RETURN b {.*, business_id: b.business_id} AS business
     ```

**4. 獲取商家提供的服務 (Get Business Services)**
   *   Cypher:
     ```cypher
     // Parameter: $businessId
     MATCH (b:Business {business_id: $businessId})-[:OFFERS]->(s:Service) RETURN s {.*, service_id: s.service_id} AS service
     ```

**5. 獲取商家員工 (Get Business Staff)**
   *   Cypher:
     ```cypher
     // Parameter: $businessId
     MATCH (b:Business {business_id: $businessId})-[:EMPLOYS]->(s:Staff) RETURN s {.*, staff_id: s.staff_id} AS staff
     ```

## Staff (員工)

**1. 新增員工至商家 (Add Staff to Business)**
   *   需求：需要商家 ID (`businessId`) 和員工詳細資訊。假設 `staff_id` 由外部提供或生成。
   *   邏輯：根據 `staff_id` 查找或創建員工，設定屬性，並確保與商家的 `[:EMPLOYS]` 關係存在。
   *   Cypher:
     ```cypher
     // Parameters: $businessId, $staffId, $name, $email, $phone (optional)
     MATCH (b:Business {business_id: $businessId})
     MERGE (s:Staff {staff_id: $staffId}) // Use staff_id if available, or email if unique
     ON CREATE SET s.name = $name, s.email = $email, s.phone = $phone, s.business_id = $businessId, s.created_at = datetime(), s.updated_at = datetime(), s.is_system = false
     ON MATCH SET s.name = $name, s.email = $email, s.phone = $phone, s.updated_at = datetime()
     MERGE (b)-[:EMPLOYS]->(s)
     RETURN s {.*, staff_id: s.staff_id} AS staff
     ```
     *注意: Schema 未保證 Staff email 唯一性，使用 staff_id 更可靠。*

**2. 為員工分配可提供的服務 (Assign Service to Staff)**
   *   需求：需要員工 ID (`staffId`) 和服務 ID (`serviceId`)。
   *   邏輯：查找員工和服務，創建或確認 `[:CAN_PROVIDE]` 關係。
   *   Cypher:
     ```cypher
     // Parameters: $staffId, $serviceId
     MATCH (s:Staff {staff_id: $staffId})
     MATCH (svc:Service {service_id: $serviceId})
     MERGE (s)-[:CAN_PROVIDE]->(svc)
     RETURN s.name AS staffName, svc.name AS serviceName
     ```

## Service (服務)

**1. 創建或更新服務 (Create/Update Service)**
   *   需求：需要商家 ID (`businessId`) 和服務詳細資訊。
   *   邏輯：根據 `service_id` 查找或創建服務，設定屬性，確保與商家的 `[:OFFERS]` 關係，並可選地關聯到分類。
   *   Cypher:
     ```cypher
     // Parameters: $businessId, $serviceId, $name, $durationMinutes, $description, $price, $categoryId (optional)
     MATCH (b:Business {business_id: $businessId})
     MERGE (svc:Service {service_id: $serviceId})
     ON CREATE SET svc.name = $name, svc.duration_minutes = $durationMinutes, svc.description = $description, svc.price = $price, svc.created_at = datetime(), svc.updated_at = datetime(), svc.is_system = false
     ON MATCH SET svc.name = $name, svc.duration_minutes = $durationMinutes, svc.description = $description, svc.price = $price, svc.updated_at = datetime()
     MERGE (b)-[:OFFERS]->(svc)
     // 可選：處理分類關係 (如果 categoryId 提供)
     WITH svc, $categoryId AS categoryId WHERE categoryId IS NOT NULL AND categoryId <> ''
     MATCH (cat:Category {category_id: categoryId})
     MERGE (svc)-[:BELONGS_TO_CATEGORY]->(cat)
     RETURN svc {.*, service_id: svc.service_id} AS service // 返回服務本身
     // 如果不需要處理分類，則移除 WITH 到 MERGE (svc)-...->(cat) 的部分，直接 RETURN svc
     ```

**2. 按名稱查找服務 (Find Service by Name - Fuzzy)**
   *   Cypher:
     ```cypher
     // Parameter: $searchTerm
     MATCH (svc:Service) WHERE svc.name CONTAINS $searchTerm RETURN svc {.*, service_id: svc.service_id} AS service
     ```

## Customer (顧客)

**1. 創建或更新顧客 (Create/Update Customer)**
   *   需求：需要商家 ID (`businessId`)、關聯的 User ID (`userId`) 和顧客詳細資訊。假設 `customer_id` 由外部提供或生成。
   *   邏輯：根據 `customer_id` 查找或創建顧客，設定屬性，確保與商家 (`[:REGISTERED_WITH]`) 和用戶 (`[:HAS_USER_ACCOUNT]`) 的關係。
   *   Cypher:
     ```cypher
     // Parameters: $businessId, $userId, $customerId, $name, $phone, $email
     MATCH (b:Business {business_id: $businessId})
     MATCH (u:User {id: $userId})
     MERGE (c:Customer {customer_id: $customerId}) // Assuming customerId is provided/generated
     ON CREATE SET c.name = $name, c.phone = $phone, c.email = $email, c.business_id = $businessId, c.created_at = datetime(), c.updated_at = datetime(), c.is_system = false
     ON MATCH SET c.name = $name, c.phone = $phone, c.email = $email, c.updated_at = datetime()
     MERGE (c)-[:REGISTERED_WITH]->(b)
     MERGE (c)-[:HAS_USER_ACCOUNT]->(u)
     RETURN c {.*, customer_id: c.customer_id} AS customer
     ```

**2. 按電話或 Email 查找顧客 (Find Customer by Phone/Email)**
   *   Cypher:
     ```cypher
     // Parameters: $phone, $email (至少提供一個)
     MATCH (c:Customer) WHERE c.phone = $phone OR c.email = $email RETURN c {.*, customer_id: c.customer_id} AS customer LIMIT 1 // 通常只需要一個
     ```

## Booking (預約)

**1. 創建預約 (Create Booking)**
   *   需求：需要顧客 ID (`customerId`)、商家 ID (`businessId`)、服務 ID (`serviceId`)、預約時間 (`bookingTime`)，可選員工 ID (`staffId`) 和備註 (`notes`)。假設 `booking_id` 由外部生成。
   *   邏輯：查找相關實體，創建 `:Booking` 節點和必要的關係。
   *   Cypher:
     ```cypher
     // Parameters: $bookingId, $customerId, $businessId, $serviceId, $bookingTime (ISO 8601 string), $staffId (optional), $notes (optional)
     MATCH (c:Customer {customer_id: $customerId})
     MATCH (b:Business {business_id: $businessId})
     MATCH (svc:Service {service_id: $serviceId})
     // 可選匹配員工
     OPTIONAL MATCH (staff:Staff {staff_id: $staffId}) WHERE $staffId IS NOT NULL AND $staffId <> ''
     // 創建 Booking 節點
     CREATE (bk:Booking {booking_id: $bookingId, customer_id: $customerId, business_id: $businessId, service_id: $serviceId, staff_id: $staffId, booking_time: datetime($bookingTime), status: 'Confirmed', notes: $notes, created_at: datetime(), updated_at: datetime(), is_system: false})
     // 創建關係
     MERGE (c)-[:MAKES]->(bk)
     MERGE (bk)-[:AT_BUSINESS]->(b)
     MERGE (bk)-[:FOR_SERVICE]->(svc)
     // 如果匹配到員工，創建關係
     WITH bk, staff WHERE staff IS NOT NULL
     MERGE (bk)-[:SERVED_BY]->(staff)
     RETURN bk {.*, booking_id: bk.booking_id} AS booking // 返回 Booking 節點
     // 如果不需要返回員工關係部分，可以簡化
     ```

**2. 按顧客查找預約 (Find Bookings by Customer)**
   *   Cypher:
     ```cypher
     // Parameter: $customerId
     MATCH (c:Customer {customer_id: $customerId})-[:MAKES]->(bk:Booking)
     RETURN bk {.*, booking_id: bk.booking_id} AS booking ORDER BY bk.booking_time DESC
     ```

**3. 按商家和日期範圍查找預約 (Find Bookings by Business/Date Range)**
   *   Cypher:
     ```cypher
     // Parameters: $businessId, $startTime (ISO 8601 string), $endTime (ISO 8601 string)
     MATCH (b:Business {business_id: $businessId})<-[:AT_BUSINESS]-(bk:Booking)
     WHERE datetime($startTime) <= bk.booking_time < datetime($endTime)
     RETURN bk {.*, booking_id: bk.booking_id} AS booking ORDER BY bk.booking_time
