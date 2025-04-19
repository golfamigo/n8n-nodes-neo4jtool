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
	parseNeo4jError,
	convertNeo4jValueToJs,  // 使用現有的轉換函數
} from '../neo4j/helpers/utils';

// --- Helper Function for Slot Generation ---
interface BusinessHour {
	day_of_week: any; // 可能是 Neo4j Integer
	start_time: string | null; // HH:MM
	end_time: string | null;   // HH:MM
}

interface NormalizedBusinessHour {
	dayOfWeek: number;
	startTime: string; // HH:MM
	endTime: string;   // HH:MM
}

/**
 * 規範化營業時間數據 - 使用現有的 convertNeo4jValueToJs 函數
 */
function normalizeBusinessHours(hours: any[]): NormalizedBusinessHour[] {
	if (!hours || !Array.isArray(hours)) {
		console.log('Business hours is not an array:', hours);
		return [];
	}

	console.log('Raw business hours:', JSON.stringify(hours, (key, value) => {
		// 特殊處理 Neo4j Integer 在 JSON 中的顯示
		if (neo4j.isInt(value)) {
			return `Integer(${value.toNumber()})`;
		}
		return value;
	}, 2));

	return hours.map(hour => {
		if (!hour) {
			console.log('Null or undefined hour entry');
			return { dayOfWeek: -1, startTime: '', endTime: '' }; // 將被過濾掉
		}

		// 使用 convertNeo4jValueToJs 處理 day_of_week 值
		let rawDayOfWeek = hour.day_of_week || hour.dayOfWeek || hour.day;
		let dayOfWeek = convertNeo4jValueToJs(rawDayOfWeek);

		if (dayOfWeek === null || dayOfWeek === undefined) {
			console.log(`Invalid day_of_week format:`, JSON.stringify(hour));
			return { dayOfWeek: -1, startTime: '', endTime: '' }; // 將被過濾掉
		}

		// 確保 dayOfWeek 是數字
		if (typeof dayOfWeek === 'string') {
			dayOfWeek = parseInt(dayOfWeek, 10);
		}

		// 處理不同格式的時間屬性
		let startTime = hour.start_time || hour.startTime || hour.start || '';
		let endTime = hour.end_time || hour.endTime || hour.end || '';

		// 提取時間部分 (如果格式是 "09:00:00.000000000+00:00")
		if (typeof startTime === 'string' && startTime.includes(':00.')) {
			startTime = startTime.split('.')[0];
		}
		if (typeof endTime === 'string' && endTime.includes(':00.')) {
			endTime = endTime.split('.')[0];
		}

		return {
			dayOfWeek,
			startTime,
			endTime
		};
	}).filter(hour =>
		hour.dayOfWeek >= 0 &&
		hour.dayOfWeek <= 7 &&
		hour.startTime &&
		hour.endTime
	);
}

/**
 * 生成潛在的預約時段
 * 改進版本以處理不同格式的營業時間數據和 Neo4j Integer
 */
