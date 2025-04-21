// ============================================================================
// N8N Neo4j Node: Find Available Slots - StaffOnly Mode
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
} from '../neo4j/helpers/utils';

// --- 導入時間處理工具函數 ---
import {
	normalizeDateTime,
	generateTimeSlotsWithBusinessHours,
	getIsoWeekday,
	// 以下保留供未來擴展使用
	toNeo4jDateTime as _toNeo4jDateTime,
} from '../neo4j/helpers/timeUtils';

// --- Node Class Definition ---
export class Neo4jFindAvailableSlotsStaffOnly implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Find Available Slots StaffOnly',
		name: 'neo4jFindAvailableSlotsStaffOnly',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'StaffOnly mode for Business {{$parameter["businessId"]}}',
		description: '根據時間和員工可用性查找可用的預約時間段',
		defaults: {
			name: 'Neo4j Find Slots StaffOnly',
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
				description: '指定員工的 ID（在 StaffOnly 模式下必填）',
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

			// 驗證必填參數
			if (!requiredStaffId) {
				throw new NodeOperationError(node, 'StaffOnly 模式下必須指定 Required Staff ID。', { itemIndex });
			}

			// 記錄接收到的參數
			this.logger.debug('執行 FindAvailableSlotsStaffOnly，參數:', {
				businessId,
				serviceId,
				startDateTime: startDateTimeStr,
				endDateTime: endDateTimeStr,
				intervalMinutes,
				requiredStaffId,
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

			// 4. 查詢商家信息、服務時長和營業時間
			const preQuery = `
				MATCH (b:Business {business_id: $businessId})
				WHERE b.booking_mode = 'StaffOnly'
				OPTIONAL MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
				WITH b, collect(bh {
					day_of_week: bh.day_of_week,
					start_time: toString(bh.start_time),
					end_time: toString(bh.end_time)
				}) AS hoursList

				// 獲取服務信息
				MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)

				// 確認指定員工存在並能提供該服務
				MATCH (b)-[:EMPLOYS]->(st:Staff {staff_id: $requiredStaffId})
				MATCH (st)-[:CAN_PROVIDE]->(s)

				RETURN s.duration_minutes AS durationMinutes,
				       hoursList,
				       st.name AS staffName
			`;
			const preQueryParams = { businessId, serviceId, requiredStaffId };
			let durationMinutes: number | null = null;
			let businessHours: any[] = [];
			let staffName: string | null = null;

			try {
				this.logger.debug('執行預查詢獲取商家、服務和員工信息', { businessId, serviceId, requiredStaffId });
				const preResult = await session.run(preQuery, preQueryParams);

				if (preResult.records.length === 0) {
					throw new NodeOperationError(node, `找不到 StaffOnly 模式的商家 '${businessId}'，或服務 '${serviceId}'，或指定員工 '${requiredStaffId}' 無法提供該服務。`, { itemIndex });
				}

				const record = preResult.records[0];
				durationMinutes = convertNeo4jValueToJs(record.get('durationMinutes'));
				businessHours = convertNeo4jValueToJs(record.get('hoursList'));
				staffName = convertNeo4jValueToJs(record.get('staffName'));

				if (durationMinutes === null) {
					throw new NodeOperationError(node, `無法獲取服務 ID: ${serviceId} 的時長`, { itemIndex });
				}

				this.logger.debug('獲取到的商家信息:', {
					durationMinutes,
					businessHoursCount: Array.isArray(businessHours) ? businessHours.length : 'not an array',
					staffName,
				});

			} catch (preQueryError) {
				throw parseNeo4jError(node, preQueryError, '獲取商家/服務/員工信息失敗。');
			}

			// 5. 使用時間工具函數生成潛在時段
			const potentialSlots = generateTimeSlotsWithBusinessHours(
				normalizedStartDateTime,
				normalizedEndDateTime,
				businessHours,
				intervalMinutes
			);

			this.logger.debug(`生成了 ${potentialSlots.length} 個潛在時段`);

			if (potentialSlots.length === 0) {
				this.logger.debug('根據營業時間和時間範圍未生成任何潛在時段。');

				// 返回空結果，但提供信息性消息
				returnData.push({
					json: {
						availableSlots: [],
						totalPotentialSlots: 0,
						filteredOutSlots: 0,
						message: "未找到潛在時段 - 請檢查營業時間和日期範圍",
						mode: "StaffOnly",
						staffName: staffName || "未知員工"
					},
					pairedItem: { item: itemIndex },
				});

				return this.prepareOutputData(returnData);
			}

			// 6. StaffOnly 查詢 - 檢查營業時間、員工可用性和預約衝突
			const staffOnlyQuery = `
				// 輸入：潛在時段開始時間列表 (ISO 字符串)
				UNWIND $potentialSlots AS slotStr
				WITH datetime(slotStr) AS slotStart

				// 獲取商家、服務、時長
				MATCH (b:Business {business_id: $businessId})
				MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)
				WITH b, s, slotStart, duration({minutes: s.duration_minutes}) AS serviceDuration
				WITH b, s, slotStart, serviceDuration, slotStart + serviceDuration AS slotEnd

				// 檢查商家營業時間
				MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
				WHERE bh.day_of_week = date(slotStart).dayOfWeek
					AND time(bh.start_time) <= time(slotStart)
					AND time(bh.end_time) >= time(slotEnd)

				WITH b, s, slotStart, slotEnd, serviceDuration

				// 檢查指定員工的可用性
				MATCH (b)-[:EMPLOYS]->(st:Staff {staff_id: $requiredStaffId})
				WHERE EXISTS {
					MATCH (st)-[:CAN_PROVIDE]->(s)
				}
				AND EXISTS {
					MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability)
					WHERE sa.day_of_week = date(slotStart).dayOfWeek
						AND time(sa.start_time) <= time(slotStart)
						AND time(sa.end_time) >= time(slotEnd)
				}

				// 檢查員工是否有其他預約衝突
				AND NOT EXISTS {
					MATCH (bk:Booking)-[:SERVED_BY]->(st)
					WHERE bk.booking_time < slotEnd
						AND bk.booking_time + duration({minutes: $durationMinutes}) > slotStart
				}

				// 檢查商家是否有其他預約衝突
				WITH b, st, slotStart, slotEnd, serviceDuration
				WHERE NOT EXISTS {
					MATCH (bk:Booking)-[:AT_BUSINESS]->(b)
					WHERE bk.booking_time < slotEnd
						AND bk.booking_time + duration({minutes: $durationMinutes}) > slotStart
						AND NOT EXISTS { MATCH (bk)-[:SERVED_BY]->(st) } // 排除已檢查過的員工預約
				}

				RETURN toString(slotStart) AS availableSlot,
				       st.name AS staffName
				ORDER BY availableSlot
			`;

			const staffOnlyParams: IDataObject = {
				businessId,
				serviceId,
				potentialSlots,
				requiredStaffId,
				durationMinutes: neo4j.int(durationMinutes)
			};

			try {
				// 7. 執行 StaffOnly 查詢
				this.logger.debug('執行員工模式可用時段查詢', {
					potentialSlotsCount: potentialSlots.length,
					firstSlot: potentialSlots.length > 0 ? potentialSlots[0] : null,
					lastSlot: potentialSlots.length > 0 ? potentialSlots[potentialSlots.length - 1] : null,
					staffName: staffName
				});

				const mainResult = await session.run(staffOnlyQuery, staffOnlyParams);
				const availableSlots = mainResult.records.map(record => record.get('availableSlot'));
				const staffNameResult = mainResult.records.length > 0 ? mainResult.records[0].get('staffName') : staffName;

				this.logger.debug(`找到 ${availableSlots.length} 個可用時段，從 ${potentialSlots.length} 個潛在時段中篩選`);

				// 8. 準備結果數據
				returnData.push({
					json: {
						availableSlots,
						totalPotentialSlots: potentialSlots.length,
						filteredOutSlots: potentialSlots.length - availableSlots.length,
						mode: "StaffOnly",
						staffName: staffNameResult || staffName || "未知員工",
						staffId: requiredStaffId
					},
					pairedItem: { item: itemIndex },
				});
			} catch (queryError) {
				this.logger.error('執行可用性查詢時出錯:', queryError);
				throw parseNeo4jError(node, queryError, '檢查時段可用性失敗。');
			}

			// 9. 返回結果
			return this.prepareOutputData(returnData);

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
