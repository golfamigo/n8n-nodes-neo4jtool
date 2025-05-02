// resourceUtils.ts
// Neo4j 資源管理共用函數庫

import neo4j from 'neo4j-driver';
import type { IDataObject } from 'n8n-workflow';

// --- 新增輔助函數 ---

/**
 * 構建匹配資源類型的 Cypher 子句
 * @param rtVar 資源類型變數名稱
 * @param resourceTypeIdParam 資源類型 ID 參數名稱
 * @param businessIdParam 商家 ID 參數名稱
 * @returns Cypher MATCH 子句字符串
 */
function buildResourceTypeMatchClause(rtVar: string, resourceTypeIdParam: string, businessIdParam: string): string {
    return `
  // 獲取資源類型信息 - 支援雙向關聯
  MATCH (${rtVar}:ResourceType)
  WHERE ${rtVar}.type_id = ${resourceTypeIdParam} AND
        (${rtVar}.business_id = ${businessIdParam} OR EXISTS((${rtVar})-[:BELONGS_TO]->(:Business {business_id: ${businessIdParam}})))`;
}

/**
 * 構建檢查資源使用情況的 Cypher 子句
 * @param rtVar 資源類型變數名稱
 * @param startTimeVar 開始時間變數名稱
 * @param endTimeVar 結束時間變數名稱
 * @param serviceDurationVar 服務時長變數名稱 (用於計算預約結束時間)
 * @returns Cypher OPTIONAL MATCH 子句字符串
 */
function buildResourceUsageClause(rtVar: string, startTimeVar: string, endTimeVar: string, serviceDurationVar: string = 'serviceDuration'): string {
    // 注意：這裡假設 serviceDuration 變量在上下文中可用
    // 如果 serviceDuration 是參數名，需要調整為 ${serviceDurationParam}
    // 但在 generateResourceAvailabilityQuery 中，它通常是 WITH 子句中的變量
    return `
  // 檢查當前已使用的資源數量
  OPTIONAL MATCH (bk:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(${rtVar})
  WHERE bk.booking_time < ${endTimeVar} AND
        bk.booking_time + duration({minutes: ${serviceDurationVar}}) > ${startTimeVar}`;
}

// --- 主函數 ---

/**
 * 生成檢查資源可用性的 Cypher 查詢子句
 * @param resourceTypeIdParam 資源類型 ID 參數名稱
 * @param bookingTimeParam 預約時間參數名稱
 * @param serviceDurationParam 服務時長參數名稱
 * @param resourceQuantityParam 資源數量參數名稱
 * @param businessIdParam 商家 ID 參數名稱
 * @param options 額外選項
 * @returns Cypher 查詢子句字符串
 */
export function generateResourceAvailabilityQuery(
  resourceTypeIdParam: string,
  bookingTimeParam: string,
  serviceDurationParam: string,
  resourceQuantityParam: string,
  businessIdParam: string,
  options: {
    includeWhereClause?: boolean,
    tempVarPrefix?: string,
    includeReturn?: boolean,
    returnVars?: string[], // 添加回這個參數
    returnProperties?: boolean, // 添加這個參數
    customVariables?: { [key: string]: string }
  } = {}
): string {
  const {
    includeWhereClause = true,
    tempVarPrefix = 'rs',
    includeReturn = false,
    customVariables = {}
  } = options;

  // 默認變量名稱
  const variables = {
    rtVar: `${tempVarPrefix}_rt`,
    startTimeVar: `${tempVarPrefix}_startTime`,
    endTimeVar: `${tempVarPrefix}_endTime`,
    usedResourcesVar: 'usedResources',
    availableVar: `${tempVarPrefix}_available`,
    totalCapacityVar: 'totalCapacity',
    availableCountVar: 'availableCapacity',
    resourceNameVar: 'resourceTypeName',
    ...customVariables // 允許自定義變量名稱
  };

  // 使用輔助函數構建查詢
  let query = buildResourceTypeMatchClause(variables.rtVar, resourceTypeIdParam, businessIdParam);

  // 計算預約時間段並構建 WITH 子句
  const baseWithClause = `
  WITH ${variables.rtVar}, datetime(${bookingTimeParam}) AS ${variables.startTimeVar},
       datetime(${bookingTimeParam}) + duration({minutes: ${serviceDurationParam}}) AS ${variables.endTimeVar},
       ${serviceDurationParam} AS serviceDuration`; // 將 serviceDuration 加入 WITH

  const withClauseWithPreviousVars = `
  // 保持前面的變量
  WITH ${customVariables.previousVars}, ${variables.rtVar}, ${serviceDurationParam} AS serviceDuration, datetime(${bookingTimeParam}) AS ${variables.startTimeVar},
       datetime(${bookingTimeParam}) + duration({minutes: ${serviceDurationParam}}) AS ${variables.endTimeVar}`;

  query += customVariables.previousVars ? withClauseWithPreviousVars : baseWithClause;

  // 使用輔助函數構建資源使用檢查子句
  // 注意：buildResourceUsageClause 內部使用了 'serviceDuration' 變量名，這在 WITH 子句中已定義
  query += buildResourceUsageClause(variables.rtVar, variables.startTimeVar, variables.endTimeVar);

  // 計算可用資源
  query += `
  WITH ${customVariables.keepVars || ''} ${variables.rtVar}.name AS ${variables.resourceNameVar},
       sum(COALESCE(ru.quantity, 0)) AS ${variables.usedResourcesVar},
       ${variables.rtVar}.total_capacity AS ${variables.totalCapacityVar}`;

  // 如果有 previousVars，需要將它們也加入到這個 WITH 子句中
  if (customVariables.previousVars) {
    // 從 previousVars 中移除可能重複的變量（例如 serviceDuration）
    const uniquePreviousVars = customVariables.previousVars.split(',')
                                  .map(v => v.trim())
                                  .filter(v => v !== 'serviceDuration') // 假設 serviceDuration 已處理
                                  .join(', ');
     if (uniquePreviousVars) {
       query += `, ${uniquePreviousVars}`;
     }
  }

  // 添加條件檢查
  if (includeWhereClause) {
    query += `

  // 確保有足夠的資源可用 (總容量 >= 已用 + 所需)
  WHERE ${variables.totalCapacityVar} >= ${variables.usedResourcesVar} + ${resourceQuantityParam}`;
  }

  // 可選地添加 RETURN 子句
  if (includeReturn) {
    query += `

  RETURN ${variables.resourceNameVar} AS resourceTypeName,
         ${variables.totalCapacityVar} AS totalCapacity,
         ${variables.usedResourcesVar} AS usedResources,
         ${variables.totalCapacityVar} - ${variables.usedResourcesVar} AS availableCapacity,
         ${customVariables.previousVars ? customVariables.previousVars : '1'} AS slotStartStr`;
  }

  return query;
}

