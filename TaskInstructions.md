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
      "BELONGS_TO_CATEGORY": "Category",
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
      "day_of_week": "INTEGER indexed", // 1-7
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
      "BOOKED_BY": "Customer",
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
  {
    "label": "Category",
    "attributes": {
      "category_id": "STRING unique indexed",
      "business_id": "STRING indexed",
      "name": "STRING"
      // is_system 已移除
    },
    "relationships": {
      "BELONGS_TO": "Business"
      // 由 Service 指向 -> BELONGS_TO_CATEGORY
    }
  },
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
        "day_of_week": "INTEGER indexed", 
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
- `displayName`: 'Neo4j: Create Business'
- `name`: `neo4jCreateBusiness`
- `description`: '創建一個新的商家記錄並關聯所有者。'
- **參數**: (參考 Business Schema 屬性)
    - `ownerUserId` (string, required, Description: '關聯的 User 節點的內部 ID')
    - `name` (string, required)
    - `type` (string, required, Description: '商家類型 (例如 Salon, Clinic)')
    - `address` (string, required)
    - `phone` (string, required)
    - `email` (string, required)
    - `description` (string, required)
    - `booking_mode` (string, required, type: options, options: ['ResourceOnly', 'StaffOnly', 'StaffAndResource', 'TimeOnly'], Description: '商家的預約檢查模式')
- **核心邏輯**: `execute` 方法需先 `MATCH (owner:User {id: $ownerUserId})`，然後 `CREATE (b:Business {business_id: randomUUID(), name: $name, type: $type, address: $address, phone: $phone, email: $email, description: $description, booking_mode: $booking_mode, created_at: datetime()})`，設定所有提供的屬性，最後 `MERGE (owner)-[:OWNS]->(b)` 建立關係。返回創建的 Business 節點。

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
- `displayName`: 'Neo4j: Update Business'
- `name`: `neo4jUpdateBusiness`
- `description`: '根據 business_id 更新商家資訊。'
- **參數**:
    - `businessId` (string, required, Description: '要更新的商家 ID')
    - `name` (string, optional)
    - `type` (string, optional)
    - `address` (string, optional)
    - `phone` (string, optional)
    - `email` (string, optional)
    - `description` (string, optional)
    - `booking_mode` (string, optional, type: options, options: ['ResourceOnly', 'StaffOnly', 'StaffAndResource', 'TimeOnly'])
- **核心邏輯**: `execute` 方法應 `MATCH (b:Business {business_id: $businessId})`，然後使用 `SET` 更新所有提供的非空參數，並更新 `b.updated_at = datetime()`。返回更新後的 Business 節點。

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

**--- Business Hours Operations ---**

## 設定商家營業時間 (SetBusinessHours)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `SetBusinessHours` 的 n8n 節點。
- `displayName`: 'Neo4j: Set Business Hours'
- `name`: `neo4jSetBusinessHours`
- `description`: '設定或更新指定商家的營業時間 (會覆蓋舊設定)。'
- **參數**:
    - `businessId` (string, required)
    - `hoursData` (json, required, Description: '包含每天營業時間的 JSON 陣列，格式：`[{"day_of_week": 1, "start_time": "HH:MM", "end_time": "HH:MM"}, ...]` (時間應為 UTC)。如果某天休息，則不包含該天的物件。')
- **核心邏輯**: 
    1. `MATCH (b:Business {business_id: $businessId})`
    2. `OPTIONAL MATCH (b)-[r:HAS_HOURS]->(oldBh:BusinessHours) DELETE r, oldBh` (刪除舊的營業時間)
    3. `UNWIND $hoursData AS dayHours` (展開輸入的 JSON 陣列)
    4. `CREATE (bh:BusinessHours {business_id: $businessId, day_of_week: dayHours.day_of_week, start_time: time(dayHours.start_time), end_time: time(dayHours.end_time), created_at: datetime()})`
    5. `MERGE (b)-[:HAS_HOURS]->(bh)`

## 獲取商家營業時間 (GetBusinessHours)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `GetBusinessHours` 的 n8n 節點。
- `displayName`: 'Neo4j: Get Business Hours'
- `name`: `neo4jGetBusinessHours`
- `description`: '獲取指定商家的營業時間列表。'
- **參數**:
    - `businessId` (string, required)
- **核心邏輯**: `MATCH (b:Business {business_id: $businessId})-[:HAS_HOURS]->(bh:BusinessHours) RETURN bh { .day_of_week, start_time: toString(bh.start_time), end_time: toString(bh.end_time) } ORDER BY bh.day_of_week`。

## 刪除商家營業時間 (DeleteBusinessHours)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteBusinessHours` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Business Hours'
- `name`: `neo4jDeleteBusinessHours`
- `description`: '刪除指定商家的所有營業時間記錄。'
- **參數**:
    - `businessId` (string, required)
- **核心邏輯**: `MATCH (b:Business {business_id: $businessId})-[r:HAS_HOURS]->(bh:BusinessHours) DETACH DELETE bh`。

