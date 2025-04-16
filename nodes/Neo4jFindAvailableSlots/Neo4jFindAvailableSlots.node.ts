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
import { DateTime } from 'luxon'; // Using Luxon for easier date/time manipulation

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
	convertNeo4jValueToJs,
} from '../neo4j/helpers/utils';

// --- Helper Function for Slot Generation ---
interface BusinessHour {
	day_of_week: number;
	start_time: string | null; // HH:MM
	end_time: string | null;   // HH:MM
}

function generatePotentialSlots(
	startDateTimeStr: string,
	endDateTimeStr: string,
	durationMinutes: number,
	businessHours: BusinessHour[],
	intervalMinutes: number = 15, // Default slot interval
): string[] {
	const potentialSlots: string[] = [];
	const start = DateTime.fromISO(startDateTimeStr);
	const end = DateTime.fromISO(endDateTimeStr);
	const serviceDuration = { minutes: durationMinutes };

	if (!start.isValid || !end.isValid || start >= end) {
		// Consider throwing an error or returning empty if dates are invalid
		return [];
	}

	// Create a map for quick lookup of business hours by day of week
	const hoursMap = new Map<number, { start: string; end: string }[]>();
	for (const bh of businessHours) {
		if (!hoursMap.has(bh.day_of_week)) {
			hoursMap.set(bh.day_of_week, []);
		}
		// Assuming multiple entries per day are possible, though schema suggests unique
		if (bh.start_time && bh.end_time) { hoursMap.get(bh.day_of_week)?.push({ start: bh.start_time, end: bh.end_time }); }
	}

	let current = start;

	while (current < end) {
		const dayOfWeek = current.weekday; // Luxon: 1 is Monday, 7 is Sunday
		const dailyHours = hoursMap.get(dayOfWeek);

		if (dailyHours) {
			for (const hours of dailyHours) {
				// Skip if start or end time is null (should not happen with current GetBusinessHours query)
				if (!hours.start || !hours.end) continue;
				// Combine date with start/end times for comparison
				const businessStartStr = `${current.toISODate()}T${hours.start}:00`;
				const businessEndStr = `${current.toISODate()}T${hours.end}:00`;
				const businessStart = DateTime.fromISO(businessStartStr, { zone: start.zone });
				const businessEnd = DateTime.fromISO(businessEndStr, { zone: start.zone });

				// Adjust current to the start of the business hours for that day if needed
				let slotCandidate = current < businessStart ? businessStart : current;

				// Ensure the slot candidate starts within the business hours for that day
				while (slotCandidate < businessEnd && slotCandidate < end) {
					const slotEnd = slotCandidate.plus(serviceDuration);

					// Check if the entire slot [slotCandidate, slotEnd) fits within business hours
					// and within the overall query range [start, end)
					if (slotCandidate >= start && slotEnd <= end && slotEnd <= businessEnd) {
						const isoSlot = slotCandidate.toISO();
						if (isoSlot) {
							potentialSlots.push(isoSlot); // Add valid slot start time
						}
					}

					// Move to the next potential slot based on interval
					slotCandidate = slotCandidate.plus({ minutes: intervalMinutes });

					// Optimization: If next candidate is already past business end, break inner loop
					if (slotCandidate >= businessEnd) break;
				}
			}
		}

		// Move to the next interval on the same day, or start of next day
		current = current.plus({ minutes: intervalMinutes });
		// Basic way to move to next day if needed, could be optimized
		if (current.hour === 0 && current.minute === 0 && current.second === 0) {
			// If interval pushes to next day, ensure we don't skip days without hours
		} else if (current.day !== start.day && current > start.endOf('day')) {
			current = current.startOf('day').plus({ days: 1 });
		}


	}

	// Remove duplicates and sort (though generation logic should avoid duplicates if interval is consistent)
	return [...new Set(potentialSlots)].sort();
}


