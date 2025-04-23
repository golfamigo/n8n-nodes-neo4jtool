// resourceUtils.ts
// Neo4j 資源管理共用函數庫

import neo4j from 'neo4j-driver';
import type { IDataObject } from 'n8n-workflow';

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

  // 生成 MATCH 和 WITH 子句，不包含 RETURN
  let query = `
  // 獲取資源類型信息 - 支援雙向關聯
  MATCH (${variables.rtVar}:ResourceType)
  WHERE ${variables.rtVar}.type_id = ${resourceTypeIdParam} AND 
        (${variables.rtVar}.business_id = ${businessIdParam} OR EXISTS((${variables.rtVar})-[:BELONGS_TO]->(:Business {business_id: ${businessIdParam}})))

  // 計算預約時間段
  WITH ${variables.rtVar}, datetime(${bookingTimeParam}) AS ${variables.startTimeVar},
       datetime(${bookingTimeParam}) + duration({minutes: ${serviceDurationParam}}) AS ${variables.endTimeVar}`;

  // 添加前面已傳遞的變量
  if (customVariables.previousVars) {
    query = `
  // 獲取資源類型信息 - 支援雙向關聯
  MATCH (${variables.rtVar}:ResourceType)
  WHERE ${variables.rtVar}.type_id = ${resourceTypeIdParam} AND 
        (${variables.rtVar}.business_id = ${businessIdParam} OR EXISTS((${variables.rtVar})-[:BELONGS_TO]->(:Business {business_id: ${businessIdParam}})))

  // 保持前面的變量
  WITH ${customVariables.previousVars}, ${variables.rtVar}, ${serviceDurationParam} AS serviceDuration, datetime(${bookingTimeParam}) AS ${variables.startTimeVar},
       datetime(${bookingTimeParam}) + duration({minutes: ${serviceDurationParam}}) AS ${variables.endTimeVar}`;
  }

  query += `

  // 檢查當前已使用的資源數量
  OPTIONAL MATCH (bk:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(${variables.rtVar})
  WHERE bk.booking_time < ${variables.endTimeVar} AND
        bk.booking_time + duration({minutes: serviceDuration}) > ${variables.startTimeVar}

  // 計算可用資源
  WITH ${customVariables.keepVars || ''} ${variables.rtVar}.name AS ${variables.resourceNameVar},
       sum(COALESCE(ru.quantity, 0)) AS ${variables.usedResourcesVar},
       ${variables.rtVar}.total_capacity AS ${variables.totalCapacityVar}`;

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
  return {
    resourceTypeId,
    bookingTime,
    serviceDuration: neo4j.int(serviceDuration),
    resourceQuantity: neo4j.int(resourceQuantity),
    businessId
  };
}

/**
 * 檢查資源類型 ID 是否有效
 * @param resourceTypeId 資源類型 ID
 * @returns 布爾值，是否有效
 */
export function isValidResourceTypeId(resourceTypeId: string | undefined | null): boolean {
  return typeof resourceTypeId === 'string' && resourceTypeId.trim() !== '';
}