- **參數**:
    - `businessId` (string, required, Description: '要查詢的商家 ID')
- **核心邏輯**: `execute` 方法應執行 `MATCH (b:Business {business_id: $businessId})-[:OFFERS]->(s:Service) RETURN s {.*, service_id: s.service_id} AS service`。

**--- Resource Operations ---**

## 創建資源 (CreateResource)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateResource` 的 n8n 節點。
- `displayName`: 'Neo4j: Create Resource'
- `name`: `neo4jCreateResource`
- `description`: '創建一個新的資源記錄並關聯到商家。'
- **參數**:
    - `businessId` (string, required)
    - `type` (string, required, Description: '資源類型, 建議先用 ListResourceTypes 查詢')
    - `name` (string, required, Description: '資源名稱/編號')
    - `capacity` (integer, optional)
    - `properties` (json, optional, Description: '其他屬性 (JSON 格式)')
- **核心邏輯**: `execute` 方法需先 `MATCH (b:Business {business_id: $businessId})`，然後 `CREATE (r:Resource {resource_id: randomUUID(), business_id: $businessId, type: $type, name: $name, capacity: $capacity, properties: $propertiesJsonString, created_at: datetime()})`，最後 `MERGE (b)-[:HAS_RESOURCE]->(r)`。返回創建的 Resource 節點。

## 更新資源 (UpdateResource)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateResource` 的 n8n 節點。
- `displayName`: 'Neo4j: Update Resource'
- `name`: `neo4jUpdateResource`
- `description`: '根據 resource_id 更新資源資訊。'
- **參數**:
    - `resourceId` (string, required)
    - `type` (string, optional)
    - `name` (string, optional)
    - `capacity` (integer, optional)
    - `properties` (json, optional)
- **核心邏輯**: `execute` 方法應 `MATCH (r:Resource {resource_id: $resourceId})`，使用 `SET` 更新提供的參數（`properties` 需轉為 JSON 字串）及 `r.updated_at = datetime()`。返回更新後的 Resource 節點。

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
    - `categoryId` (string, optional)
- **核心邏輯**: `execute` 方法需先 `MATCH (b:Business {business_id: $businessId})`，可選 `MATCH (c:Category {category_id: $categoryId})`，然後 `CREATE (s:Service {service_id: randomUUID(), name: $name, duration_minutes: $duration_minutes, description: $description, price: $price, created_at: datetime()})`，接著 `MERGE (b)-[:OFFERS]->(s)`，如果提供了 categoryId 則 `MERGE (s)-[:BELONGS_TO_CATEGORY]->(c)`。返回創建的 Service 節點。

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
    - `categoryId` (string, optional, Description: '新的或更新的 Category ID (留空以移除)')
- **核心邏輯**: `execute` 方法應 `MATCH (s:Service {service_id: $serviceId})`，使用 `SET` 更新提供的基本屬性及 `s.updated_at = datetime()`。如果提供了 `categoryId`，需要額外處理 `BELONGS_TO_CATEGORY` 關係（先刪除舊關係再創建新關係）。返回更新後的 Service 節點。

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
- **核心邏輯**: `execute` 方法應執行 `MATCH (u:User {external_id: $externalId})-[:HAS_USER_ACCOUNT]->(c:Customer)-[:REGISTERED_WITH]->(b:Business {business_id: $businessId}) RETURN c {.*} AS customer`。如果找不到，表示該用戶尚未成為該商家的客戶。

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


## 查找員工 (FindStaffByExternalId)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `FindStaffByExternalId` 的 n8n 節點。
- `displayName`: 'Neo4j: Find Staff by External ID'
- `name`: `neo4jFindStaffByExternalId`
- `description`: '根據用戶 External ID 查找關聯的員工記錄。'
- **參數**:
    - `externalId` (string, required, Description: '用戶的 External ID')
    - `businessId` (string, optional, Description: '如果用戶可能在多個商家任職，可指定商家 ID 進行過濾')
- **核心邏輯**: `execute` 方法應執行 `MATCH (u:User {external_id: $externalId})-[:HAS_USER_ACCOUNT]->(st:Staff)`。如果提供了 `businessId`，則追加 `MATCH (st)-[:EMPLOYED_BY]->(b:Business {business_id: $businessId})`。返回匹配的 Staff 節點列表。

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateStaff` 的 n8n 節點。
- `displayName`: 'Neo4j: Create Staff'
- `name`: `neo4jCreateStaff`
- `description`: '為指定商家創建一個新的員工記錄。'
- **參數**:
    - `businessId` (string, required)
    - `name` (string, required)
    - `email` (string, optional)
    - `phone` (string, optional)
- **核心邏輯**: `execute` 方法需先 `MATCH (b:Business {business_id: $businessId})`，然後 `CREATE (st:Staff {staff_id: randomUUID(), business_id: $businessId, name: $name, email: $email, phone: $phone, created_at: datetime()})`，接著 `MERGE (b)-[:EMPLOYS]->(st)`。返回創建的 Staff 節點。

## 更新員工 (UpdateStaff)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateStaff` 的 n8n 節點。
- `displayName`: 'Neo4j: Update Staff'
- `name`: `neo4jUpdateStaff`
- `description`: '根據 staff_id 更新員工資訊。'
- **參數**:
    - `staffId` (string, required)
    - `name` (string, optional)
    - `email` (string, optional)
    - `phone` (string, optional)