function generatePotentialSlots(
	startDateTimeStr: string,
	endDateTimeStr: string,
	durationMinutes: number,
	businessHoursRaw: any[],
	intervalMinutes: number = 15,
): string[] {
	console.log('Generating potential slots with parameters:');
	console.log('- startDateTimeStr:', startDateTimeStr);
	console.log('- endDateTimeStr:', endDateTimeStr);
	console.log('- durationMinutes:', durationMinutes);
	console.log('- businessHoursRaw length:', Array.isArray(businessHoursRaw) ? businessHoursRaw.length : 'not an array');
	console.log('- intervalMinutes:', intervalMinutes);

	// 使用改進的 normalizeBusinessHours 函數規範化營業時間
	const normalizedHours = normalizeBusinessHours(businessHoursRaw);
	console.log('Normalized business hours:', JSON.stringify(normalizedHours, null, 2));

	const potentialSlots: string[] = [];

	try {
		const start = DateTime.fromISO(startDateTimeStr);
		const end = DateTime.fromISO(endDateTimeStr);
		const serviceDuration = { minutes: durationMinutes };

		console.log('Parsed dates:');
		console.log('- start:', start.toISO());
		console.log('- end:', end.toISO());

		if (!start.isValid || !end.isValid || start >= end) {
			console.error('Invalid date range for slot generation');
			return [];
		}

		// 創建按星期日查找營業時間的映射
		const hoursMap = new Map<number, { startTime: string; endTime: string }[]>();
		for (const bh of normalizedHours) {
			if (!hoursMap.has(bh.dayOfWeek)) {
				hoursMap.set(bh.dayOfWeek, []);
			}
			hoursMap.get(bh.dayOfWeek)?.push({
				startTime: bh.startTime,
				endTime: bh.endTime
			});
		}

		let current = start;

		while (current < end) {
			// 獲取當前日期的星期幾 (1-7，其中 1=星期一, 7=星期日)
			const luxonDayOfWeek = current.weekday; // Luxon: 1-7

			console.log(`Processing day ${current.toISODate()}, dayOfWeek: ${luxonDayOfWeek}`);

			const dailyHours = hoursMap.get(luxonDayOfWeek);

			if (dailyHours && dailyHours.length > 0) {
				console.log(`Found ${dailyHours.length} business hours for day ${luxonDayOfWeek}`);

				for (const hours of dailyHours) {
					// 組合日期和時間進行比較
					const businessStartStr = `${current.toISODate()}T${hours.startTime}`;
					const businessEndStr = `${current.toISODate()}T${hours.endTime}`;
					const businessStart = DateTime.fromISO(businessStartStr, { zone: start.zone });
					const businessEnd = DateTime.fromISO(businessEndStr, { zone: start.zone });

					console.log(`Processing hours: ${hours.startTime} to ${hours.endTime}`);
					console.log(`- Business start: ${businessStart.toISO()}`);
					console.log(`- Business end: ${businessEnd.toISO()}`);

					if (!businessStart.isValid || !businessEnd.isValid) {
						console.error('Invalid business hours time format:', hours);
						continue;
					}

					// 將當前時間調整到營業開始時間（如果需要）
					let slotCandidate = current < businessStart ? businessStart : current;

					// 確保時段候選者在當天的營業時間內
					while (slotCandidate < businessEnd && slotCandidate < end) {
						const slotEnd = slotCandidate.plus(serviceDuration);

						// 檢查整個時段是否符合營業時間和查詢範圍
						if (slotCandidate >= start && slotEnd <= end && slotEnd <= businessEnd) {
							const isoSlot = slotCandidate.toISO();
							if (isoSlot) {
								console.log(`- Adding slot: ${isoSlot}`);
								potentialSlots.push(isoSlot);
							}
						}

						// 根據間隔移動到下一個潛在時段
						slotCandidate = slotCandidate.plus({ minutes: intervalMinutes });

						// 優化：如果下一個候選者已經超過營業結束時間，則退出內部循環
						if (slotCandidate >= businessEnd) break;
					}
				}
			} else {
				console.log(`No business hours found for day ${luxonDayOfWeek}`);
			}

			// 移動到下一個間隔或下一天
			current = current.plus({ days: 1 }).startOf('day');
		}

		// 移除重複項並排序
		const uniqueSlots = [...new Set(potentialSlots)].sort();
		console.log(`Generated ${uniqueSlots.length} unique potential slots`);
		return uniqueSlots;
	} catch (error) {
		console.error('Error in generatePotentialSlots:', error);
		return [];
	}
}

