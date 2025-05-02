import {
  isValidResourceTypeId,
  prepareResourceAvailabilityParams,
  generateResourceAvailabilityQuery, // Import for snapshot testing later
} from '../resourceUtils';
import neo4j, { Integer } from 'neo4j-driver'; // Import Integer type directly

describe('resourceUtils', () => {

  describe('isValidResourceTypeId', () => {
    test('should return true for a valid UUID', () => {
      expect(isValidResourceTypeId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidResourceTypeId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    });

    test('should return false for an invalid UUID format', () => {
      expect(isValidResourceTypeId('123e4567-e89b-12d3-a456-42661417400')).toBe(false); // Too short
      expect(isValidResourceTypeId('123e4567-e89b-12d3-a456-4266141740000')).toBe(false); // Too long
      expect(isValidResourceTypeId('123e4567-e89b-12d3-a456-g26614174000')).toBe(false); // Invalid char 'g'
      expect(isValidResourceTypeId('123e4567e89b12d3a456426614174000')).toBe(false); // Missing hyphens
    });

    test('should return false for non-string inputs', () => {
      expect(isValidResourceTypeId(undefined)).toBe(false);
      expect(isValidResourceTypeId(null)).toBe(false);
      expect(isValidResourceTypeId(123 as any)).toBe(false);
      expect(isValidResourceTypeId({} as any)).toBe(false);
    });

    test('should return false for empty or whitespace strings', () => {
      expect(isValidResourceTypeId('')).toBe(false);
      expect(isValidResourceTypeId('   ')).toBe(false);
    });
  });

  describe('prepareResourceAvailabilityParams', () => {
    const validParams = {
      resourceTypeId: 'valid-uuid-format-resource', // Assume valid UUID for test purpose
      bookingTime: '2024-01-01T10:00:00Z',
      serviceDuration: 60,
      resourceQuantity: 2,
      businessId: 'valid-uuid-format-business', // Assume valid UUID
    };

    test('should return parameters with Neo4j integers for valid inputs', () => {
      const params = prepareResourceAvailabilityParams(
        validParams.resourceTypeId,
        validParams.bookingTime,
        validParams.serviceDuration,
        validParams.resourceQuantity,
        validParams.businessId
      );
      expect(params.resourceTypeId).toBe(validParams.resourceTypeId);
      expect(params.bookingTime).toBe(validParams.bookingTime);
      expect(neo4j.isInt(params.serviceDuration)).toBe(true);
      expect((params.serviceDuration as Integer).toNumber()).toBe(validParams.serviceDuration); // Use imported Integer
      expect(neo4j.isInt(params.resourceQuantity)).toBe(true);
      expect((params.resourceQuantity as Integer).toNumber()).toBe(validParams.resourceQuantity); // Use imported Integer
      expect(params.businessId).toBe(validParams.businessId);
    });

    test('should throw error for invalid serviceDuration (<= 0)', () => {
      expect(() => prepareResourceAvailabilityParams(
        validParams.resourceTypeId, validParams.bookingTime, 0, validParams.resourceQuantity, validParams.businessId
      )).toThrow('服務持續時間 0 超出有效範圍 (1-1440)');
      expect(() => prepareResourceAvailabilityParams(
        validParams.resourceTypeId, validParams.bookingTime, -10, validParams.resourceQuantity, validParams.businessId
      )).toThrow('服務持續時間 -10 超出有效範圍 (1-1440)');
    });

     test('should throw error for invalid serviceDuration (> 1440)', () => {
      expect(() => prepareResourceAvailabilityParams(
        validParams.resourceTypeId, validParams.bookingTime, 1441, validParams.resourceQuantity, validParams.businessId
      )).toThrow('服務持續時間 1441 超出有效範圍 (1-1440)');
    });

    test('should throw error for invalid resourceQuantity (<= 0)', () => {
      expect(() => prepareResourceAvailabilityParams(
        validParams.resourceTypeId, validParams.bookingTime, validParams.serviceDuration, 0, validParams.businessId
      )).toThrow('資源數量 0 超出有效範圍 (1-1000)');
       expect(() => prepareResourceAvailabilityParams(
        validParams.resourceTypeId, validParams.bookingTime, validParams.serviceDuration, -1, validParams.businessId
      )).toThrow('資源數量 -1 超出有效範圍 (1-1000)');
    });

     test('should throw error for invalid resourceQuantity (> 1000)', () => {
      expect(() => prepareResourceAvailabilityParams(
        validParams.resourceTypeId, validParams.bookingTime, validParams.serviceDuration, 1001, validParams.businessId
      )).toThrow('資源數量 1001 超出有效範圍 (1-1000)');
    });

     test('should throw error for non-integer serviceDuration', () => {
      expect(() => prepareResourceAvailabilityParams(
        validParams.resourceTypeId, validParams.bookingTime, 60.5, validParams.resourceQuantity, validParams.businessId
      )).toThrow('參數 serviceDuration 的值 60.5 必須是整數');
    });

     test('should throw error for non-integer resourceQuantity', () => {
      expect(() => prepareResourceAvailabilityParams(
        validParams.resourceTypeId, validParams.bookingTime, validParams.serviceDuration, 1.5, validParams.businessId
       )).toThrow('參數 resourceQuantity 的值 1.5 必須是整數');
    });

    // Removed safe integer range test for prepareResourceAvailabilityParams
    // as the practical range checks (1-1440, 1-1000) are much smaller.
  });

  describe('generateResourceAvailabilityQuery', () => {
    const params = {
      resourceTypeIdParam: '$resourceTypeId',
      bookingTimeParam: '$bookingTime',
      serviceDurationParam: '$serviceDuration',
      resourceQuantityParam: '$resourceQuantity',
      businessIdParam: '$businessId',
    };

    test('should generate basic availability query', () => {
      const query = generateResourceAvailabilityQuery(
        params.resourceTypeIdParam,
        params.bookingTimeParam,
        params.serviceDurationParam,
        params.resourceQuantityParam,
        params.businessIdParam
      );
      // Use inline snapshot for readability
      expect(query).toMatchInlineSnapshot(`
"
  // 獲取資源類型信息 - 支援雙向關聯
  MATCH (rs_rt:ResourceType)
  WHERE rs_rt.type_id = $resourceTypeId AND
        (rs_rt.business_id = $businessId OR EXISTS((rs_rt)-[:BELONGS_TO]->(:Business {business_id: $businessId})))
  WITH rs_rt, datetime($bookingTime) AS rs_startTime,
       datetime($bookingTime) + duration({minutes: $serviceDuration}) AS rs_endTime,
       $serviceDuration AS serviceDuration
  // 檢查當前已使用的資源數量
  OPTIONAL MATCH (bk:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rs_rt)
  WHERE bk.booking_time < rs_endTime AND
        bk.booking_time + duration({minutes: serviceDuration}) > rs_startTime
  WITH  rs_rt.name AS resourceTypeName,
       sum(COALESCE(ru.quantity, 0)) AS usedResources,
       rs_rt.total_capacity AS totalCapacity

  // 確保有足夠的資源可用 (總容量 >= 已用 + 所需)
  WHERE totalCapacity >= usedResources + $resourceQuantity"
`);
    });

    test('should generate query without WHERE clause', () => {
      const query = generateResourceAvailabilityQuery(
        params.resourceTypeIdParam,
        params.bookingTimeParam,
        params.serviceDurationParam,
        params.resourceQuantityParam,
        params.businessIdParam,
        { includeWhereClause: false }
      );
      expect(query).toMatchInlineSnapshot(`
"
  // 獲取資源類型信息 - 支援雙向關聯
  MATCH (rs_rt:ResourceType)
  WHERE rs_rt.type_id = $resourceTypeId AND
        (rs_rt.business_id = $businessId OR EXISTS((rs_rt)-[:BELONGS_TO]->(:Business {business_id: $businessId})))
  WITH rs_rt, datetime($bookingTime) AS rs_startTime,
       datetime($bookingTime) + duration({minutes: $serviceDuration}) AS rs_endTime,
       $serviceDuration AS serviceDuration
  // 檢查當前已使用的資源數量
  OPTIONAL MATCH (bk:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rs_rt)
  WHERE bk.booking_time < rs_endTime AND
        bk.booking_time + duration({minutes: serviceDuration}) > rs_startTime
  WITH  rs_rt.name AS resourceTypeName,
       sum(COALESCE(ru.quantity, 0)) AS usedResources,
       rs_rt.total_capacity AS totalCapacity"
`);
    });

     test('should generate query with RETURN clause', () => {
      const query = generateResourceAvailabilityQuery(
        params.resourceTypeIdParam,
        params.bookingTimeParam,
        params.serviceDurationParam,
        params.resourceQuantityParam,
        params.businessIdParam,
        { includeReturn: true }
      );
      expect(query).toMatchInlineSnapshot(`
"
  // 獲取資源類型信息 - 支援雙向關聯
  MATCH (rs_rt:ResourceType)
  WHERE rs_rt.type_id = $resourceTypeId AND
        (rs_rt.business_id = $businessId OR EXISTS((rs_rt)-[:BELONGS_TO]->(:Business {business_id: $businessId})))
  WITH rs_rt, datetime($bookingTime) AS rs_startTime,
       datetime($bookingTime) + duration({minutes: $serviceDuration}) AS rs_endTime,
       $serviceDuration AS serviceDuration
  // 檢查當前已使用的資源數量
  OPTIONAL MATCH (bk:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rs_rt)
  WHERE bk.booking_time < rs_endTime AND
        bk.booking_time + duration({minutes: serviceDuration}) > rs_startTime
  WITH  rs_rt.name AS resourceTypeName,
       sum(COALESCE(ru.quantity, 0)) AS usedResources,
       rs_rt.total_capacity AS totalCapacity

  // 確保有足夠的資源可用 (總容量 >= 已用 + 所需)
  WHERE totalCapacity >= usedResources + $resourceQuantity

  RETURN resourceTypeName AS resourceTypeName,
         totalCapacity AS totalCapacity,
         usedResources AS usedResources,
         totalCapacity - usedResources AS availableCapacity,
         1 AS slotStartStr"
`);
    });

     test('should generate query with custom variables and previous vars', () => {
       const query = generateResourceAvailabilityQuery(
         params.resourceTypeIdParam,
         params.bookingTimeParam,
         params.serviceDurationParam,
         params.resourceQuantityParam,
         params.businessIdParam,
         {
           customVariables: {
             previousVars: 'prevVar1, prevVar2',
             keepVars: 'prevVar1, prevVar2,', // Keep previous vars in final WITH
             rtVar: 'customRt',
             startTimeVar: 'customStart',
             endTimeVar: 'customEnd',
             resourceNameVar: 'customResourceName',
           },
           includeReturn: true,
         }
       );
       expect(query).toMatchInlineSnapshot(`
"
  // 獲取資源類型信息 - 支援雙向關聯
  MATCH (customRt:ResourceType)
  WHERE customRt.type_id = $resourceTypeId AND
        (customRt.business_id = $businessId OR EXISTS((customRt)-[:BELONGS_TO]->(:Business {business_id: $businessId})))
  // 保持前面的變量
  WITH prevVar1, prevVar2, customRt, $serviceDuration AS serviceDuration, datetime($bookingTime) AS customStart,
       datetime($bookingTime) + duration({minutes: $serviceDuration}) AS customEnd
  // 檢查當前已使用的資源數量
  OPTIONAL MATCH (bk:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(customRt)
  WHERE bk.booking_time < customEnd AND
        bk.booking_time + duration({minutes: serviceDuration}) > customStart
  WITH prevVar1, prevVar2, customRt.name AS customResourceName,
       sum(COALESCE(ru.quantity, 0)) AS usedResources,
       customRt.total_capacity AS totalCapacity, prevVar1, prevVar2

  // 確保有足夠的資源可用 (總容量 >= 已用 + 所需)
  WHERE totalCapacity >= usedResources + $resourceQuantity

  RETURN customResourceName AS resourceTypeName,
         totalCapacity AS totalCapacity,
         usedResources AS usedResources,
         totalCapacity - usedResources AS availableCapacity,
         prevVar1, prevVar2 AS slotStartStr"
`);
     });
  });
});