/**
 * 生成創建資源使用記錄的 Cypher 查詢子句
 * @param bookingVarName 預約記錄變數名稱
 * @param resourceTypeIdParam 資源類型 ID 參數名稱
 * @param resourceQuantityParam 資源數量參數名稱
 * @param businessIdParam 商家 ID 參數名稱
 * @param withBookingAfter 是否在結束後添加 WITH bookingVar 子句
 * @returns Cypher 查詢子句字符串
 */
export function generateResourceUsageCreationQuery(
  bookingVarName: string,
  resourceTypeIdParam: string,
  resourceQuantityParam: string,
  businessIdParam: string,
  withBookingAfter: boolean = true,
): string {
  return `
    // 查找資源類型
    MATCH (rt:ResourceType {type_id: ${resourceTypeIdParam}, business_id: ${businessIdParam}})

    // 創建資源使用記錄
    CREATE (ru:ResourceUsage {
      usage_id: randomUUID(),
      booking_id: ${bookingVarName}.booking_id,
      resource_type_id: rt.type_id,
      quantity: ${resourceQuantityParam},
      created_at: datetime()
    })
    MERGE (${bookingVarName})-[:USES_RESOURCE]->(ru)
    MERGE (ru)-[:OF_TYPE]->(rt)
    ${withBookingAfter ? `WITH ${bookingVarName}` : ''}
  `;
}

/**
 * 準備檢查資源可用性所需的參數
 * @param resourceTypeId 資源類型 ID
 * @param bookingTime 預約時間 (ISO 格式)
 * @param serviceDuration 服務時長 (分鐘)
 * @param resourceQuantity 所需資源數量
 * @param businessId 商家 ID
 * @returns 參數對象
 */
export function prepareResourceAvailabilityParams(
  resourceTypeId: string,
  bookingTime: string,
  serviceDuration: number,
  resourceQuantity: number,
  businessId: string,
): IDataObject {
  // 增加參數驗證
  if (serviceDuration <= 0 || serviceDuration > 1440) { // 1440分鐘 = 24小時
    throw new Error(`服務持續時間 ${serviceDuration} 超出有效範圍 (1-1440)`);
  }

  if (resourceQuantity <= 0 || resourceQuantity > 1000) { // 根據業務邏輯設置合理上限
    throw new Error(`資源數量 ${resourceQuantity} 超出有效範圍 (1-1000)`);
  }

  // 使用安全範圍檢查
  const safeInt = (value: number, paramName: string) => {
    if (!Number.isInteger(value)) {
       throw new Error(`參數 ${paramName} 的值 ${value} 必須是整數`);
    }
    if (value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER) {
      throw new Error(`參數 ${paramName} 的值 ${value} 超出安全整數範圍`);
    }
    return neo4j.int(value);
  };

  return {
    resourceTypeId,
    bookingTime,
    serviceDuration: safeInt(serviceDuration, 'serviceDuration'),
    resourceQuantity: safeInt(resourceQuantity, 'resourceQuantity'),
    businessId
  };
}

/**
 * 檢查資源類型 ID 是否有效
 * @param resourceTypeId 資源類型 ID
 * @returns 布爾值，是否有效
 */
export function isValidResourceTypeId(resourceTypeId: string | undefined | null): boolean {
  // 原始檢查保持不變
  if (typeof resourceTypeId !== 'string' || resourceTypeId.trim() === '') {
    return false;
  }

  // 添加基本UUID格式檢查
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(resourceTypeId);

  // 如果需要更寬鬆的檢查（例如，允許非 UUID 但有意義的字符串 ID）：
  // return resourceTypeId.length >= 8; // 示例：確保 ID 至少有合理長度
}
