// ============================================================================
// N8N Neo4j Node: Find Available Slots - StaffAndResource Mode
// ============================================================================
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
	IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- 導入共用工具函數 ---
import {
	parseNeo4jError,
	convertNeo4jValueToJs,
	runCypherQuery,
} from '../neo4j/helpers/utils';

// --- 導入時間處理工具函數 ---
import {
	normalizeDateTime,
	getIsoWeekday,
} from '../neo4j/helpers/timeUtils';

// --- Node Class Definition ---
export class Neo4jFindAvailableSlotsStaffAndResource implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Find Available Slots StaffAndResource',
		name: 'neo4jFindAvailableSlotsStaffAndResource',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'StaffAndResource mode for Business {{$parameter["businessId"]}}',
		description: '根據時間、員工和資源可用性查找可用的預約時間段,businessId: 要查詢可用時段的商家 ID (UUID),serviceId: 要預約的服務 ID (UUID) (用於獲取時長),startDateTime: 查詢範圍的開始時間 (ISO 8601 格式, 需含時區),endDateTime: 查詢範圍的結束時間 (ISO 8601 格式, 需含時區),intervalMinutes: 生成潛在預約時段的時間間隔（分鐘）,requiredStaffId: 指定員工的 ID (UUID)（在 StaffAndResource 模式下必填）,requiredResourceTypeId: 需要的資源類型 ID (UUID)（在 StaffAndResource 模式下必填）,requiredResourceCapacity: 所需資源的數量',
		defaults: {
			name: 'Neo4j Find Slots StaffAndResource',
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
				displayName: 'Required Staff ID',
				name: 'requiredStaffId',
				type: 'string',
				required: true,
				default: '',
				description: '指定員工的 ID（在 StaffAndResource 模式下必填）',
			},
			{
				displayName: 'Required Resource Type',
				name: 'requiredResourceTypeId',
				type: 'string',
				required: true,
				default: '',
				description: '需要的資源類型 ID（在 StaffAndResource 模式下必填）',
			},
			{
				displayName: 'Required Resource Capacity',
				name: 'requiredResourceCapacity',
				type: 'number',
				typeOptions: { numberStep: 1 },
				default: 1,
				description: '所需資源的數量',
			},
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		let returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();
		const itemIndex = 0; // 假設單一執行

		try {
			// 1. 獲取認證和參數
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;
			const businessId = this.getNodeParameter('businessId', itemIndex, '') as string;
			const serviceId = this.getNodeParameter('serviceId', itemIndex, '') as string;
			const startDateTimeStr = this.getNodeParameter('startDateTime', itemIndex, '') as string;
			const endDateTimeStr = this.getNodeParameter('endDateTime', itemIndex, '') as string;
			const intervalMinutes = this.getNodeParameter('intervalMinutes', itemIndex, 15) as number;
			const requiredStaffId = this.getNodeParameter('requiredStaffId', itemIndex, '') as string;
			const requiredResourceTypeId = this.getNodeParameter('requiredResourceTypeId', itemIndex, '') as string;
			const requiredResourceCapacity = this.getNodeParameter('requiredResourceCapacity', itemIndex, 1) as number;

			// 驗證必填參數
			if (!requiredStaffId) {
				throw new NodeOperationError(node, 'StaffAndResource 模式下必須指定 Required Staff ID。', { itemIndex });
			}

			if (!requiredResourceTypeId) {
				throw new NodeOperationError(node, 'StaffAndResource 模式下必須指定 Required Resource Type ID。', { itemIndex });
			}

			// 記錄接收到的參數
			this.logger.debug('執行 FindAvailableSlotsStaffAndResource，參數:', {
				businessId,
				serviceId,
				startDateTime: startDateTimeStr,
				endDateTime: endDateTimeStr,
				intervalMinutes,
				requiredStaffId,
				requiredResourceTypeId,
				requiredResourceCapacity,
			});

			// 2. 驗證認證和日期
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j 認證配置不完整。', { itemIndex });
			}

			// 使用時間工具函數驗證日期
			const normalizedStartDateTime = normalizeDateTime(startDateTimeStr);
			const normalizedEndDateTime = normalizeDateTime(endDateTimeStr);

			if (!normalizedStartDateTime || !normalizedEndDateTime) {
				throw new NodeOperationError(node, '無效的開始或結束日期/時間格式。請使用 ISO 8601 格式。', { itemIndex });
			}

			// 檢查並記錄時間處理參數
			this.logger.debug('時間格式檢查:', {
				原始: {
					開始: startDateTimeStr,
					結束: endDateTimeStr
				},
				正規化: {
					開始: normalizedStartDateTime,
					結束: normalizedEndDateTime
				},
				開始星期幾: getIsoWeekday(normalizedStartDateTime)
			});

			// 3. 建立 Neo4j 連接
			const uri = `${credentials.host}:${credentials.port}`;
			const neo4jUser = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';
			try {
				driver = neo4j.driver(uri, auth.basic(neo4jUser, password));
				await driver.verifyConnectivity();
				session = driver.session({ database });
				this.logger.debug('已成功建立 Neo4j 連接');
			} catch (connectionError) {
				throw parseNeo4jError(node, connectionError, 'Neo4j 連接失敗。');
			}

			// 4. 查詢商家信息、服務時長、營業時間、員工和資源
			const preQuery = `
				MATCH (b:Business {business_id: $businessId})
				OPTIONAL MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
				WITH b, collect(bh {
					day_of_week: bh.day_of_week,
					start_time: toString(bh.start_time),
					end_time: toString(bh.end_time)
				}) AS hoursList

				// 獲取服務信息
				MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)

				// 確認指定員工存在並能提供該服務 (修正關係方向)
				MATCH (st:Staff {staff_id: $requiredStaffId})-[:WORKS_AT]->(b)
				WITH b, hoursList, s, st
				MATCH (st)-[:CAN_PROVIDE]->(s)

				// 確認資源類型存在
				MATCH (rt:ResourceType {type_id: $requiredResourceTypeId, business_id: $businessId})

				RETURN s.duration_minutes AS durationMinutes,
				       hoursList,
				       st.name AS staffName,
				       rt.name AS resourceTypeName,
				       rt.total_capacity AS totalCapacity,
				       rt.description AS resourceTypeDescription
			`;
			const preQueryParams = {
				businessId,
				serviceId,
				requiredStaffId,
				requiredResourceTypeId
			};
			let durationMinutes: number | null = null;
			let businessHours: any[] = [];
			let staffName: string | null = null;
			let resourceTypeName: string | null = null;
			let totalCapacity: number | null = null;
			let resourceTypeDescription: string | null = null;

			try {
				this.logger.debug('執行預查詢獲取商家、服務、員工和資源信息', {
					businessId,
					serviceId,
					requiredStaffId,
					requiredResourceTypeId
				});

				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex });
				}

				const preResult = await session.run(preQuery, preQueryParams);

				if (preResult.records.length === 0) {
					throw new NodeOperationError(node, `找不到商家 ID '${businessId}'，或服務 ID '${serviceId}'，或員工 ID '${requiredStaffId}'，或資源類型 ID '${requiredResourceTypeId}'。`, { itemIndex });
				}

				const record = preResult.records[0];
				durationMinutes = convertNeo4jValueToJs(record.get('durationMinutes'));
				businessHours = convertNeo4jValueToJs(record.get('hoursList'));
				staffName = convertNeo4jValueToJs(record.get('staffName'));
				resourceTypeName = convertNeo4jValueToJs(record.get('resourceTypeName'));
				totalCapacity = convertNeo4jValueToJs(record.get('totalCapacity'));
				resourceTypeDescription = convertNeo4jValueToJs(record.get('resourceTypeDescription'));

				if (durationMinutes === null) {
					throw new NodeOperationError(node, `無法獲取服務 ID: ${serviceId} 的時長`, { itemIndex });
				}

				if (totalCapacity === null || totalCapacity < requiredResourceCapacity) {
					throw new NodeOperationError(node, `資源類型 '${resourceTypeName || requiredResourceTypeId}' 的總容量 (${totalCapacity}) 小於所需容量 (${requiredResourceCapacity})`, { itemIndex });
				}

				this.logger.debug('獲取到的商家信息:', {
					durationMinutes,
					businessHoursCount: Array.isArray(businessHours) ? businessHours.length : 'not an array',
					staffName,
					resourceTypeName,
					totalCapacity,
				});

			} catch (preQueryError) {
				throw parseNeo4jError(node, preQueryError, '獲取商家/服務/員工/資源信息失敗。');
			}

			// 5. 使用高效 Cypher 查詢直接生成和過濾時段 - 修改後的查詢
			const efficientQuery = `
				// 輸入參數
				WITH datetime($startDateTime) AS rangeStart,
					 datetime($endDateTime) AS rangeEnd,
					 $intervalMinutes AS intervalMinutes,
					 $serviceDuration AS serviceDurationMinutes, // Renamed from durationMinutes for clarity
					 $businessId AS businessId,
					 $requiredStaffId AS staffId,
					 $requiredResourceTypeId AS resourceTypeId,
					 $requiredResourceCapacity AS resourceCapacity,
					 $serviceId AS serviceId

				// 1. 生成時間序列
				WITH rangeStart, rangeEnd, intervalMinutes, serviceDurationMinutes, businessId, staffId, resourceTypeId, resourceCapacity, serviceId,
					 range(0, duration.between(rangeStart, rangeEnd).minutes / intervalMinutes) AS indices
				UNWIND indices AS index
				WITH rangeStart + duration({minutes: index * intervalMinutes}) AS slotStart,
					 duration({minutes: serviceDurationMinutes}) AS serviceDuration, // Use serviceDurationMinutes
					 businessId, staffId, resourceTypeId, resourceCapacity, serviceId,
					 serviceDurationMinutes AS durationMinutesVal // Pass duration as integer

				// 2. 計算結束時間和星期幾
				WITH slotStart, serviceDuration, slotStart + serviceDuration AS slotEnd,
					 date(slotStart) AS slotDate, date(slotStart).dayOfWeek AS slotDayOfWeek,
					 businessId, staffId, resourceTypeId, resourceCapacity, serviceId, durationMinutesVal

				// 3. 匹配商家、服務、指定員工和資源類型
				MATCH (b:Business {business_id: businessId})
				MATCH (st:Staff {staff_id: staffId})-[:WORKS_AT]->(b)
				MATCH (s:Service {service_id: serviceId})<-[:OFFERS]-(b)
				MATCH (rt:ResourceType {type_id: resourceTypeId, business_id: businessId})

				// 確認員工可以提供此服務
				WITH slotStart, slotEnd, slotDate, slotDayOfWeek, b, st, s, rt, resourceCapacity, durationMinutesVal
				MATCH (st)-[:CAN_PROVIDE]->(s)

				// 4. 檢查營業時間
				WITH slotStart, slotEnd, slotDate, slotDayOfWeek, b, st, s, rt, resourceCapacity, durationMinutesVal
				MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
				WHERE bh.day_of_week = slotDayOfWeek
				  AND time(bh.start_time) <= time(slotStart)
				  AND time(bh.end_time) >= time(slotEnd)

				// 5. 檢查員工可用性 - 分解為更簡單的查詢
				WITH slotStart, slotEnd, slotDate, slotDayOfWeek, b, st, s, rt, resourceCapacity, durationMinutesVal

				// 檢查常規排班
				OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(sched:StaffAvailability {type: 'SCHEDULE', day_of_week: slotDayOfWeek})
				WHERE time(sched.start_time) <= time(slotStart)
				  AND time(sched.end_time) >= time(slotEnd)

				WITH slotStart, slotEnd, slotDate, slotDayOfWeek, b, st, s, rt, resourceCapacity, durationMinutesVal,
				     CASE WHEN sched IS NOT NULL THEN true ELSE false END AS hasSchedule

				// 檢查例外可用時間
				OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(exc:StaffAvailability {type: 'EXCEPTION', date: slotDate})
				WHERE time(exc.start_time) <= time(slotStart)
				  AND time(exc.end_time) >= time(slotEnd)

				WITH slotStart, slotEnd, slotDate, b, st, s, rt, resourceCapacity, durationMinutesVal, hasSchedule,
				     CASE WHEN exc IS NOT NULL THEN true ELSE false END AS hasException

				// 檢查是否有全天阻塞的例外
				OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(blockingExc:StaffAvailability {type: 'EXCEPTION', date: slotDate})
				WHERE time(blockingExc.start_time) = time({hour: 0, minute: 0})
				  AND time(blockingExc.end_time) >= time({hour: 23, minute: 59})

				WITH slotStart, slotEnd, b, st, s, rt, resourceCapacity, durationMinutesVal, hasSchedule, hasException,
				     CASE WHEN blockingExc IS NOT NULL THEN true ELSE false END AS hasBlockingException

				// 6. 檢查資源可用性 - 拆分為更簡單的查詢
				WITH slotStart, slotEnd, b, st, s, rt, resourceCapacity, durationMinutesVal, hasSchedule, hasException, hasBlockingException
				WHERE rt.total_capacity >= resourceCapacity // 初始容量檢查

				// 檢查資源衝突
				OPTIONAL MATCH (existing:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rt)
				WHERE existing.status <> 'Cancelled'
				  AND existing.booking_time < slotEnd
				  AND existing.booking_time + duration({minutes: durationMinutesVal}) > slotStart // Corrected: Use durationMinutesVal

				WITH slotStart, slotEnd, b, st, s, rt, resourceCapacity, durationMinutesVal, hasSchedule, hasException, hasBlockingException,
				     COLLECT(ru.quantity) AS resourceUsages

				// 計算已使用資源總量，避免 IS NULL 問題
				WITH slotStart, slotEnd, b, st, s, durationMinutesVal, hasSchedule, hasException, hasBlockingException, resourceCapacity, rt,
				     REDUCE(total = 0, usage IN resourceUsages |
				        CASE WHEN usage IS NULL THEN total ELSE total + usage END) AS totalUsedCapacity

				// 檢查資源容量是否足夠
				WITH slotStart, slotEnd, b, st, s, durationMinutesVal, hasSchedule, hasException, hasBlockingException,
				     (resourceCapacity + totalUsedCapacity <= rt.total_capacity) AS hasEnoughResources

				// 7. 檢查員工預約衝突
				WITH slotStart, slotEnd, b, st, s, durationMinutesVal, hasSchedule, hasException, hasBlockingException, hasEnoughResources
				OPTIONAL MATCH (bk_staff:Booking)-[:SERVED_BY]->(st)
				WHERE bk_staff.status <> 'Cancelled'
				  AND bk_staff.booking_time < slotEnd
				  AND bk_staff.booking_time + duration({minutes: durationMinutesVal}) > slotStart // Corrected: Use durationMinutesVal

				// 最終篩選
				WITH slotStart, (hasSchedule OR hasException) AS isAvailable,
				     NOT hasBlockingException AS notBlocked,
				     hasEnoughResources AS resourceAvailable,
				     bk_staff IS NULL AS noStaffConflict
				WHERE isAvailable AND notBlocked AND resourceAvailable AND noStaffConflict

				// 8. 返回可用時段 (ISO 字符串)
				RETURN toString(slotStart) AS availableSlot
				ORDER BY slotStart
			`;

			const efficientParams: IDataObject = {
				businessId,
				serviceId,
				startDateTime: normalizedStartDateTime,
				endDateTime: normalizedEndDateTime,
				intervalMinutes: neo4j.int(intervalMinutes),
				serviceDuration: neo4j.int(durationMinutes), // Pass durationMinutes here
				requiredStaffId,
				requiredResourceTypeId,
				requiredResourceCapacity: neo4j.int(requiredResourceCapacity),
			};

			try {
				// 6. 執行高效查詢
				this.logger.debug('執行高效 StaffAndResource 可用時段查詢', efficientParams);

				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex });
				}

				const availableSlotsResults = await runCypherQuery.call(
					this,
					session,
					efficientQuery,
					efficientParams,
					false, // Read query
					itemIndex
				);

				// 7. 從查詢結果中提取可用時段
				const availableSlots: string[] = availableSlotsResults.map(record => record.json.availableSlot as string);

				this.logger.debug(`找到 ${availableSlots.length} 個可用時段`);

				// 8. 準備結果數據
				returnData.push({
					json: {
						availableSlots,
						mode: "StaffAndResource",
						serviceId,
						serviceDuration: durationMinutes,
						staffName: staffName || "未知員工",
						staffId: requiredStaffId,
						resourceTypeName: resourceTypeName || "未知資源類型",
						resourceTypeId: requiredResourceTypeId,
						requiredCapacity: requiredResourceCapacity,
						totalCapacity,
						resourceDescription: resourceTypeDescription || ""
					},
					pairedItem: { item: itemIndex },
				});

			} catch (queryError) {
				this.logger.error('執行可用性查詢時出錯:', queryError);
				throw parseNeo4jError(node, queryError, '檢查時段可用性失敗。');
			}

			// 9. 返回結果
			return this.prepareOutputData(returnData); // Moved outside the try-catch for query execution

		} catch (error) {
			// 10. 處理節點級錯誤
			if (error instanceof NodeOperationError) { throw error; }
			(error as any).itemIndex = itemIndex;
			throw parseNeo4jError(node, error);
		} finally {
			// 11. 關閉會話和驅動
			if (session) {
				try {
					await session.close();
					this.logger.debug('成功關閉 Neo4j 會話');
				} catch (e) {
					this.logger.error('關閉 Neo4j 會話時出錯:', e);
				}
			}
			if (driver) {
				try {
					await driver.close();
					this.logger.debug('成功關閉 Neo4j 驅動');
				} catch (e) {
					this.logger.error('關閉 Neo4j 驅動時出錯:', e);
				}
			}
		}
	}
}