- **核心邏輯**: `execute` 方法應 `MATCH (st:Staff {staff_id: $staffId})`，使用 `SET` 更新提供的參數及 `st.updated_at = datetime()`。返回更新後的 Staff 節點。

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
    - `userId` (string, required, Description: '用戶的內部 ID')
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


## 設定員工可用性 (SetStaffAvailability)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `SetStaffAvailability` 的 n8n 節點。
- `displayName`: 'Neo4j: Set Staff Availability'
- `name`: `neo4jSetStaffAvailability`
- `description`: '設定或更新指定員工在特定星期幾的可用起訖時間。'
- **參數**:
    - `staffId` (string, required)
    - `dayOfWeek` (number, required, Description: '1=Mon, 7=Sun')
    - `startTime` (string, required, Description: 'HH:MM')
    - `endTime` (string, required, Description: 'HH:MM')
- **核心邏輯**: `execute` 方法需使用 `MERGE (sa:StaffAvailability {staff_id: $staffId, day_of_week: $dayOfWeek}) ON CREATE SET sa.start_time = time($startTime), sa.end_time = time($endTime), sa.created_at = datetime() ON MATCH SET sa.start_time = time($startTime), sa.end_time = time($endTime), sa.updated_at = datetime()`。

**--- Booking & Availability Operations ---**

## 查找可用時段 (FindAvailableSlots)

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

## 創建預約 (CreateBooking)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `CreateBooking` 的 n8n 節點。
- `displayName`: 'Neo4j: Create Booking'
- **前提條件**: 執行此節點前，必須確保提供的 `customerId`, `businessId`, `serviceId` (以及可選的 `staffId`, `resourceId`) 對應的記錄已存在於資料庫中。此節點不負責自動創建這些關聯實體。

- `name`: `neo4jCreateBooking`
- `description`: '創建一個新的預約記錄並建立必要的關聯（不進行可用性檢查）。'
- **參數**:
    - `customerId` (string, required)
    - `businessId` (string, required)
    - `serviceId` (string, required)
    - `bookingTime` (string, required, ISO8601)
    - `staffId` (string, optional)
    - `resourceId` (string, optional) # 新增
    - `notes` (string, optional)
- **核心邏輯**:
    1.  `MATCH` Customer, Business, Service。
    2.  可選 `MATCH` Staff (if `staffId` provided)。
    3.  可選 `MATCH` Resource (if `resourceId` provided)。
    4.  `CREATE` Booking 節點，包含所有屬性，`status: 'Confirmed'`, `created_at: datetime()`。
    5.  `MERGE` 關係: `[:BOOKED_BY]`, `[:AT_BUSINESS]`, `[:FOR_SERVICE]`。
    6.  可選 `MERGE` 關係: `[:SERVED_BY]` (if `staffId`), `[:RESERVES_RESOURCE]` (if `resourceId`)。
    7.  返回創建的 Booking 節點。

## 更新預約 (UpdateBooking)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `UpdateBooking` 的 n8n 節點。
- `displayName`: 'Neo4j: Update Booking'
- `name`: `neo4jUpdateBooking`
- `description`: '根據 booking_id 更新預約資訊。'
- **參數**:
    - `bookingId` (string, required)
    - `bookingTime` (string, optional, ISO8601)
    - `status` (string, optional)
    - `staffId` (string, optional, Description: '更新服務員工 ID (留空以移除)')
    - `resourceId` (string, optional, Description: '更新預約資源 ID (留空以移除)') # 新增
    - `notes` (string, optional)
- **核心邏輯**: `MATCH (bk:Booking {booking_id: $bookingId})`，使用 `SET` 更新提供的屬性（`bookingTime` 需為含時區的 ISO 8601 字串）及 `bk.updated_at = datetime()`。如果更新了 `staffId` 或 `resourceId`，需要處理對應的 `[:SERVED_BY]` 或 `[:RESERVES_RESOURCE]` 關係（先刪除舊關係再創建新關係）。返回更新後的 Booking 節點。

## 刪除預約 (DeleteBooking)

請參考上方提供的 **Neo4j 資料庫 Schema** 和最新的 **NodeTemplate.ts.txt** 模板，開發一個名為 `DeleteBooking` 的 n8n 節點。
- `displayName`: 'Neo4j: Delete Booking'
- `name`: `neo4jDeleteBooking`
- `description`: '根據 booking_id 刪除預約及其關聯關係。'
- **參數**:
    - `bookingId` (string, required)
- **核心邏輯**: `execute` 方法應 `MATCH (bk:Booking {booking_id: $bookingId}) DETACH DELETE bk`。

---
*(請根據 `neo4j_common_operations.md` 為其他需要的操作補充類似的指令)*
