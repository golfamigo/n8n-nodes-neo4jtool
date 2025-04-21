# Neo4j 專用節點開發指令範例 (給 Generator AI)

**重要提示:** 請基於下方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板進行開發。模板已更新，包含了正確的 Neo4j 連線和錯誤處理邏輯。

## Neo4j 資料庫 Schema (根據計劃 v2 更新)

```json
[
  {
    "label": "Business",
    "attributes": {
      "business_id": "STRING unique indexed",
      "name": "STRING indexed",
      "type": "STRING indexed",
      "address": "STRING indexed",
      "phone": "STRING indexed",
      "email": "STRING indexed",
      "description": "STRING indexed",
      "booking_mode": "STRING indexed", // 新增: 'ResourceOnly', 'StaffOnly', 'StaffAndResource', 'TimeOnly'
      "created_at": "DATETIME", // Stored as UTC
      "updated_at": "DATETIME" // Stored as UTC
      // is_system 已移除
    },
    "relationships": {
      "OWNS": "User", // 反向關係，User 擁有 Business
      "EMPLOYS": "Staff",
      "OFFERS": "Service",
      "HAS_HOURS": "BusinessHours"
      "PROMOTES": "Advertisement",
      "HAS_RESOURCE": "Resource" // 新增
    }
  },
  {
    "label": "Resource", // 新增
    "attributes": {
      "resource_id": "STRING unique indexed",
      "business_id": "STRING indexed",
      "type": "STRING indexed", // 例如 'Table', 'Seat', 'Room'
      "name": "STRING indexed", // 例如 'Table 5', 'Window Seat 2'
      "capacity": "INTEGER", // 可選
      "properties": "MAP", // 可選
      "created_at": "DATETIME", // Stored as UTC
      "updated_at": "DATETIME" // Stored as UTC
    },
    "relationships": {
      // 由 Business 指向 -> HAS_RESOURCE
      // 由 Booking 指向 -> RESERVES_RESOURCE
    }
  },
  {
    "label": "Service",
    "attributes": {
      "service_id": "STRING unique indexed",
      "name": "STRING indexed",
      "duration_minutes": "INTEGER",
      "description": "STRING",
      "price": "INTEGER", // 可選
      "created_at": "DATETIME", // Stored as UTC
      "updated_at": "DATETIME" // Stored as UTC
      // is_system 已移除
    },
    "relationships": {
      // "BELONGS_TO_CATEGORY": "Category", // REMOVED
      "OFFERED_BY": "Business" // 反向關係
      // 由 Staff 指向 -> CAN_PROVIDE
      // 由 Booking 指向 -> FOR_SERVICE
      // 由 Advertisement 指向 -> ADVERTISES
    }
  },
  {
    "label": "Staff",
    "attributes": {
      "staff_id": "STRING unique indexed", // 應設為 unique
      "business_id": "STRING indexed",
      "name": "STRING indexed",
      "email": "STRING",
      "created_at": "DATETIME", // Stored as UTC
      "updated_at": "DATETIME" // Stored as UTC
      // is_system 已移除
    },
    "relationships": {
      "EMPLOYED_BY": "Business", // 反向關係
      "HAS_USER_ACCOUNT": "User",
      "HAS_AVAILABILITY": "StaffAvailability",
      "CAN_PROVIDE": "Service"
      // 由 Booking 指向 -> SERVED_BY
    }
  },
   {
    "label": "StaffAvailability",
    "attributes": {
      // 建議複合唯一鍵 (staff_id, day_of_week)
      "staff_id": "STRING indexed",
      "day_of_week": "INTEGER indexed", // 0-6 (0=Sunday)
      "start_time": "TIME", // Represents UTC time
      "end_time": "TIME", // Represents UTC time
      "created_at": "DATETIME", // Stored as UTC
      "updated_at": "DATETIME" // Stored as UTC
      // is_system 已移除
    },
    "relationships": {
       // 由 Staff 指向 -> HAS_AVAILABILITY
    }
  },
  {
    "label": "Booking",
    "attributes": {
      "booking_id": "STRING unique indexed",
      "customer_id": "STRING indexed",
      "business_id": "STRING indexed",
      "service_id": "STRING indexed",
      "booking_time": "DATETIME indexed", // Stored as UTC
      "status": "STRING indexed", // e.g., 'Confirmed', 'Cancelled', 'Completed'
      "notes": "STRING",
      "created_at": "DATETIME", // Stored as UTC
      "updated_at": "DATETIME" // Stored as UTC
      // is_system 已移除
    },
    "relationships": {
      "BOOKED_BY": "Customer", // 應為 MAKES 反向
      "AT_BUSINESS": "Business",
      "FOR_SERVICE": "Service",
      "SERVED_BY": "Staff", // 可選
      "RESERVES_RESOURCE": "Resource", // 新增, 可選
      "HAS_PAYMENT": "Payment"
    }
  },
  {
    "label": "Customer",
    "attributes": {
      "customer_id": "STRING unique indexed", // 應設為 unique
      "business_id": "STRING indexed", // 標識客戶屬於哪個商家
      "name": "STRING indexed",
      "phone": "STRING",
      "email": "STRING",
      "created_at": "DATETIME", // Stored as UTC
      "updated_at": "DATETIME" // Stored as UTC
      // is_system 已移除
    },
    "relationships": {
      "HAS_USER_ACCOUNT": "User",
      "REGISTERED_WITH": "Business",
      "HAS_MEMBERSHIP": "MembershipLevel", // 可選
      "MAKES": "Booking" // 反向關係
      // 由 Payment 指向 -> MADE_BY
    }
  },
  {
    "label": "User",
    "attributes": {
      "id": "STRING unique indexed", // 內部 UUID
      "external_id": "STRING unique indexed", // 外部應用 ID
      "name": "STRING",
      "email": "STRING unique indexed",
      "phone": "STRING unique indexed",
      "notification_enabled": "BOOLEAN", // 通用通知開關
      "created_at": "DATETIME", // Stored as UTC
      "updated_at": "DATETIME" // Stored as UTC
      // is_system, line_id, line_notification_enabled 已移除
    },
    "relationships": {
      "OWNS": "Business",
      "ACCOUNT_FOR": "Customer", // 反向關係
      "ACCOUNT_FOR_STAFF": "Staff" // 反向關係
    }
  },
  // REMOVED Category Definition
  // 其他輔助標籤 (MembershipLevel, Advertisement, BusinessHours, Payment, Subscription) 保持不變，移除 is_system
  {
    "label": "MembershipLevel",
    "attributes": { "level_name": "STRING unique indexed", "membership_level_id": "STRING indexed", "business_id": "STRING unique indexed" },
    "relationships": {}
  },
  {
    "label": "Advertisement",
    "attributes": { "title": "STRING", "business_id": "STRING indexed", "advertisement_id": "STRING unique indexed" },
    "relationships": { "ADVERTISES": "Service" }
  },
  {
    "label": "BusinessHours",
    "attributes": {
        "business_id": "STRING indexed",
        "day_of_week": "INTEGER indexed", // 0-6 (0=Sunday)
        "start_time": "TIME", // Represents UTC time
        "end_time": "TIME", // Represents UTC time
        "created_at": "DATETIME", // Stored as UTC
        "updated_at": "DATETIME" // Stored as UTC
      },
    "relationships": {}
  },
  {
    "label": "Payment",
    "attributes": { "amount": "FLOAT", "booking_id": "STRING indexed", "payment_id": "STRING unique indexed" },
    "relationships": { "MADE_BY": "Customer" }
  },
  {
    "label": "Subscription",
    "attributes": { "service_id": "STRING indexed", "subscription_id": "STRING unique indexed", "frequency": "STRING", "customer_id": "STRING indexed" },
    "relationships": {}
  }
]
```