// --- Node Class Definition ---
export class Neo4jFindAvailableSlots implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j: Find Available Slots',
		name: 'neo4jFindAvailableSlots',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for Business {{$parameter["businessId"]}}',
		description: '根據商家的預約模式查找可用的預約時間段。',
		defaults: {
			name: 'Neo4j Find Slots',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
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
				description: '查詢範圍的開始時間 (ISO 8601 格式, 需含時區)',
			},
			{
				displayName: 'End Date/Time',
				name: 'endDateTime',
				type: 'string',
				required: true,
				default: '',
				description: '查詢範圍的結束時間 (ISO 8601 格式, 需含時區)',
			},
			{
				displayName: 'Slot Interval (Minutes)',
				name: 'intervalMinutes',
				type: 'number',
				typeOptions: { minValue: 1, numberStep: 1 },
				default: 15,
				description: '生成潛在預約時段的時間間隔（分鐘）',
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
				typeOptions: { numberStep: 1 },
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
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		let returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();
		const itemIndex = 0; // Assume single execution

		try {
			// 1. Get Credentials & Parameters
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;
			const businessId = this.getNodeParameter('businessId', itemIndex, '') as string;
			const serviceId = this.getNodeParameter('serviceId', itemIndex, '') as string;
			const startDateTimeStr = this.getNodeParameter('startDateTime', itemIndex, '') as string;
			const endDateTimeStr = this.getNodeParameter('endDateTime', itemIndex, '') as string;
			const intervalMinutes = this.getNodeParameter('intervalMinutes', itemIndex, 15) as number;
			const requiredResourceType = this.getNodeParameter('requiredResourceType', itemIndex, '') as string;
			const requiredResourceCapacity = this.getNodeParameter('requiredResourceCapacity', itemIndex, undefined) as number | undefined;
			const requiredStaffId = this.getNodeParameter('requiredStaffId', itemIndex, '') as string;

			// 2. Validate Credentials & Dates
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured.', { itemIndex });
			}
			if (!DateTime.fromISO(startDateTimeStr).isValid || !DateTime.fromISO(endDateTimeStr).isValid) {
				throw new NodeOperationError(node, 'Invalid Start or End Date/Time format. Please use ISO 8601.', { itemIndex });
			}

			// 3. Establish Neo4j Connection
			const uri = `${credentials.host}:${credentials.port}`;
			const neo4jUser = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';
			try {
				driver = neo4j.driver(uri, auth.basic(neo4jUser, password));
				await driver.verifyConnectivity();
				session = driver.session({ database });
			} catch (connectionError) {
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection.');
			}

			// 4. Pre-query Business Info, Service Duration, and Business Hours
			const preQuery = `
				MATCH (b:Business {business_id: $businessId})
				OPTIONAL MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
				WITH b, collect(bh { .day_of_week, start_time: toString(bh.start_time), end_time: toString(bh.end_time) }) AS hoursList
				MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)
				RETURN b.booking_mode AS bookingMode, s.duration_minutes AS durationMinutes, hoursList
			`;
			const preQueryParams = { businessId, serviceId };
			let bookingMode: string | null = null;
			let durationMinutes: number | null = null;
			let businessHours: BusinessHour[] = [];

			try {
				const preResult = await session.run(preQuery, preQueryParams);
				if (preResult.records.length === 0) {
					throw new NodeOperationError(node, `Business '${businessId}' or Service '${serviceId}' not found or not related.`, { itemIndex });
				}
				const record = preResult.records[0];
				bookingMode = record.get('bookingMode');
				durationMinutes = convertNeo4jValueToJs(record.get('durationMinutes')); // Use converter for potential Neo4j Integer
				businessHours = record.get('hoursList'); // Already converted to JS objects by driver? Check needed. If not, map with convertNeo4jValueToJs

				if (durationMinutes === null) {
					throw new NodeOperationError(node, `Could not retrieve duration for Service ID: ${serviceId}`, { itemIndex });
				}
				if (bookingMode === null) {
					this.logger.warn(`Business ${businessId} does not have a 'booking_mode' property set. Availability check might be inaccurate.`);
					// Decide default behavior or throw error? For now, maybe default to TimeOnly?
					bookingMode = 'TimeOnly';
				}

			} catch (preQueryError) {
				throw parseNeo4jError(node, preQueryError, 'Failed to retrieve business/service info.');
			}

			// 5. Generate Potential Slots in TypeScript
			const potentialSlots = generatePotentialSlots(startDateTimeStr, endDateTimeStr, durationMinutes as number, businessHours, intervalMinutes);

			if (potentialSlots.length === 0) {
				this.logger.debug('No potential slots generated based on business hours and time range.');
				return [[]]; // Return empty result if no slots generated
			}

			// 6. Construct and Execute Main Availability Check Query
			const mainQuery = `
				// Input: List of potential slot start times (ISO strings)
				UNWIND $potentialSlots AS slotStr
				WITH datetime(slotStr) AS slotStart

				// Get Business, Service, Duration again (needed for checks)
				MATCH (b:Business {business_id: $businessId})
				MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)
				WITH b, s, slotStart, duration({minutes: s.duration_minutes}) AS serviceDuration
				WITH b, s, slotStart, serviceDuration, slotStart + serviceDuration AS slotEnd

				// Perform checks based on booking_mode
				WITH b, s, slotStart, slotEnd, serviceDuration,
					CASE b.booking_mode
						WHEN 'ResourceOnly' THEN
							EXISTS {
								MATCH (b)-[:HAS_RESOURCE]->(r:Resource)
								WHERE ($requiredResourceType = '' OR r.type = $requiredResourceType)
								  AND ($requiredResourceCapacity IS NULL OR r.capacity >= $requiredResourceCapacity)
								  AND NOT EXISTS {
									  MATCH (bk:Booking)-[:RESERVES_RESOURCE]->(r)
									  WHERE bk.booking_time < slotEnd AND bk.booking_time + serviceDuration > slotStart
								  }
							}
						WHEN 'StaffOnly' THEN
							EXISTS {
								MATCH (st:Staff)-[:EMPLOYED_BY]->(b)
								WHERE ($requiredStaffId = '' OR st.staff_id = $requiredStaffId)
								  AND EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) }
								  // Simplified StaffAvailability Check (Placeholder - Needs real implementation)
								  AND EXISTS { MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability) WHERE sa.day_of_week = slotStart.dayOfWeek AND time(slotStart) >= sa.start_time AND time(slotEnd) <= sa.end_time }
								  AND NOT EXISTS {
									  MATCH (bk:Booking)-[:SERVED_BY]->(st)
									  WHERE bk.booking_time < slotEnd AND bk.booking_time + serviceDuration > slotStart
								  }
							}
						WHEN 'StaffAndResource' THEN
							(EXISTS {
								MATCH (b)-[:HAS_RESOURCE]->(r:Resource)
								WHERE ($requiredResourceType = '' OR r.type = $requiredResourceType)
								  AND ($requiredResourceCapacity IS NULL OR r.capacity >= $requiredResourceCapacity)
								  AND NOT EXISTS {
									  MATCH (bk:Booking)-[:RESERVES_RESOURCE]->(r)
									  WHERE bk.booking_time < slotEnd AND bk.booking_time + serviceDuration > slotStart
								  }
							})
							AND
							(EXISTS {
								MATCH (st:Staff)-[:EMPLOYED_BY]->(b)
								WHERE ($requiredStaffId = '' OR st.staff_id = $requiredStaffId)
								  AND EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) }
								  // Simplified StaffAvailability Check (Placeholder - Needs real implementation)
								  AND EXISTS { MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability) WHERE sa.day_of_week = slotStart.dayOfWeek AND time(slotStart) >= sa.start_time AND time(slotEnd) <= sa.end_time }
								  AND NOT EXISTS {
									  MATCH (bk:Booking)-[:SERVED_BY]->(st)
									  WHERE bk.booking_time < slotEnd AND bk.booking_time + serviceDuration > slotStart
								  }
							})
						WHEN 'TimeOnly' THEN
							NOT EXISTS {
								MATCH (bk:Booking)-[:AT_BUSINESS]->(b)
								WHERE bk.booking_time < slotEnd AND bk.booking_time + serviceDuration > slotStart
							}
						ELSE false // Default to unavailable if mode is unknown
					END AS isAvailable
				WHERE isAvailable = true
				RETURN toString(slotStart) AS availableSlot // Return as UTC ISO string
				ORDER BY availableSlot // Ensure sorted output
			`;

			const mainParameters: IDataObject = {
				businessId,
				serviceId,
				potentialSlots, // Pass the generated list
				requiredResourceType: requiredResourceType === '' ? '' : requiredResourceType,
				requiredResourceCapacity: requiredResourceCapacity !== undefined && requiredResourceCapacity !== null ? neo4j.int(requiredResourceCapacity) : null,
				requiredStaffId: requiredStaffId === '' ? '' : requiredStaffId,
			};

			// 7. Execute Main Query
			const results = await runCypherQuery.call(this, session, mainQuery, mainParameters, false, itemIndex);
			returnData.push(...results);


			// 9. Return Results
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 10. Handle Node-Level Errors
			if (error instanceof NodeOperationError) { throw error; }
			(error as any).itemIndex = itemIndex;
			throw parseNeo4jError(node, error);
		} finally {
			// 11. Close Session and Driver
			if (session) {
				try { await session.close(); } catch (e) { this.logger.error('Error closing Neo4j session:', e); }
			}
			if (driver) {
				try { await driver.close(); } catch (e) { this.logger.error('Error closing Neo4j driver:', e); }
			}
		}
	}
}