// --- Node Class Definition ---
export class Neo4jFindAvailableSlots implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Find Available Slots',
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
				default: null, // Changed default from undefined to null
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

			// 改進的處理 requiredResourceCapacity 參數
			let requiredResourceCapacity: number | null = null;
			const rawCapacity = this.getNodeParameter('requiredResourceCapacity', itemIndex, null);
			if (rawCapacity !== null && rawCapacity !== undefined) {
				if (typeof rawCapacity === 'string') {
					requiredResourceCapacity = parseInt(rawCapacity, 10);
				} else if (typeof rawCapacity === 'number') {
					requiredResourceCapacity = rawCapacity;
				}
			}

			const requiredStaffId = this.getNodeParameter('requiredStaffId', itemIndex, '') as string;

			// 記錄接收到的參數
			this.logger.debug(`Executing FindAvailableSlots with params: businessId="${businessId}", serviceId="${serviceId}", startDateTime="${startDateTimeStr}", endDateTime="${endDateTimeStr}", intervalMinutes=${intervalMinutes}, requiredResourceType="${requiredResourceType}", requiredResourceCapacity=${requiredResourceCapacity}, requiredStaffId="${requiredStaffId}"`);

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
			// 改進查詢以處理不同格式的營業時間
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
				durationMinutes = convertNeo4jValueToJs(record.get('durationMinutes')); // 使用現有轉換函數
				businessHours = record.get('hoursList');

				if (durationMinutes === null) {
					throw new NodeOperationError(node, `Could not retrieve duration for Service ID: ${serviceId}`, { itemIndex });
				}
				if (bookingMode === null) {
					this.logger.warn(`Business ${businessId} does not have a 'booking_mode' property set. Availability check might be inaccurate.`);
					// Decide default behavior or throw error? For now, maybe default to TimeOnly?
					bookingMode = 'TimeOnly';
				}

				console.log('Extracted business info:');
				console.log('- bookingMode:', bookingMode);
				console.log('- durationMinutes:', durationMinutes);
				console.log('- businessHours length:', Array.isArray(businessHours) ? businessHours.length : 'not an array');

			} catch (preQueryError) {
				throw parseNeo4jError(node, preQueryError, 'Failed to retrieve business/service info.');
			}

			// 5. Generate Potential Slots in TypeScript
			const potentialSlots = generatePotentialSlots(
				startDateTimeStr,
				endDateTimeStr,
				durationMinutes as number,
				businessHours,
				intervalMinutes
			);

			if (potentialSlots.length === 0) {
				this.logger.debug('No potential slots generated based on business hours and time range.');

				// Return empty result with informative message
				returnData.push({
					json: {
						availableSlots: [],
						message: "No potential slots could be generated - check business hours and date range"
					},
					pairedItem: { item: itemIndex },
				});

				return this.prepareOutputData(returnData);
			}

			// 6. Construct and Execute Main Availability Check Query
			// 簡化查詢以提高性能
			const mainQuery = `
				// Input: List of potential slot start times (ISO strings)
				UNWIND $potentialSlots AS slotStr
				WITH datetime(slotStr) AS slotStart

				// Get Business, Service, Duration
				MATCH (b:Business {business_id: $businessId})
				MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)
				WITH b, s, slotStart, duration({minutes: s.duration_minutes}) AS serviceDuration
				WITH b, s, slotStart, serviceDuration, slotStart + serviceDuration AS slotEnd

				// 檢查是否有衝突預約
				OPTIONAL MATCH (bk:Booking)-[:AT_BUSINESS]->(b)
				WHERE bk.booking_time < slotEnd AND bk.booking_time + duration({minutes: s.duration_minutes}) > slotStart
				WITH b, s, slotStart, slotEnd, serviceDuration, collect(bk) AS conflictingBookings
				WHERE size(conflictingBookings) = 0

				// 檢查資源可用性（如果需要）
				WITH b, s, slotStart, slotEnd, serviceDuration, true AS timeAvailable
				WHERE $requiredResourceType = '' OR
					EXISTS {
						MATCH (b)-[:HAS_RESOURCE]->(r:Resource {type: $requiredResourceType})
						WHERE ($requiredResourceCapacity IS NULL OR r.capacity >= $requiredResourceCapacity)
						  AND NOT EXISTS {
							  MATCH (bk:Booking)-[:RESERVES_RESOURCE]->(r)
							  WHERE bk.booking_time < slotEnd AND bk.booking_time + serviceDuration > slotStart
						  }
					}

				// 檢查員工可用性（如果需要）
				WITH b, s, slotStart, slotEnd, timeAvailable
				WHERE $requiredStaffId = '' OR
					EXISTS {
						MATCH (st:Staff {staff_id: $requiredStaffId})-[:EMPLOYED_BY]->(b)
						WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) }
						  AND EXISTS {
							MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability)
							WHERE sa.day_of_week = date(slotStart).dayOfWeek AND
								time(slotStart) >= sa.start_time AND
								time(slotStart + serviceDuration) <= sa.end_time
						  }
						  AND NOT EXISTS {
							  MATCH (bk:Booking)-[:SERVED_BY]->(st)
							  WHERE bk.booking_time < slotEnd AND bk.booking_time + serviceDuration > slotStart
						  }
					}

				RETURN toString(slotStart) AS availableSlot
				ORDER BY availableSlot
			`;

			const mainParameters: IDataObject = {
				businessId,
				serviceId,
				potentialSlots,
				requiredResourceType: requiredResourceType === '' ? '' : requiredResourceType,
				requiredResourceCapacity: requiredResourceCapacity !== null ? neo4j.int(requiredResourceCapacity) : null,
				requiredStaffId: requiredStaffId === '' ? '' : requiredStaffId,
			};

			try {
				// 7. Execute Main Query
				const mainResult = await session.run(mainQuery, mainParameters);

				const availableSlots = mainResult.records.map(record => record.get('availableSlot'));
				console.log(`Found ${availableSlots.length} available slots out of ${potentialSlots.length} potential slots`);

				// 8. Prepare Result Data
				returnData.push({
					json: {
						availableSlots,
						totalPotentialSlots: potentialSlots.length,
						filteredOutSlots: potentialSlots.length - availableSlots.length
					},
					pairedItem: { item: itemIndex },
				});
			} catch (mainQueryError) {
				console.error('Error executing availability query:', mainQueryError);
				throw parseNeo4jError(node, mainQueryError, 'Failed to check slot availability.');
			}

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