---

請將以下指令之一放入 Generator AI System Prompt 的 `Specific Task Instruction` 部分。

**--- User Operations ---**

## 查找用戶 (FindUserByExternalId)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindUserByExternalId` 的 n8n 節點。
- `displayName`: 'Neo4j: Find User by External ID'
- `name`: `neo4jFindUserByExternalId`
- `description`: '根據 External ID 查找用戶。'
- **參數**:
    - `externalId` (string, required)
- **核心邏輯**: `execute` 方法應執行 `MATCH (u:User {external_id: $externalId}) RETURN u {.*} AS user`。

## 創建用戶 (CreateUser)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateUser` 的 n8n 節點。
- `displayName`: 'Neo4j: Create User'
- `name`: `neo4jCreateUser`
- `description`: '創建一個新的用戶記錄。'
- **參數**: (參考 User Schema 屬性, 均為 required)
    - `external_id` (string, required)
    - `name` (string, required)
    - `email` (string, required)
    - `phone` (string, required)
    - `notification_enabled` (boolean, required, default: false)
- **核心邏輯**: `execute` 方法應使用 `CREATE (u:User {id: randomUUID(), external_id: $external_id, name: $name, email: $email, phone: $phone, notification_enabled: $notification_enabled, created_at: datetime()}) RETURN u {.*} AS user`。

## 更新用戶 (UpdateUser)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateUser` 的 n8n 節點。
- `displayName`: 'Neo4j: Update User'
- `name`: `neo4jUpdateUser`
- `description`: '根據內部 User ID 更新用戶資訊。'
- **參數**:
    - `userId` (string, required, Description: '要更新的用戶內部 ID')
    - `name` (string, optional)
    - `email` (string, optional)
    - `phone` (string, optional)
    - `notification_enabled` (boolean, optional)
- **核心邏輯**: `execute` 方法應 `MATCH (u:User {id: $userId})`，然後使用 `SET` 更新所有提供的非空參數，並更新 `u.updated_at = datetime()`。返回更新後的 User 節點。

**--- Business Operations ---**

## 創建商家 (CreateBusiness)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateBusiness` 的 n8n 節點。
- `displayName`: 'Neo4j Create Business'
- `name`: `neo4jCreateBusiness`
- `description`: '創建一個新的商家記錄並關聯所有者。'
- **參數**:
    - `ownerUserId` (string, required, Description: '關聯的 User 節點的內部 ID (不是 external_id)')
    - `name` (string, required, Description: '商家名稱')
    - `type` (string, required, Description: '商家類型 (例如 Salon, Clinic)')
    - `address` (string, required, Description: '商家地址')
    - `phone` (string, required, Description: '商家聯繫電話')
    - `email` (string, required, placeholder: 'name@email.com', Description: '商家聯繫電子郵件')
    - `description` (string, required, Description: '商家描述')
    - `booking_mode` (string, required, default: 'TimeOnly', Description: '商家的預約檢查模式 (ResourceOnly, StaffOnly, StaffAndResource, TimeOnly)')
- **核心邏輯**: `MATCH (owner:User {id: $ownerUserId}) CREATE (b:Business {business_id: randomUUID(), name: $name, type: $type, address: $address, phone: $phone, email: $email, description: $description, booking_mode: $booking_mode, created_at: datetime()}) MERGE (owner)-[:OWNS]->(b) RETURN b {.*} AS business`

## 查找商家 (FindBusinessByName)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindBusinessByName` 的 n8n 節點。
- `displayName`: 'Neo4j: Find Business by Name'
- `name`: `neo4jFindBusinessByName`
- `description`: '根據名稱模糊查找商家 (Business) 節點。'
- **參數**:
    - `searchTerm` (string, required, Description: '用於商家名稱模糊匹配的關鍵字')
- **核心邏輯**: `execute` 方法應使用 `CONTAINS` 執行模糊名稱查找 `MATCH (b:Business) WHERE b.name CONTAINS $searchTerm RETURN b {.*, business_id: b.business_id} AS business`。

## 更新商家 (UpdateBusiness)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateBusiness` 的 n8n 節點。
- `displayName`: 'Neo4j Update Business'
- `name`: `neo4jUpdateBusiness`
- `description`: '根據 business_id 更新商家資訊。'
- **參數**:
    - `businessId` (string, required, Description: '要更新的商家 ID')
    - `name` (string, optional, Description: '新的商家名稱')
    - `type` (string, optional, Description: '新的商家類型')
    - `address` (string, optional, Description: '新的商家地址')
    - `phone` (string, optional, Description: '新的商家聯繫電話')
    - `email` (string, optional, placeholder: 'name@email.com', Description: '新的商家聯繫電子郵件')
    - `description` (string, optional, Description: '新的商家描述')
    - `booking_mode` (string, optional, Description: '新的商家預約檢查模式 (ResourceOnly, StaffOnly, StaffAndResource, TimeOnly)')
- **核心邏輯**: `MATCH (b:Business {business_id: $businessId}) SET [動態更新提供的參數], b.updated_at = datetime() RETURN b {.*} AS business` (如果沒有提供可選參數，則僅返回現有數據)。

## 刪除商家 (DeleteBusiness)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteBusiness` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Business'
- `name`: `neo4jDeleteBusiness`
- `description`: '根據 business_id 刪除商家及其關聯關係。'
- **參數**:
    - `businessId` (string, required, Description: '要刪除的商家 ID')
- **核心邏輯**: `execute` 方法應 `MATCH (b:Business {business_id: $businessId}) DETACH DELETE b`。注意：這會刪除商家及其所有關係，請謹慎使用。

