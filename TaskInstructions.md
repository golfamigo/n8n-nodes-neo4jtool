# Neo4j 專用節點開發指令範例 (給 Generator AI)

請將以下指令之一放入 Generator AI System Prompt 的 `Specific Task Instruction` 部分。

## 查找商家 (FindBusinessByName)

基於模板和 Schema，開發一個名為 `FindBusinessByName` 的 n8n 節點。
- `displayName`: 'Neo4j: Find Business by Name'
- `name`: `neo4jFindBusinessByName`
- `description`: '根據名稱模糊查找商家 (Business) 節點。'
- **參數**:
    - `searchTerm` (Name: `searchTerm`, Type: `string`, Required: `true`, Description: '用於商家名稱模糊匹配的關鍵字')
- **核心邏輯**: `execute` 方法應使用 `CONTAINS` 執行模糊名稱查找 `MATCH (b:Business) WHERE b.name CONTAINS $searchTerm RETURN b {.*, business_id: b.business_id} AS business`。

## 設定員工可用性 (SetStaffAvailability)

基於模板和 Schema，開發一個名為 `SetStaffAvailability` 的 n8n 節點。
- `displayName`: 'Neo4j: Set Staff Availability'
- `name`: `neo4jSetStaffAvailability`
- `description`: '設定或更新指定員工在特定星期幾的可用起訖時間。'
- **參數**:
    - `staffId` (Name: `staffId`, Type: `string`, Required: `true`, Description: '目標員工的 staff_id')
    - `dayOfWeek` (Name: `dayOfWeek`, Type: `number`, Required: `true`, Description: '星期幾 (1=週一, 7=週日)')
    - `startTime` (Name: `startTime`, Type: `string`, Required: `true`, Description: '開始時間 (HH:MM 格式)')
    - `endTime` (Name: `endTime`, Type: `string`, Required: `true`, Description: '結束時間 (HH:MM 格式)')
- **核心邏輯**: `execute` 方法需使用 `MERGE` 查找或創建 `StaffAvailability` 節點（基於 `staff_id` 和 `day_of_week` 的唯一性），並使用 `ON CREATE SET` 和 `ON MATCH SET` 正確設定或更新 `start_time` 和 `end_time`（需要將 HH:MM 字串轉為 Neo4j Time 類型或保持字串，取決於 `utils.ts` 的實現）及時間戳（使用 `datetime()`），避免約束衝突。

## 創建預約 (CreateBooking)

基於模板和 Schema，開發一個名為 `CreateBooking` 的 n8n 節點。
- `displayName`: 'Neo4j: Create Booking'
- `name`: `neo4jCreateBooking`
- `description`: '創建一個新的預約記錄並建立必要的關聯。'
- **參數**:
    - `customerId` (string, required)
    - `businessId` (string, required)
    - `serviceId` (string, required)
    - `bookingTime` (string, required, ISO8601 格式)
    - `staffId` (string, optional)
    - `notes` (string, optional)
- **核心邏輯**: `execute` 方法需先 `MATCH` 查找 Customer, Business, Service, Optional Staff，然後 `CREATE` Booking 節點（使用 `randomUUID()` 生成 `booking_id`，狀態設為 'Confirmed'），並正確 `MERGE` 所有必要的關係 (`[:MAKES]`, `[:AT_BUSINESS]`, `[:FOR_SERVICE]`, `[:SERVED_BY]`)。確保 Customer 節點被正確匹配。

## 查找用戶 (FindUserByLineId)

基於模板和 Schema，開發一個名為 `FindUserByLineId` 的 n8n 節點。
- `displayName`: 'Neo4j: Find User by Line ID'
- `name`: `neo4jFindUserByLineId`
- `description`: '根據 Line ID 查找用戶。'
- **參數**:
    - `lineId` (string, required)
- **核心邏輯**: `execute` 方法應執行 `MATCH (u:User {line_id: $lineId}) RETURN u {.*} AS user`。

## 創建或更新用戶 (CreateOrUpdateUser)

基於模板和 Schema，開發一個名為 `CreateOrUpdateUser` 的 n8n 節點。
- `displayName`: 'Neo4j: Create/Update User'
- `name`: `neo4jCreateOrUpdateUser`
- `description`: '根據 external_id 查找或創建用戶，並在創建時生成內部 id。'
- **參數**:
    - `external_id` (string, required)
    - `name` (string, required)
    - `email` (string, required)
    - `phone` (string, required)
    - `line_id` (string, required)
    - `line_language_preference` (string, optional)
    - `line_notification_enabled` (boolean, optional)
    - `is_system` (boolean, optional)
- **核心邏輯**: `execute` 方法應使用 `MERGE (u:User {external_id: $external_id}) ON CREATE SET u.id = randomUUID(), ... ON MATCH SET ... RETURN u {.*} AS user` 的邏輯。

---
*(請根據 `neo4j_common_operations.md` 為其他需要的操作補充類似的指令)*
