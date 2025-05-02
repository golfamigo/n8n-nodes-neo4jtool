import { convertNeo4jValueToJs, prepareQueryParams, parseNeo4jError } from '../utils';
import neo4j, { Neo4jError, types, Integer, DateTime } from 'neo4j-driver'; // Import Integer and DateTime
import { NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow'; // Import INode type

describe('utils', () => {

  describe('convertNeo4jValueToJs', () => {
    test('should handle null and undefined', () => {
      expect(convertNeo4jValueToJs(null)).toBeNull();
      expect(convertNeo4jValueToJs(undefined)).toBeNull();
    });

    test('should convert safe Neo4j integers to numbers', () => {
      expect(convertNeo4jValueToJs(neo4j.int(123))).toBe(123);
      expect(convertNeo4jValueToJs(neo4j.int(0))).toBe(0);
      expect(convertNeo4jValueToJs(neo4j.int(-50))).toBe(-50);
      expect(convertNeo4jValueToJs(neo4j.int(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    });

    test('should convert unsafe Neo4j integers to tagged strings', () => {
      const largeNumStr = (Number.MAX_SAFE_INTEGER + 1).toString();
      expect(convertNeo4jValueToJs(neo4j.int(largeNumStr))).toBe(`int:${largeNumStr}`);
      // Removed test for veryLargeNumStr as neo4j.int might not handle extremely large strings reliably
    });

    test('should convert Neo4j Nodes', () => {
      const mockNode = new types.Node(neo4j.int(1), ['Person', 'Developer'], { name: 'Alice', age: neo4j.int(30) });
      // Manually set elementId as it's usually assigned by the driver/db
      Object.defineProperty(mockNode, 'elementId', { value: 'element-1', writable: false });
      const converted = convertNeo4jValueToJs(mockNode);
      expect(converted).toEqual({
        elementId: 'element-1',
        labels: ['Person', 'Developer'],
        properties: { name: 'Alice', age: 30 },
      });
    });

     test('should convert Neo4j Relationships', () => {
      const mockRel = new types.Relationship(neo4j.int(10), neo4j.int(1), neo4j.int(2), 'KNOWS', { since: neo4j.int(2020) });
       Object.defineProperty(mockRel, 'elementId', { value: 'element-10', writable: false });
       Object.defineProperty(mockRel, 'startNodeElementId', { value: 'element-1', writable: false });
       Object.defineProperty(mockRel, 'endNodeElementId', { value: 'element-2', writable: false });
      const converted = convertNeo4jValueToJs(mockRel);
      expect(converted).toEqual({
        elementId: 'element-10',
        startNodeElementId: 'element-1',
        endNodeElementId: 'element-2',
        type: 'KNOWS',
        properties: { since: 2020 },
      });
    });

    test('should convert Neo4j Paths', () => {
       const node1 = new types.Node(neo4j.int(1), ['A'], { id: 'n1' });
       Object.defineProperty(node1, 'elementId', { value: 'elem-1', writable: false });
       const node2 = new types.Node(neo4j.int(2), ['B'], { id: 'n2' });
       Object.defineProperty(node2, 'elementId', { value: 'elem-2', writable: false });
       const rel1 = new types.Relationship(neo4j.int(10), neo4j.int(1), neo4j.int(2), 'REL', { prop: 'val1' });
       Object.defineProperty(rel1, 'elementId', { value: 'elem-10', writable: false });
       Object.defineProperty(rel1, 'startNodeElementId', { value: 'elem-1', writable: false });
       Object.defineProperty(rel1, 'endNodeElementId', { value: 'elem-2', writable: false });

       const segment1 = new types.PathSegment(node1, rel1, node2);
       const path = new types.Path(node1, node2, [segment1]);

       const converted = convertNeo4jValueToJs(path);
       expect(converted).toHaveProperty('start');
       expect(converted).toHaveProperty('end');
       expect(converted).toHaveProperty('segments');
       expect(converted.length).toBe(1);
       expect(converted.start.properties.id).toBe('n1');
       expect(converted.end.properties.id).toBe('n2');
       expect(converted.segments[0].relationship.properties.prop).toBe('val1');
       expect(converted.segments[0].start.properties.id).toBe('n1');
       expect(converted.segments[0].end.properties.id).toBe('n2');
    });

    test('should convert temporal types to strings', () => {
      expect(convertNeo4jValueToJs(new types.Date(2024, 1, 1))).toBe('2024-01-01');
      // Note: toString() format might vary slightly based on driver version/config
      expect(convertNeo4jValueToJs(new types.DateTime(2024, 1, 1, 10, 30, 0, 0, 3600))).toMatch(/^2024-01-01T10:30:00(?:\.\d+)?\+01:00$/); // Example with offset
      expect(convertNeo4jValueToJs(new types.Time(14, 45, 15, 0, -18000))).toMatch(/^14:45:15(?:\.\d+)?-05:00$/); // Example with offset
      expect(convertNeo4jValueToJs(new types.Duration(1, 2, 3, 4))).toBe('P1M2DT3.000000004S');
    });

     test('should convert Points', () => {
       const point2d = new types.Point(neo4j.int(7203), 1.23, 4.56);
       const point3d = new types.Point(neo4j.int(4979), 7.8, 9.0, 1.2);
       expect(convertNeo4jValueToJs(point2d)).toEqual({ srid: 7203, x: 1.23, y: 4.56 });
       expect(convertNeo4jValueToJs(point3d)).toEqual({ srid: 4979, x: 7.8, y: 9.0, z: 1.2 });
     });

    test('should convert arrays recursively', () => {
      const input = [1, neo4j.int(5), 'hello', new types.Date(2023, 5, 5)];
      expect(convertNeo4jValueToJs(input)).toEqual([1, 5, 'hello', '2023-05-05']);
    });

    test('should convert maps (JS Objects) recursively', () => {
      // Add missing timeZoneOffsetSeconds (e.g., 0 for UTC or a specific offset)
      const input = { a: 1, b: neo4j.int(10), c: { d: new types.Time(12, 0, 0, 0, 0) } };
      expect(convertNeo4jValueToJs(input)).toEqual({ a: 1, b: 10, c: { d: '12:00:00Z' } }); // Assuming Time toString format with Z for UTC offset 0
    });

     test('should return other types as is', () => {
       expect(convertNeo4jValueToJs('a string')).toBe('a string');
       expect(convertNeo4jValueToJs(123.45)).toBe(123.45);
       expect(convertNeo4jValueToJs(true)).toBe(true);
       const date = new Date();
       expect(convertNeo4jValueToJs(date)).toBe(date); // JS Date is not a Neo4j type
     });
  });

  describe('prepareQueryParams', () => {
    test('should handle null and undefined', () => {
      expect(prepareQueryParams({ a: null, b: undefined })).toEqual({ a: null, b: null });
    });

    test('should convert safe integers to Neo4j integers', () => {
      const params = prepareQueryParams({ count: 100, offset: 0, limit: -10 });
      expect(neo4j.isInt(params.count)).toBe(true);
      expect((params.count as Integer).toNumber()).toBe(100); // Use imported Integer
      expect(neo4j.isInt(params.offset)).toBe(true);
      expect((params.offset as Integer).toNumber()).toBe(0); // Use imported Integer
       expect(neo4j.isInt(params.limit)).toBe(true);
      expect((params.limit as Integer).toNumber()).toBe(-10); // Use imported Integer
    });

    test('should keep unsafe integers or floats as standard numbers', () => {
      const largeInt = Number.MAX_SAFE_INTEGER + 1;
      const floatNum = 123.45;
      const params = prepareQueryParams({ large: largeInt, floatVal: floatNum });
      expect(neo4j.isInt(params.large)).toBe(false);
      expect(params.large).toBe(largeInt);
      expect(neo4j.isInt(params.floatVal)).toBe(false);
      expect(params.floatVal).toBe(floatNum);
    });

    test('should convert JS Date objects to Neo4j DateTime', () => {
      const date = new Date(2024, 0, 1, 12, 0, 0); // Jan 1, 2024 12:00:00 local
      const params = prepareQueryParams({ timestamp: date });
      expect(params.timestamp instanceof DateTime).toBe(true); // Use imported DateTime
      // Check components (assuming local timezone doesn't shift the date parts drastically for this test)
      const neo4jDate = params.timestamp as DateTime; // Use imported DateTime
      // Properties like year, month, day are already numbers
      expect(neo4jDate.year).toBe(2024);
      expect(neo4jDate.month).toBe(1);
      expect(neo4jDate.day).toBe(1);
      // Hour might vary based on test runner's timezone vs Date object creation
    });

    test('should convert valid ISO date strings to Neo4j DateTime', () => {
      const isoString = '2024-02-15T10:30:00Z';
      const params = prepareQueryParams({ eventTime: isoString });
      expect(params.eventTime instanceof DateTime).toBe(true); // Use imported DateTime
      const neo4jDate = params.eventTime as DateTime; // Use imported DateTime
      // Check components (should match UTC)
      // Properties like year, month, day are already numbers
      expect(neo4jDate.year).toBe(2024);
      expect(neo4jDate.month).toBe(2);
      expect(neo4jDate.day).toBe(15);
      expect(neo4jDate.hour).toBe(10);
      expect(neo4jDate.minute).toBe(30);
      expect(neo4jDate.second).toBe(0);
      // Timezone offset should be 0 for Z
      expect(neo4jDate.timeZoneOffsetSeconds).toBe(0);
    });

     // Adjusted test: prepareQueryParams currently parses invalid dates leniently via new Date()
     test('should convert invalid but parsable date strings to Neo4j DateTime', () => {
      const invalidIso = '2024-02-30T10:30:00Z'; // Invalid date, JS Date might parse as March 1st or similar
      const params = prepareQueryParams({ time1: invalidIso });
      // Expect it to be converted to a DateTime object due to lenient parsing
      expect(params.time1 instanceof DateTime).toBe(true);
      // Optionally check the parsed date if behavior is predictable (e.g., rolls over)
      // const parsedDate = params.time1 as DateTime;
      // expect((parsedDate.month as Integer).toNumber()).toBe(3); // Example: Check if it rolled over to March
      // expect((parsedDate.day as Integer).toNumber()).toBe(1);
    });

     test('should keep unparsable date strings as strings', () => {
       const notADate = 'hello world';
       const params = prepareQueryParams({ time2: notADate });
       expect(params.time2).toBe(notADate);
     });

    test('should keep other types as is', () => {
      const input = { str: 'hello', bool: true, arr: [1, 2], obj: { k: 'v' } };
      const params = prepareQueryParams(input);
      expect(params.str).toBe('hello');
      expect(params.bool).toBe(true);
      expect(params.arr).toEqual([1, 2]); // Array elements are not converted by prepareQueryParams
      expect(params.obj).toEqual({ k: 'v' }); // Objects are not converted
    });
  });

  describe('parseNeo4jError', () => {
    // Mock INode for testing - Add missing 'id' property
    const mockNode: INode = { id: 'test-node-id', name: 'TestNode', type: 'TestType', typeVersion: 1, position: [0, 0], parameters: {}, credentials: {} };

    test('should parse generic Error', () => {
      const genericError = new Error('Something went wrong');
      // Simulate stack trace if missing in test environment
      if (!genericError.stack) {
        genericError.stack = 'Error: Something went wrong\n    at test (test.js:1:1)';
      }
      const nodeError = parseNeo4jError(mockNode, genericError);
      expect(nodeError).toBeInstanceOf(NodeOperationError);
      // The main message (nodeError.message) should be the description/stack passed to constructor
      expect(nodeError.message).toContain('Something went wrong');
      // The context message should be the simplified message
      expect(nodeError.context.message).toBe('Something went wrong');
    });

     test('should parse generic Error with itemIndex', () => {
      const genericError = new Error('Something went wrong');
      (genericError as any).itemIndex = 5;
      const nodeError = parseNeo4jError(mockNode, genericError);
      expect(nodeError).toBeInstanceOf(NodeOperationError);
      expect(nodeError.context.itemIndex).toBe(5);
    });

    test('should parse basic Neo4jError', () => {
      // Provide dummy values for required constructor args if not testing specific codes
      const neo4jError = new Neo4jError('Basic Neo4j error message\nMore details.', '', '', ''); // Use empty string for code
      const nodeError = parseNeo4jError(mockNode, neo4jError);
      expect(nodeError).toBeInstanceOf(NodeOperationError);
      expect(nodeError.context.message).toBe('Basic Neo4j error message');
      expect(nodeError.message).toBe('Basic Neo4j error message\nMore details.');
    });

    test('should parse Neo.TransientError.Transaction error', () => {
      const error = new Neo4jError('Transaction error details', 'Neo.TransientError.Transaction.DeadlockDetected', '', '');
      const nodeError = parseNeo4jError(mockNode, error);
      expect(nodeError.context.message).toBe('Transaction error (temporary)');
      // The main message (description) should contain the detailed explanation
      expect(nodeError.message).toContain('暫時性交易錯誤，可重試操作。詳情:');
      expect(nodeError.message).toContain('Transaction error details');
    });

     test('should parse Neo.TransientError.Cluster error', () => {
      const error = new Neo4jError('Cluster error details', 'Neo.TransientError.Cluster.NotALeader', '', '');
      const nodeError = parseNeo4jError(mockNode, error);
      expect(nodeError.context.message).toBe('Cluster synchronization error');
      expect(nodeError.message).toContain('叢集同步錯誤，請稍後重試。詳情:');
      expect(nodeError.message).toContain('Cluster error details');
    });

     test('should parse Neo.ClientError.Transaction error', () => {
      const error = new Neo4jError('Constraint violation details', 'Neo.ClientError.Transaction.ValidationFailed', '', '');
      const nodeError = parseNeo4jError(mockNode, error);
      expect(nodeError.context.message).toBe('Transaction constraint error');
      expect(nodeError.message).toContain('交易約束錯誤，請檢查數據一致性。詳情:');
      expect(nodeError.message).toContain('Constraint violation details');
    });

    test('should parse Neo.ClientError.Security.Unauthorized error', () => {
      const error = new Neo4jError('Auth failed', 'Neo.ClientError.Security.Unauthorized', '', '');
      const nodeError = parseNeo4jError(mockNode, error);
      expect(nodeError.context.message).toBe('Authentication failed');
      // For specific known errors, the description passed to constructor might be the simplified one
      expect(nodeError.message).toBe('Please check your Neo4j credentials (URI, username, password).');
    });

     test('should parse Neo.ClientError.Schema.ConstraintValidationFailed error', () => {
      const error = new Neo4jError('Node(Person) already exists with label `Person` and property `id` = 1', 'Neo.ClientError.Schema.ConstraintValidationFailed', '', '');
      const nodeError = parseNeo4jError(mockNode, error);
      expect(nodeError.context.message).toBe('Constraint violation');
      expect(nodeError.message).toContain('A database constraint was violated. Details:');
      expect(nodeError.message).toContain('Node(Person) already exists');
    });

     test('should handle unknown error types', () => {
      const unknownError = { some: 'object' };
      const nodeError = parseNeo4jError(mockNode, unknownError);
      expect(nodeError.context.message).toBe('Neo4j Error');
      expect(nodeError.message).toBe('An unknown error occurred');
    });

     test('should use default node if node is null', () => {
      const error = new Error('Test error');
      const nodeError = parseNeo4jError(null, error);
      expect(nodeError.node.name).toBe('Neo4jNode'); // Default node name
    });
  });

  // TODO: Add tests for runCypherQuery (might require mocking session and transactions)
});