## 查找商家服務 (FindServicesByBusiness)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindServicesByBusiness` 的 n8n 節點。
- `displayName`: 'Neo4j: Find Services by Business'
- `name`: `neo4jFindServicesByBusiness`
- `description`: '查找指定商家提供的所有服務項目。'
- **參數**:
    - `businessId` (string, required, Description: '要查詢的商家 ID')
- **核心邏輯**: `execute` 方法應執行 `MATCH (b:Business {business_id: $businessId})-[:OFFERS]->(s:Service) RETURN s {.*, service_id: s.service_id} AS service`。

**--- Business Hours Operations ---**

## 設定商家營業時間 (SetBusinessHours)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `SetBusinessHours` 的 n8n 節點。
- `displayName`: 'Neo4j Set Business Hours'
- `name`: `neo4jSetBusinessHours`
- `description`: '設定或更新指定商家的營業時間 (會覆蓋舊設定)。'
- **參數**:
    - `businessId` (string, required, Description: '要設定營業時間的商家 ID')
    - `hoursData` (string, required, default: '[{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]', Description: '包含每天營業時間的 JSON 陣列。格式: [{"day_of_week": 1-7, "start_time": "HH:MM", "end_time": "HH:MM"}, ...] (時間為 UTC)。如果某天休息，則不包含該天的物件。')
- **核心邏輯**:
    1. `MATCH (b:Business {business_id: $businessId}) OPTIONAL MATCH (b)-[r:HAS_HOURS]->(oldBh:BusinessHours) DELETE r, oldBh`
    2. `MATCH (b:Business {business_id: $businessId}) UNWIND $hoursData AS dayHours CREATE (bh:BusinessHours {business_id: $businessId, day_of_week: dayHours.day_of_week, start_time: time($startTime), end_time: time($endTime), created_at: datetime()}) MERGE (b)-[:HAS_HOURS]->(bh)` (對每個 hoursData 條目執行，使用 `toNeo4jTimeString` 格式化時間)

## 獲取商家營業時間 (GetBusinessHours)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `GetBusinessHours` 的 n8n 節點。
- `displayName`: 'Neo4j Get Business Hours'
- `name`: `neo4jGetBusinessHours`
- `description`: '獲取指定商家的營業時間列表。'
- **參數**:
    - `businessId` (string, required, Description: '要獲取營業時間的商家 ID')
- **核心邏輯**: `MATCH (b:Business {business_id: $businessId})-[:HAS_HOURS]->(bh:BusinessHours) RETURN bh { .day_of_week, start_time: apoc.temporal.format(bh.start_time, 'HH:mm'), end_time: apoc.temporal.format(bh.end_time, 'HH:mm') } AS businessHour ORDER BY bh.day_of_week`。

## 刪除商家營業時間 (DeleteBusinessHours)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteBusinessHours` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Business Hours'
- `name`: `neo4jDeleteBusinessHours`
- `description`: '刪除指定商家的所有營業時間記錄。'
- **參數**:
    - `businessId` (string, required)
- **核心邏輯**: `MATCH (b:Business {business_id: $businessId})-[r:HAS_HOURS]->(bh:BusinessHours) DETACH DELETE bh`。

**--- Resource Operations ---**

## 創建資源 (CreateResource)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateResource` 的 n8n 節點。
- `displayName`: 'Neo4j Create Resource'
- `name`: `neo4jCreateResource`
- `description`: '創建一個新的資源記錄並關聯到商家。'
- **參數**:
    - `businessId` (string, required, Description: '資源所屬的商家 ID')
    - `type` (string, required, Description: '資源類型 (例如 Table, Seat, Room). 建議先用 ListResourceTypes 查詢.')
    - `name` (string, required, Description: '資源名稱/編號 (例如 Table 5, Window Seat 2)')
    - `capacity` (number, optional, Description: '資源容量')
    - `propertiesJson` (json, optional, default: '{}', Description: '其他屬性 (JSON 格式, 例如 {"feature": "window_view"})')
- **核心邏輯**: `MATCH (b:Business {business_id: $businessId}) CREATE (r:Resource {resource_id: randomUUID(), business_id: $businessId, type: $type, name: $name, capacity: $capacity, properties: $propertiesJsonString, created_at: datetime()}) MERGE (b)-[:HAS_RESOURCE]->(r) RETURN r {.*} AS resource` (capacity 需轉為 Neo4j Integer 或 null, propertiesJson 需轉為 JSON 字串)

## 更新資源 (UpdateResource)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateResource` 的 n8n 節點。
- `displayName`: 'Neo4j Update Resource'
- `name`: `neo4jUpdateResource`
- `description`: '根據 resource_id 更新資源資訊。'
- **參數**:
    - `resourceId` (string, required, Description: '要更新的資源 ID')
    - `type` (string, optional, Description: '新的資源類型')
    - `name` (string, optional, Description: '新的資源名稱/編號')
    - `capacity` (number, optional, Description: '新的資源容量')
    - `propertiesJson` (json, optional, Description: '要更新或添加的其他屬性 (JSON 格式)。留空則不更新此項。')
- **核心邏輯**: `MATCH (r:Resource {resource_id: $resourceId}) SET [動態更新提供的參數], r.updated_at = datetime() RETURN r {.*} AS resource` (capacity 需轉為 Neo4j Integer, propertiesJson 需轉為 JSON 字串並使用 `r.properties = $propertiesJsonString`)。如果沒有提供可選參數，則僅返回現有數據。

## 刪除資源 (DeleteResource)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteResource` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Resource'
- `name`: `neo4jDeleteResource`
- `description`: '根據 resource_id 刪除資源及其關聯關係。'
- **參數**:
    - `resourceId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (r:Resource {resource_id: $resourceId}) DETACH DELETE r`。

## 列出資源類型 (ListResourceTypes)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `ListResourceTypes` 的 n8n 節點。
- `displayName`: 'Neo4j: List Resource Types'
- `name`: `neo4jListResourceTypes`
- `description`: '查詢指定商家下已存在的所有資源類型。'
- **參數**:
    - `businessId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (b:Business {business_id: $businessId})-[:HAS_RESOURCE]->(r:Resource) RETURN DISTINCT r.type AS resourceType`。

**--- Service Operations ---**

## 創建服務 (CreateService)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateService` 的 n8n 節點。
- `displayName`: 'Neo4j: Create Service'
- `name`: `neo4jCreateService`
- `description`: '為指定商家創建一個新的服務項目。'
- **參數**: (參考 Service Schema 屬性)
    - `businessId` (string, required)
    - `name` (string, required)
    - `duration_minutes` (integer, required)
    - `description` (string, required)
    - `price` (integer, optional)
    // - `categoryId` (string, optional) // REMOVED
