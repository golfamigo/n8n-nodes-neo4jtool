// ============================================================================
// N8N Neo4j Node: Find Available Slots
// ============================================================================
import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils'; // Adjusted path relative to new location

// --- Node Class Definition ---
export class Neo4jFindAvailableSlots implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j: Find Available Slots', // From TaskInstructions.md
		name: 'neo4jFindAvailableSlots', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for Business {{$parameter["businessId"]}}', // Show businessId
		description: '根據商家的預約模式查找可用的預約時間段。', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Find Slots',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,

		// --- Credentials ---
		credentials: [
			{
				name: 'neo4jApi',
				required: true,
			},
		],

		// --- Node Specific Input Properties ---
		properties: [
			// Parameters from TaskInstructions.md (Plan v2)
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '要查詢可用時段的商家 ID',
			},
			{
				displayName: 'Service ID',
				name: 'serviceId',
				type: 'string',
				required: true,
				default: '',
				description: '要預約的服務 ID (用於獲取時長)',
			},
			{
				displayName: 'Start Date/Time',
				name: 'startDateTime',
				type: 'string',
				required: true,
				default: '',
				description: '查詢範圍的開始時間 (ISO 8601 格式)',
			},
			{
				displayName: 'End Date/Time',
				name: 'endDateTime',
				type: 'string',
				required: true,
				default: '',
				description: '查詢範圍的結束時間 (ISO 8601 格式)',
			},
			{
				displayName: 'Required Resource Type',
				name: 'requiredResourceType',
				type: 'string',
				default: '',
				description: '如果需要特定資源類型 (例如 Table, Seat) (可選)',
			},
			{
				displayName: 'Required Resource Capacity',
				name: 'requiredResourceCapacity',
				type: 'number',
				typeOptions: {
					numberStep: 1,
				},
				default: undefined,
				description: '如果需要特定資源容量 (例如預約人數) (可選)',
			},
			{
				displayName: 'Required Staff ID',
				name: 'requiredStaffId',
				type: 'string',
				default: '',
				description: '如果需要特定員工 (可選)',
			},
			// Note: booking_mode is read from the Business node, not an input parameter
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData(); // Although likely runs once
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();

		// This node typically runs once, using parameters directly
		if (items.length > 1) {
			throw new NodeOperationError(node, 'This node is designed to run only once per execution. Please ensure only one item is passed as input.');
		}
		const itemIndex = 0; // Assume single execution

		try {
			// 1. Get Credentials
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;

			// 2. Validate Credentials
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured or missing required fields (host, port, username, password).', { itemIndex });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const neo4jUser = credentials.username as string; // Renamed to avoid conflict
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			// 3. Establish Neo4j Connection
			try {
				driver = neo4j.driver(uri, auth.basic(neo4jUser, password));
				await driver.verifyConnectivity();
				this.logger.debug('Neo4j driver connected successfully.');
				session = driver.session({ database });
				this.logger.debug(`Neo4j session opened for database: ${database}`);
			} catch (connectionError) {
				this.logger.error('Failed to connect to Neo4j or open session:', connectionError);
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection or session.');
			}

			// 4. Get Input Parameters (run once)
			const businessId = this.getNodeParameter('businessId', itemIndex, '') as string;
			const serviceId = this.getNodeParameter('serviceId', itemIndex, '') as string;
			const startDateTimeStr = this.getNodeParameter('startDateTime', itemIndex, '') as string;
			const endDateTimeStr = this.getNodeParameter('endDateTime', itemIndex, '') as string;
			const requiredResourceType = this.getNodeParameter('requiredResourceType', itemIndex, '') as string;
			const requiredResourceCapacity = this.getNodeParameter('requiredResourceCapacity', itemIndex, undefined) as number | undefined;
			const requiredStaffId = this.getNodeParameter('requiredStaffId', itemIndex, '') as string;

			// Validate DateTime strings


			// 5. Construct and Execute Complex Availability Query
			// This query will be complex and needs careful construction based on booking_mode
			// For simplicity in this example, we'll outline the structure and parameters
			// A real implementation might use APOC procedures or break this into multiple queries

			const query = `
				// 1. Get Business and Service details
				MATCH (b:Business {business_id: $businessId})
				MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)
				WITH b, s,
					 datetime($startDateTimeStr) AS startRange,
					 datetime($endDateTimeStr) AS endRange,
					 duration({minutes: s.duration_minutes}) AS serviceDuration

				// 2. Generate potential time slots (simplified - needs refinement based on business hours/interval)
				// This part is complex and might require generating slots in code or using APOC
				// Placeholder: Assume we have a list of potential slots for demonstration
				// In a real scenario, generate slots based on start/end range and business hours
				WITH b, s, startRange, endRange, serviceDuration,
					 [time IN [$startDateTimeStr] | datetime(time)] AS potentialSlots // Placeholder

				UNWIND potentialSlots AS slotStart
				WITH b, s, startRange, endRange, serviceDuration, slotStart
				WHERE slotStart >= startRange AND slotStart + serviceDuration <= endRange // Ensure slot is within range

				// Calculate slot end time
				WITH b, s, serviceDuration, slotStart, slotStart + serviceDuration AS slotEnd

				// 3. Check availability based on booking_mode
				WITH b, s, serviceDuration, slotStart, slotEnd,
					 CASE b.booking_mode
						 WHEN 'ResourceOnly' THEN
							 // Check resource availability
							 EXISTS {
								 MATCH (b)-[:HAS_RESOURCE]->(r:Resource)
								 WHERE ($requiredResourceType = '' OR r.type = $requiredResourceType)
								   AND ($requiredResourceCapacity IS NULL OR r.capacity >= $requiredResourceCapacity)
								   AND NOT EXISTS {
									   MATCH (bk:Booking)-[:RESERVES_RESOURCE]->(r)
									   WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: s.duration_minutes}) > slotStart
								   }
							 }
						 WHEN 'StaffOnly' THEN
							 // Check staff availability
							 EXISTS {
								 MATCH (st:Staff)-[:EMPLOYED_BY]->(b)
								 WHERE ($requiredStaffId = '' OR st.staff_id = $requiredStaffId)
								   AND EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) } // Ensure staff can provide service
								   // Add StaffAvailability check here (complex time comparison)
								   // AND check for existing bookings for this staff
								   AND NOT EXISTS {
									   MATCH (bk:Booking)-[:SERVED_BY]->(st)
									   WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: s.duration_minutes}) > slotStart
								   }
							 }
						 WHEN 'StaffAndResource' THEN
							 // Check both resource and staff availability (combine above checks)
							 (EXISTS {
								 MATCH (b)-[:HAS_RESOURCE]->(r:Resource)
								 WHERE ($requiredResourceType = '' OR r.type = $requiredResourceType)
								   AND ($requiredResourceCapacity IS NULL OR r.capacity >= $requiredResourceCapacity)
								   AND NOT EXISTS {
									   MATCH (bk:Booking)-[:RESERVES_RESOURCE]->(r)
									   WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: s.duration_minutes}) > slotStart
								   }
							 })
							 AND
							 (EXISTS {
								 MATCH (st:Staff)-[:EMPLOYED_BY]->(b)
								 WHERE ($requiredStaffId = '' OR st.staff_id = $requiredStaffId)
								   AND EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) }
								   // Add StaffAvailability check here
								   AND NOT EXISTS {
									   MATCH (bk:Booking)-[:SERVED_BY]->(st)
									   WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: s.duration_minutes}) > slotStart
								   }
							 })
						 WHEN 'TimeOnly' THEN
							 // Check only for general booking conflicts at the business level
							 NOT EXISTS {
								 MATCH (bk:Booking)-[:AT_BUSINESS]->(b)
								 WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: s.duration_minutes}) > slotStart
							 }
						 ELSE true // Default to available if mode is unknown/not set? Or handle error?
					 END AS isAvailable
				WHERE isAvailable = true
				RETURN toString(slotStart) AS availableSlot // Return as ISO string

				// NOTE: The StaffAvailability check involving dayOfWeek and time ranges is complex
				// and omitted here for brevity. It would require extracting day/time from slotStart
				// and comparing against StaffAvailability nodes.
			`;

			const parameters: IDataObject = {
				businessId,
				serviceId,
				startDateTimeStr: startDateTimeStr,
				endDateTimeStr: endDateTimeStr,
				requiredResourceType: requiredResourceType === '' ? '' : requiredResourceType, // Handle empty string
				requiredResourceCapacity: requiredResourceCapacity !== undefined ? neo4j.int(requiredResourceCapacity) : null,
				requiredStaffId: requiredStaffId === '' ? '' : requiredStaffId,
			};
			const isWrite = false; // This is a read operation

			// 7. Execute Query
			if (!session) {
				throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex });
			}
			const results = await runCypherQuery.call(this, session, query, parameters, isWrite, itemIndex);
			returnData.push(...results);


			// 9. Return Results
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 10. Handle Node-Level Errors
			if (error instanceof NodeOperationError) { throw error; }
			// Add itemIndex to the error before parsing
			(error as any).itemIndex = itemIndex;
			throw parseNeo4jError(node, error);
		} finally {
			// 11. Close Session and Driver
			if (session) {
				try {
					await session.close();
					this.logger.debug('Neo4j session closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j session:', closeError);
				}
			}
			if (driver) {
				try {
					await driver.close();
					this.logger.debug('Neo4j driver closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j driver:', closeError);
				}
			}
		}
	}
}