- **核心邏輯**: `execute` 方法需先 `MATCH (b:Business {business_id: $businessId})`，然後 `CREATE (s:Service {service_id: randomUUID(), name: $name, duration_minutes: $duration_minutes, description: $description, price: $price, created_at: datetime()})`，接著 `MERGE (b)-[:OFFERS]->(s)`。返回創建的 Service 節點。

## 更新服務 (UpdateService)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateService` 的 n8n 節點。
- `displayName`: 'Neo4j: Update Service'
- `name`: `neo4jUpdateService`
- `description`: '根據 service_id 更新服務資訊。'
- **參數**:
    - `serviceId` (string, required)
    - `name` (string, optional)
    - `duration_minutes` (integer, optional)
    - `description` (string, optional)
    - `price` (integer, optional)
    // - `categoryId` (string, optional, Description: '新的或更新的 Category ID (留空以移除)') // REMOVED
- **核心邏輯**: `execute` 方法應 `MATCH (s:Service {service_id: $serviceId})`，使用 `SET` 更新提供的基本屬性及 `s.updated_at = datetime()`。返回更新後的 Service 節點。

## 刪除服務 (DeleteService)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteService` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Service'
- `name`: `neo4jDeleteService`
- `description`: '根據 service_id 刪除服務及其關聯關係。'
- **參數**:
    - `serviceId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (s:Service {service_id: $serviceId}) DETACH DELETE s`。

**--- Customer Operations ---**

## 創建客戶 (CreateCustomer)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateCustomer` 的 n8n 節點。
- `displayName`: 'Neo4j: Create Customer'
- `name`: `neo4jCreateCustomer`
- `description`: '為指定商家創建一個新的客戶資料並關聯用戶。'
- **參數**: (參考 Customer Schema 屬性)
    - `businessId` (string, required)
    - `userId` (string, required)
    - `name` (string, required)
    - `phone` (string, required)
    - `email` (string, required)
- **核心邏輯**: `execute` 方法需先 `MATCH (b:Business {business_id: $businessId}), (u:User {id: $userId})`，然後 `CREATE (c:Customer {customer_id: randomUUID(), name: $name, business_id: $businessId, phone: $phone, email: $email, created_at: datetime()})`，接著 `MERGE (c)-[:REGISTERED_WITH]->(b)` 和 `MERGE (c)-[:HAS_USER_ACCOUNT]->(u)`。返回創建的 Customer 節點。


## 查找客戶 (FindCustomerByExternalIdAndBusinessId)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindCustomerByExternalIdAndBusinessId` 的 n8n 節點。
- `displayName`: 'Neo4j: Find Customer by External ID & Business ID'
- `name`: `neo4jFindCustomerByExternalIdAndBusinessId`
- `description`: '根據用戶 External ID 和商家 ID 查找客戶記錄。'
- **參數**:
    - `externalId` (string, required, Description: '用戶的 External ID')
    - `businessId` (string, required, Description: '客戶註冊的商家 ID')
- **核心邏輯**: `execute` 方法應執行 `MATCH (u:User {external_id: $externalId})<-[:HAS_USER_ACCOUNT]-(c:Customer)-[:REGISTERED_WITH]->(b:Business {business_id: $businessId}) RETURN c {.*} AS customer`。如果找不到，表示該用戶尚未成為該商家的客戶。

## 更新客戶 (UpdateCustomer)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateCustomer` 的 n8n 節點。
- `displayName`: 'Neo4j: Update Customer'
- `name`: `neo4jUpdateCustomer`
- `description`: '根據 customer_id 更新客戶資訊。'
- **參數**:
    - `customerId` (string, required)
    - `name` (string, optional)
    - `phone` (string, optional)
    - `email` (string, optional)
- **核心邏輯**: `execute` 方法應 `MATCH (c:Customer {customer_id: $customerId})`，使用 `SET` 更新提供的屬性及 `c.updated_at = datetime()`。返回更新後的 Customer 節點。

## 刪除客戶 (DeleteCustomer)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteCustomer` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Customer'
- `name`: `neo4jDeleteCustomer`
- `description`: '根據 customer_id 刪除客戶及其關聯關係。'
- **參數**:
    - `customerId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (c:Customer {customer_id: $customerId}) DETACH DELETE c`。

**--- Staff Operations ---**

## 創建員工 (CreateStaff)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateStaff` 的 n8n 節點。
- `displayName`: 'Neo4j: Create Staff'
- `name`: `neo4jCreateStaff`
- `description`: '為指定商家創建一個新的員工記錄。'
- **參數**:
    - `businessId` (string, required)
    - `name` (string, required)
    - `email` (string, required)
- **核心邏輯**: `execute` 方法需先 `MATCH (b:Business {business_id: $businessId})`，然後 `CREATE (st:Staff {staff_id: randomUUID(), business_id: $businessId, name: $name, email: $email, created_at: datetime()})`，接著 `MERGE (b)-[:EMPLOYS]->(st)`。返回創建的 Staff 節點。

## 查找員工 (FindStaffByExternalId)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindStaffByExternalId` 的 n8n 節點。
- `displayName`: 'Neo4j: Find Staff by External ID'
- `name`: `neo4jFindStaffByExternalId`
- `description`: '根據用戶 External ID 查找關聯的員工記錄。'
- **參數**:
    - `externalId` (string, required, Description: '用戶的 External ID')
- **核心邏輯**: `execute` 方法應執行 `MATCH (u:User {external_id: $externalId})<-[:HAS_USER_ACCOUNT]-(st:Staff) RETURN st {.*} AS staff`。

## 更新員工 (UpdateStaff)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateStaff` 的 n8n 節點。
- `displayName`: 'Neo4j: Update Staff'
- `name`: `neo4jUpdateStaff`
- `description`: '根據 staff_id 更新員工資訊。'
- **參數**:
    - `staffId` (string, required)
    - `name` (string, optional)
    - `email` (string, optional)
- **核心邏輯**: `execute` 方法應 `MATCH (st:Staff {staff_id: $staffId})`，使用 `SET` 更新提供的屬性及 `st.updated_at = datetime()`。返回更新後的 Staff 節點。

## 刪除員工 (DeleteStaff)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteStaff` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Staff'
- `name`: `neo4jDeleteStaff`
- `description`: '根據 staff_id 刪除員工及其關聯關係 (例如可用性、服務能力)。'
- **參數**:
    - `staffId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (st:Staff {staff_id: $staffId}) DETACH DELETE st`。

## 關聯員工與用戶帳號 (LinkStaffToUser)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `LinkStaffToUser` 的 n8n 節點。
- `displayName`: 'Neo4j: Link Staff to User'
- `name`: `neo4jLinkStaffToUser`
- `description`: '將現有的員工記錄關聯到一個用戶帳號。'
- **參數**:
    - `staffId` (string, required)
    - `userId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (st:Staff {staff_id: $staffId}), (u:User {id: $userId}) MERGE (st)-[:HAS_USER_ACCOUNT]->(u)`。

## 分配服務給員工 (LinkStaffToService)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `LinkStaffToService` 的 n8n 節點。
- `displayName`: 'Neo4j: Link Staff to Service'
- `name`: `neo4jLinkStaffToService`
- `description`: '指定某個員工可以提供哪些服務。'
- **參數**:
    - `staffId` (string, required)
    - `serviceId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (st:Staff {staff_id: $staffId}), (s:Service {service_id: $serviceId}) MERGE (st)-[:CAN_PROVIDE]->(s)`。

**--- Staff Availability Operations ---**

## 設定員工可用性 (SetStaffAvailability)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `SetStaffAvailability` 的 n8n 節點。
- `displayName`: 'Neo4j Set Staff Availability'
- `name`: `neo4jSetStaffAvailability`
- `description`: '設定或更新指定員工在特定星期幾的可用起訖時間。'
- **參數**:
    - `staffId` (string, required, Description: '目標員工的 staff_id')
    - `dayOfWeek` (string, required, default: '1', Description: '星期幾 (0-6, 0 是星期日, 1 是星期一)')
    - `startTime` (string, required, default: '09:00', placeholder: 'HH:MM', Description: '開始時間 (HH:MM 格式)')
    - `endTime` (string, required, default: '17:00', placeholder: 'HH:MM', Description: '結束時間 (HH:MM 格式)')
- **核心邏輯**:
    1. `MATCH (st:Staff {staff_id: $staffId})-[r:HAS_AVAILABILITY]->(sa:StaffAvailability) WHERE sa.day_of_week = $dayOfWeek DELETE r, sa`
    2. `MATCH (st:Staff {staff_id: $staffId}) CREATE (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability {staff_id: $staffId, day_of_week: $dayOfWeek, start_time: time($startTime), end_time: time($endTime), created_at: datetime()}) RETURN sa {...}` (dayOfWeek 需轉為 Neo4j Integer, startTime/endTime 使用 `toNeo4jTimeString` 格式化)

**--- Booking & Availability Operations ---**

<!-- ## 查找可用時段 (FindAvailableSlots)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindAvailableSlots` 的 n8n 節點。
- `displayName`: 'Neo4j: Find Available Slots'
- `name`: `neo4jFindAvailableSlots`
- `description`: '根據商家的預約模式查找可用的預約時間段。'
- **參數**:
    - `businessId` (string, required)
    - `serviceId` (string, required)
    - `startDateTime` (string, required, ISO8601)
    - `endDateTime` (string, required, ISO8601)
    - `requiredResourceType` (string, optional, Description: '如果需要特定資源類型')
    - `requiredResourceCapacity` (integer, optional, Description: '如果需要特定資源容量')
    - `requiredStaffId` (string, optional, Description: '如果需要特定員工')
- **核心邏輯**:
    1.  `MATCH (b:Business {business_id: $businessId})` 獲取 `booking_mode`。
    2.  `MATCH (s:Service {service_id: $serviceId})` 獲取 `duration_minutes`。
    3.  生成 `startDateTime` 到 `endDateTime` 之間的潛在時間點列表 (需查詢 `BusinessHours` 節點，只生成在營業時間內的時段)。

    3.  生成 `startDateTime` 到 `endDateTime` 之間的潛在時間點列表 (基於 UTC 比較，並查詢結構化的 `BusinessHours` 節點)。
    4.  對於每個潛在時間點 `slot`：
        *   計算 `slotEnd = slot + duration`。
        *   根據 `b.booking_mode` 執行檢查：
            *   **Resource Check** (if mode includes 'Resource'): 查找是否有**至少一個**符合 `requiredResourceType` 和 `requiredResourceCapacity` 的 `Resource` (r)，且該資源在 `[slot, slotEnd)` 時間段內**沒有**被 `Booking` (bk) `[:RESERVES_RESOURCE]`。
            *   **Staff Check** (if mode includes 'Staff'): 查找是否有**至少一個**符合 `requiredStaffId` (或任何能提供服務的員工) 的 `Staff` (st)，其 `StaffAvailability` (視為 UTC 時間) 覆蓋 `[slot, slotEnd)` (UTC)，且在該時間段內**沒有**被 `Booking` (bk) `[:SERVED_BY]`。
            *   **Time Check** (if mode is 'TimeOnly'): 檢查 `[slot, slotEnd)` 是否與任何 `(bk:Booking)-[:AT_BUSINESS]->(b)` 衝突。
        *   如果所有必要的檢查都通過，則將 `slot` 加入結果。
    5.  返回可用時間段列表 (UTC ISO 8601 格式)。

		- **特別注意**：
  - 該節點處理複雜的日期時間和數值計算，必須正確處理 Neo4j 返回的 Integer 和 DateTime 類型
  - 在處理營業時間和其他屬性時，使用 `convertNeo4jValueToJs` 函數轉換 Neo4j 數據類型
  - 日期時間比較需要考慮格式和時區問題
612 | -->

## 查找可用時段 (TimeOnly)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindAvailableSlotsTimeOnly` 的 n8n 節點。
- `displayName`: 'Neo4j Find Available Slots TimeOnly'
- `name`: `neo4jFindAvailableSlotsTimeOnly`
- `description`: '根據時間查找可用的預約時間段 (僅考慮時間衝突)'
- **參數**:
    - `businessId` (string, required, Description: '要查詢可用時段的商家 ID')
    - `serviceId` (string, required, Description: '要預約的服務 ID (用於獲取時長)')
    - `startDateTime` (string, required, Description: '查詢範圍的開始時間 (ISO 8601 格式, 需含時區)')
    - `endDateTime` (string, required, Description: '查詢範圍的結束時間 (ISO 8601 格式, 需含時區)')
    - `intervalMinutes` (number, default: 15, Description: '生成潛在預約時段的時間間隔（分鐘）')
- **核心邏輯**:
    1. 查詢商家信息 (確保 `booking_mode` 為 'TimeOnly')、服務時長和營業時間。
    2. 使用 `generateTimeSlotsWithBusinessHours` 生成潛在時段。
    3. 執行 Cypher 查詢：`UNWIND $potentialSlots AS slotStr WITH datetime(slotStr) AS slotStart ... MATCH (b:Business {business_id: $businessId}) MATCH (s:Service {service_id: $serviceId}) ... WITH b, s, slotStart, duration({minutes: s.duration_minutes}) AS serviceDuration, slotStart + serviceDuration AS slotEnd MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours) WHERE bh.day_of_week = date(slotStart).dayOfWeek AND time(bh.start_time) <= time(slotStart) AND time(bh.end_time) >= time(slotEnd) WITH b, slotStart, slotEnd WHERE NOT EXISTS { MATCH (bk:Booking)-[:AT_BUSINESS]->(b) WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: $durationMinutes}) > slotStart } RETURN toString(slotStart) AS availableSlot ORDER BY availableSlot`

## 查找可用時段 (StaffOnly)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindAvailableSlotsStaffOnly` 的 n8n 節點。
- `displayName`: 'Neo4j Find Available Slots StaffOnly'
- `name`: `neo4jFindAvailableSlotsStaffOnly`
- `description`: '根據時間和員工可用性查找可用的預約時間段'
- **參數**:
    - `businessId` (string, required, Description: '要查詢可用時段的商家 ID')
    - `serviceId` (string, required, Description: '要預約的服務 ID (用於獲取時長)')
    - `startDateTime` (string, required, Description: '查詢範圍的開始時間 (ISO 8601 格式, 需含時區)')
    - `endDateTime` (string, required, Description: '查詢範圍的結束時間 (ISO 8601 格式, 需含時區)')
    - `intervalMinutes` (number, default: 15, Description: '生成潛在預約時段的時間間隔（分鐘）')
    - `requiredStaffId` (string, required, Description: '指定員工的 ID（在 StaffOnly 模式下必填）')
- **核心邏輯**:
    1. 查詢商家信息 (確保 `booking_mode` 為 'StaffOnly')、服務時長、營業時間和指定員工信息 (確認存在且能提供服務)。
    2. 使用 `generateTimeSlotsWithBusinessHours` 生成潛在時段。
    3. 執行 Cypher 查詢：`UNWIND $potentialSlots AS slotStr WITH datetime(slotStr) AS slotStart ... MATCH (b:Business {business_id: $businessId}) MATCH (s:Service {service_id: $serviceId}) ... WITH b, s, slotStart, duration({minutes: s.duration_minutes}) AS serviceDuration, slotStart + serviceDuration AS slotEnd MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours) WHERE ... MATCH (b)-[:EMPLOYS]->(st:Staff {staff_id: $requiredStaffId}) WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) } AND EXISTS { MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability) WHERE sa.day_of_week = date(slotStart).dayOfWeek AND time(sa.start_time) <= time(slotStart) AND time(sa.end_time) >= time(slotEnd) } AND NOT EXISTS { MATCH (bk:Booking)-[:SERVED_BY]->(st) WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: $durationMinutes}) > slotStart } WITH b, st, slotStart, slotEnd WHERE NOT EXISTS { MATCH (bk:Booking)-[:AT_BUSINESS]->(b) WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: $durationMinutes}) > slotStart AND NOT EXISTS { MATCH (bk)-[:SERVED_BY]->(st) } } RETURN toString(slotStart) AS availableSlot, st.name AS staffName ORDER BY availableSlot`

## 查找可用時段 (ResourceOnly)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindAvailableSlotsResourceOnly` 的 n8n 節點。
- `displayName`: 'Neo4j Find Available Slots ResourceOnly'
- `name`: `neo4jFindAvailableSlotsResourceOnly`
- `description`: '根據時間和資源可用性查找可用的預約時間段'
- **參數**:
    - `businessId` (string, required, Description: '要查詢可用時段的商家 ID')
    - `serviceId` (string, required, Description: '要預約的服務 ID (用於獲取時長)')
    - `startDateTime` (string, required, Description: '查詢範圍的開始時間 (ISO 8601 格式, 需含時區)')
    - `endDateTime` (string, required, Description: '查詢範圍的結束時間 (ISO 8601 格式, 需含時區)')
    - `intervalMinutes` (number, default: 15, Description: '生成潛在預約時段的時間間隔（分鐘）')
    - `requiredResourceType` (string, required, Description: '所需資源類型（如 Chair、Room、Table 等），必填')
    - `requiredResourceCapacity` (number, default: 1, Description: '所需資源容量（預設為 1）')
- **核心邏輯**:
    1. 查詢商家信息 (確保 `booking_mode` 為 'ResourceOnly')、服務時長、營業時間和符合條件的資源數量。
    2. 使用 `generateTimeSlotsWithBusinessHours` 生成潛在時段。
    3. 執行 Cypher 查詢：`UNWIND $potentialSlots AS slotStr WITH datetime(slotStr) AS slotStart ... MATCH (b:Business {business_id: $businessId}) MATCH (s:Service {service_id: $serviceId}) ... WITH b, s, slotStart, duration({minutes: s.duration_minutes}) AS serviceDuration, slotStart + serviceDuration AS slotEnd MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours) WHERE ... MATCH (b)-[:HAS_RESOURCE]->(r:Resource) WHERE r.type = $requiredResourceType AND r.capacity >= $requiredResourceCapacity OPTIONAL MATCH (bk:Booking)-[:AT_BUSINESS]->(b) WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: $durationMinutes}) > slotStart WITH slotStart, count(r) AS totalResources, count(bk) AS concurrentBookings WHERE totalResources > concurrentBookings RETURN toString(slotStart) AS availableSlot, totalResources, totalResources - concurrentBookings AS availableResourcesCount ORDER BY availableSlot`

## 查找可用時段 (StaffAndResource)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindAvailableSlotsStaffAndResource` 的 n8n 節點。
- `displayName`: 'Neo4j Find Available Slots StaffAndResource'
- `name`: `neo4jFindAvailableSlotsStaffAndResource`
- `description`: '根據時間、員工和資源可用性查找可用的預約時間段'
- **參數**:
    - `businessId` (string, required, Description: '要查詢可用時段的商家 ID')
    - `serviceId` (string, required, Description: '要預約的服務 ID (用於獲取時長)')
    - `startDateTime` (string, required, Description: '查詢範圍的開始時間 (ISO 8601 格式, 需含時區)')
    - `endDateTime` (string, required, Description: '查詢範圍的結束時間 (ISO 8601 格式, 需含時區)')
    - `intervalMinutes` (number, default: 15, Description: '生成潛在預約時段的時間間隔（分鐘）')
    - `requiredStaffId` (string, required, Description: '指定員工的 ID（在 StaffAndResource 模式下必填）')
    - `requiredResourceType` (string, required, Description: '需要的資源類型 (例如 Chair, Table)（在 StaffAndResource 模式下必填）')
    - `requiredResourceCapacity` (number, default: 1, Description: '所需資源的最小容量')
- **核心邏輯**:
    1. 查詢商家信息 (確保 `booking_mode` 為 'StaffAndResource')、服務時長、營業時間、指定員工信息和符合條件的資源列表。
    2. 使用 `generateTimeSlotsWithBusinessHours` 生成潛在時段。
    3. 執行 Cypher 查詢：`UNWIND $potentialSlots AS slotStr WITH datetime(slotStr) AS slotStart ... MATCH (b:Business {business_id: $businessId}) MATCH (s:Service {service_id: $serviceId}) ... WITH b, s, slotStart, duration({minutes: s.duration_minutes}) AS serviceDuration, slotStart + serviceDuration AS slotEnd MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours) WHERE ... MATCH (b)-[:EMPLOYS]->(st:Staff {staff_id: $requiredStaffId}) WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) } AND EXISTS { MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability) WHERE ... } AND NOT EXISTS { MATCH (bk:Booking)-[:SERVED_BY]->(st) WHERE ... } WITH b, st, slotStart, slotEnd, serviceDuration MATCH (b)-[:HAS_RESOURCE]->(r:Resource) WHERE r.type = $requiredResourceType AND r.capacity >= $requiredResourceCapacity WITH b, st, slotStart, slotEnd, serviceDuration, collect(r) AS availableResources, count(r) AS totalResourceCount OPTIONAL MATCH (bk:Booking)-[:AT_BUSINESS]->(b) WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: $durationMinutes}) > slotStart AND NOT EXISTS { MATCH (bk)-[:SERVED_BY]->(st) } WITH slotStart, st.name AS staffName, availableResources, totalResourceCount, count(bk) AS concurrentBookings WHERE concurrentBookings < totalResourceCount WITH slotStart, staffName, [r IN availableResources | {id: r.resource_id, name: r.name, type: r.type, capacity: r.capacity}] AS resourceDetails, totalResourceCount, concurrentBookings, totalResourceCount - concurrentBookings AS availableResourceCount RETURN toString(slotStart) AS availableSlot, staffName, totalResourceCount, concurrentBookings, availableResourceCount, resourceDetails ORDER BY availableSlot`

## 創建預約 (CreateBooking)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateBooking` 的 n8n 節點。
- `displayName`: 'Neo4j Create Booking'
- `name`: `neo4jCreateBooking`
- `description`: '創建一個新的預約記錄並建立必要的關聯。'
- **參數**:
    - `customerId` (string, required, Description: '進行預約的客戶 ID')
    - `businessId` (string, required, Description: '預約的商家 ID')
    - `serviceId` (string, required, Description: '預約的服務 ID')
    - `bookingTime` (string, required, Description: '預約開始時間 (ISO 8601 格式，需含時區)')
    - `staffId` (string, optional, Description: '指定服務員工 ID')
    - `notes` (string, optional, Description: '預約備註')
- **核心邏輯**: `MATCH (c:Customer {customer_id: $customerId}) MATCH (b:Business {business_id: $businessId}) MATCH (s:Service {service_id: $serviceId}) [OPTIONAL MATCH (st:Staff {staff_id: $staffId})] CREATE (bk:Booking {booking_id: randomUUID(), customer_id: $customerId, business_id: $businessId, service_id: $serviceId, booking_time: datetime($bookingTime), status: 'Confirmed', notes: $notes, created_at: datetime()}) MERGE (c)-[:MAKES]->(bk) MERGE (bk)-[:AT_BUSINESS]->(b) MERGE (bk)-[:FOR_SERVICE]->(s) [OPTIONAL MERGE (bk)-[:SERVED_BY]->(st)] RETURN bk {.*} AS booking` (bookingTime 使用 `toNeo4jDateTimeString` 格式化)

## 更新預約 (UpdateBooking)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateBooking` 的 n8n 節點。
- `displayName`: 'Neo4j Update Booking'
- `name`: `neo4jUpdateBooking`
- `description`: '根據 booking_id 更新預約資訊（例如狀態、時間、備註）。'
- **參數**:
    - `bookingId` (string, required, Description: '要更新的預約 ID')
    - `bookingTime` (string, optional, Description: '新的預約開始時間 (ISO 8601 格式, 需含時區)')
    - `status` (string, optional, Description: '新的預約狀態 (例如 Confirmed, Cancelled, Completed)')
    - `staffId` (string, optional, Description: '更新服務員工 ID (留空以移除)')
    - `notes` (string, optional, Description: '新的預約備註')
- **核心邏輯**: `MATCH (bk:Booking {booking_id: $bookingId}) [SET [動態更新提供的參數], bk.updated_at = datetime()] [WITH bk OPTIONAL MATCH (bk)-[r:SERVED_BY]->() DELETE r] [WITH bk MATCH (st:Staff {staff_id: $staffId}) MERGE (bk)-[:SERVED_BY]->(st)] RETURN bk {.*} AS booking` (bookingTime 使用 `toNeo4jDateTimeString` 格式化)

## 刪除預約 (DeleteBooking)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteBooking` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Booking'
- `name`: `neo4jDeleteBooking`
- `description`: '根據 booking_id 刪除預約及其關聯關係。'
- **參數**:
    - `bookingId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (bk:Booking {booking_id: $bookingId}) DETACH DELETE bk`。

**--- Business Verification ---**

## 驗證商家設置 (VerifyBusinessSetup)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `VerifyBusinessSetup` 的 n8n 節點。
- `displayName`: 'Neo4j Verify Business Setup'
- `name`: `neo4jVerifyBusinessSetup`
- `description`: '檢查商家是否已完成所有必要設置，能夠開始接受預約'
- **參數**:
    - `businessId` (string, required, Description: '要檢查設置的商家 ID')
- **核心邏輯**:
    1. 查詢商家基本資料 (`MATCH (b:Business {business_id: $businessId}) RETURN b {.*}`)。
    2. 檢查基本資料完整性 (name, phone, email, address, booking_mode)。
    3. 查詢營業時間 (`MATCH (b)-[:HAS_HOURS]->(bh) RETURN bh {...}`) 並檢查是否已設定及完整。
    4. 查詢服務項目 (`MATCH (b)-[:OFFERS]->(s) RETURN s {.*}`) 並檢查是否存在及完整性 (如 duration_minutes)。
    5. 根據 `booking_mode` 執行額外檢查：
        - **StaffOnly/StaffAndResource**: 查詢員工 (`MATCH (b)-[:EMPLOYS]->(st) OPTIONAL MATCH (st)-[:CAN_PROVIDE]->(s) OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(sa) RETURN st {.*}, count(s), count(sa)`) 並檢查是否存在、是否關聯服務、是否設定可用時間。
        - **ResourceOnly/StaffAndResource**: 查詢資源 (`MATCH (b)-[:HAS_RESOURCE]->(r) RETURN r {.*}`) 並檢查是否存在及完整性 (如 type, capacity)。
    6. 根據檢查結果匯總 `overallStatus` ('ready' 或 'incomplete') 和 `recommendations`。
    7. 返回包含所有檢查結果的 JSON 對象。

## 重要開發注意事項

1. **處理 Neo4j 數據類型**：
   - Neo4j 驅動程序返回的數據類型（如 Integer, DateTime 等）需要特殊處理才能在 JavaScript 中正確使用
   - 請始終使用 `convertNeo4jValueToJs` 函數處理從 Neo4j 查詢返回的數據
   - 特別是處理 Integer 類型時，請務必使用此函數進行轉換，否則可能導致不兼容的類型錯誤

2. **查詢結果處理**：
   - 使用 `runCypherQuery` 函數執行查詢並自動處理結果格式化
   - 對於需要手動處理查詢結果的情況，記得使用 `convertNeo4jValueToJs` 處理每個返回的值

# 時間處理指南

## 基本原則

所有節點在處理時間時必須遵循以下原則：

1. **統一使用 UTC 時區**：
   - 所有內部時間儲存和計算均使用 UTC 時區
   - 輸入時間若無明確時區，預設視為 UTC
   - 輸出時間始終包含時區信息 (ISO 8601 格式)

2. **統一使用共用函數**：
   - 使用 `timeUtils.ts` 中提供的函數處理所有時間相關操作
   - 禁止直接操作時間字符串或自行實現時間轉換邏輯

3. **清晰的參數說明**：
   - 所有時間輸入參數必須明確標示格式要求
   - 例如：`預約時間 (ISO 8601 格式, 需含時區)`

## 時間處理工具函數

`timeUtils.ts` 提供以下主要函數：

- `normalizeDateTime`: 將任意時間輸入轉換為標準 ISO 8601 UTC 字符串
- `normalizeTimeOnly`: 提取時間部分 (HH:MM:SS)
- `toNeo4jDateTimeString`: 轉換為適用於 Neo4j datetime() 函數的格式
- `toNeo4jTimeString`: 轉換為適用於 Neo4j time() 函數的格式
- `compareTimeOnly`: 比較兩個時間值 (僅時間部分)
- `isTimeInRange`: 檢查時間是否在特定範圍內
- `addMinutesToDateTime`: 在日期時間上添加分鐘數
- `getIsoWeekday`: 獲取指定日期是星期幾 (1-7 for ISO, 0-6 for Neo4j internal)
- `generateTimeSlots`: 生成指定範圍內的時間槽
- `generateTimeSlotsWithBusinessHours`: 生成考慮業務營業時間的時間槽

## 資料結構時間格式標準

| 節點類型 | 時間屬性 | 儲存格式 | 備註 |
|---------|---------|---------|------|
| Business | created_at, updated_at | Neo4j DateTime | 存儲為 UTC |
| Staff | created_at, updated_at | Neo4j DateTime | 存儲為 UTC |
| StaffAvailability | start_time, end_time | Neo4j Time | 表示 UTC 時間 |
| BusinessHours | start_time, end_time | Neo4j Time | 表示 UTC 時間 |
| Booking | booking_time | Neo4j DateTime | 存儲為 UTC |

## 時間處理最佳實踐

### 1. 在 Cypher 查詢中使用

```cypher
// 良好示例：使用參數化查詢和適當的類型轉換
MATCH (b:Business {business_id: $businessId})
CREATE (bh:BusinessHours {
  day_of_week: $dayOfWeek, // 傳入 Neo4j Integer
  start_time: time($startTime),  // 使用 $startTime 參數 (HH:MM:SS 格式)
  end_time: time($endTime),      // 使用 $endTime 參數 (HH:MM:SS 格式)
  created_at: datetime()         // 使用 Neo4j 內建函數
})
CREATE (b)-[:HAS_HOURS]->(bh)
```

### 2. 在 TypeScript 中使用

```typescript
// 良好示例：使用 timeUtils 函數
import { toNeo4jTimeString, normalizeTimeOnly, toNeo4jDateTimeString } from '../neo4j/helpers/timeUtils';

// 處理時間輸入參數
const rawStartTime = this.getNodeParameter('startTime', i);
const startTime = normalizeTimeOnly(rawStartTime); // 確保格式
const neoStartTime = toNeo4jTimeString(startTime); // 轉換為 Neo4j 格式

// 處理日期時間輸入參數
const rawBookingTime = this.getNodeParameter('bookingTime', i);
const neoBookingTime = toNeo4jDateTimeString(rawBookingTime); // 轉換為 Neo4j 格式

// 執行查詢
const query = `
  MATCH (st:Staff {staff_id: $staffId})
  CREATE (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability {
    day_of_week: $dayOfWeek,
    start_time: time($startTime),
    end_time: time($endTime),
    created_at: datetime()
  })
  RETURN sa
`;

const parameters = {
  staffId,
  dayOfWeek: neo4j.int(dayOfWeek), // 確保是 Neo4j Integer
  startTime: neoStartTime,
  endTime: neoEndTime
};

// 執行查詢
const results = await runCypherQuery.call(this, session, query, parameters, true, i);
```

### 3. 處理返回結果

```typescript
// 良好示例：正確處理返回的時間值
import { normalizeDateTime, normalizeTimeOnly } from '../neo4j/helpers/timeUtils';
import { convertNeo4jValueToJs } from '../neo4j/helpers/utils';

// 在結果中處理日期時間
const bookingTimeRaw = record.get('booking_time'); // Neo4j DateTime object
const bookingTimeISO = normalizeDateTime(convertNeo4jValueToJs(bookingTimeRaw)); // 轉換為 ISO 字符串

// 在結果中處理時間
const startTimeRaw = record.get('start_time'); // Neo4j Time object
const startTimeString = normalizeTimeOnly(convertNeo4jValueToJs(startTimeRaw)); // 轉換為 HH:MM:SS 字符串
```

## 常見錯誤和避免方法

1. **直接比較不同格式時間**：
   - ❌ 錯誤: `bh.start_time <= time(slotStart)` (如果 bh.start_time 不是 time 類型)
   - ✅ 正確: `time(toString(bh.start_time)) <= time(toString(slotStart))` (在 Cypher 中轉換為 time) 或在 TS 中使用 `compareTimeOnly`

2. **忽略時區處理**：
   - ❌ 錯誤: `booking_time: new Date(bookingTime).toISOString()` (可能丟失原始時區或產生錯誤 UTC)
   - ✅ 正確: `booking_time: datetime(toNeo4jDateTimeString(bookingTime))` (使用工具函數確保 UTC)

3. **字符串拼接或處理日期時間**：
   - ❌ 錯誤: `startTime.split('T')[1].split('.')[0]`
   - ✅ 正確: `normalizeTimeOnly(startTime)` (使用工具函數)
