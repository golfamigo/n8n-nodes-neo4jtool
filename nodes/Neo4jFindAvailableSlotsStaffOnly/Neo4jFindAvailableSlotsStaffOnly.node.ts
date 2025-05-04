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
	runCypherQuery,
} from '../neo4j/helpers/utils';

// --- 導入時間處理工具函數 ---
import {
	normalizeDateTime,
	getIsoWeekday,
	convertToTimezone,
  getBusinessTimezone,
  detectQueryTimezone,
} from '../neo4j/helpers/timeUtils';

// --- 導入可用性檢查輔助函式 ---
import { checkStaffOnlyAvailability } from '../neo4j/helpers/availabilityChecks/checkStaffOnly';
// Removed unused: import { checkTimeOnlyAvailability } from '../neo4j/helpers/availabilityChecks/checkTimeOnly';

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
				description: '根據時間和員工可用性查找可用的預約時間段,businessId: 要查詢可用時段的商家 ID (UUID),serviceId: 要預約的服務 ID (UUID) (用於獲取時長),startDateTime: 查詢範圍的開始時間 (ISO 8601 格式, 需含時區),endDateTime: 查詢範圍的結束時間 (ISO 8601 格式, 需含時區),intervalMinutes: 生成潛在預約時段的時間間隔（分鐘）,requiredStaffId: 指定員工的 ID (UUID)（在 StaffOnly 模式下必填）',
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

			// 4. 查詢商家信息、服務時長和營業時間 (不再檢查 booking_mode)
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

				// 確認指定員工存在並能提供該服務
				MATCH (st:Staff {staff_id: $requiredStaffId})-[:WORKS_AT]->(b)
				WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) }

				RETURN s.duration_minutes AS durationMinutes,
				       hoursList,
				       st.name AS staffName
			`;
			const preQueryParams = { businessId, serviceId, requiredStaffId };
			let durationMinutes: number | null = null;
			let businessHours: any[] = []; // Although not directly used for filtering here, keep for context/future use
			let staffName: string | null = null;

			try {
				this.logger.debug('執行預查詢獲取商家、服務和員工信息', { businessId, serviceId, requiredStaffId });
				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex });
				}
				const preResult = await session.run(preQuery, preQueryParams);

				if (preResult.records.length === 0) {
					// More specific error
					throw new NodeOperationError(node, `找不到商家 '${businessId}', 或服務 '${serviceId}', 或員工 '${requiredStaffId}' (可能不存在, 不屬於該商家, 或無法提供此服務).`, { itemIndex });
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

			// 4.5 處理時區問題
			// 1. 檢測查詢時區
			const queryTimezone = detectQueryTimezone(startDateTimeStr);
			this.logger.debug('檢測到的查詢時區:', { queryTimezone });

			// 2. 如果沒有查詢時區，獲取商家時區
			let targetTimezone = queryTimezone;
			if (!targetTimezone) {
				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex });
				}
				targetTimezone = await getBusinessTimezone(session, businessId);
				this.logger.debug('使用商家時區:', { targetTimezone });
			}

			// 如果依然沒有時區信息，預設使用 UTC
			if (!targetTimezone) {
				targetTimezone = 'UTC';
				this.logger.debug('無法獲取有效時區，使用預設值 UTC');
			}

			// 5. 使用輔助函式生成可用時段
			const slotQuery = `
				// 生成時間範圍內的所有潛在時段
				WITH datetime($startDateTime) as rangeStart,
					 datetime($endDateTime) as rangeEnd,
					 $intervalMinutes as intervalMinutes

				// 生成索引序列，然後生成所有潛在時段
				WITH rangeStart, rangeEnd, intervalMinutes,
					 CASE
						 WHEN duration.between(rangeStart, rangeEnd).minutes < 0 THEN [] // Handle negative duration
						 ELSE range(0, duration.between(rangeStart, rangeEnd).minutes / intervalMinutes)
					 END as indices
				UNWIND indices as index
				WITH rangeStart + duration({minutes: index * intervalMinutes}) as slotTime

				// Filter slots ending after rangeEnd (important after adding duration)
				// We need durationMinutes here, but it's not available in this query yet.
				// The check will happen inside the loop using checkStaffOnlyAvailability.

				// 返回可能的時段
				RETURN toString(slotTime) as potentialSlot
				ORDER BY slotTime
			`;

			const slotParams: IDataObject = {
				startDateTime: normalizedStartDateTime,
				endDateTime: normalizedEndDateTime,
				intervalMinutes,
			};

			try {
				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex });
				}

				const potentialSlotsResults = await runCypherQuery.call(
					this,
					session,
					slotQuery,
					slotParams,
					false,
					itemIndex
				);

				// 獲取所有潛在時段
				const potentialSlots = potentialSlotsResults.map(record => record.json.potentialSlot as string);
				const availableSlots: string[] = [];

				// 針對每個潛在時段，使用 checkStaffOnlyAvailability 輔助函式檢查是否可用
				for (const slot of potentialSlots) {
					try {
						// Ensure durationMinutes is not null before calling the check
						if (durationMinutes === null) {
							throw new NodeOperationError(node, "Internal error: Service duration is null.", { itemIndex });
						}
						// Check if slot end time exceeds the requested range end time
						const { DateTime } = require('luxon');
						const slotStart = DateTime.fromISO(slot);
						const slotEnd = slotStart.plus({ minutes: durationMinutes });
						const rangeEndDt = DateTime.fromISO(normalizedEndDateTime);
						if (!slotStart.isValid || !slotEnd.isValid || !rangeEndDt.isValid) {
							this.logger.warn(`Skipping invalid slot or range end: ${slot}`);
							continue; // Skip this invalid slot
						}
						if (slotEnd > rangeEndDt) {
							this.logger.debug(`Skipping slot ${slot} as it ends after range end ${normalizedEndDateTime}`);
							continue; // Skip slot if it ends after the specified range
						}


						await checkStaffOnlyAvailability(
							session,
							{
								businessId,
								serviceId,
								staffId: requiredStaffId,
								bookingTime: slot,
								itemIndex,
								node: this,
							},
							this
						);
						// 如果沒有拋出錯誤，則表示時段可用
						availableSlots.push(slot);
					} catch (error) {
						// 時段不可用，繼續檢查下一個
						if (error instanceof Error) {
							this.logger.debug(`時段 ${slot} 不可用: ${error.message}`);
						} else {
							this.logger.debug(`檢查時段 ${slot} 時發生未知錯誤`);
						}
					}
				}

				this.logger.debug(`找到 ${availableSlots.length} 個可用時段`);

				// 將 UTC 時間轉換為目標時區
				const convertedSlots = availableSlots.map(slot => convertToTimezone(slot, targetTimezone!));

				this.logger.debug(`轉換時區 (${targetTimezone}) 後的可用時段:`, {
					原始UTC: availableSlots,
					轉換後: convertedSlots
				});

				// 準備結果數據
				returnData.push({
					json: {
						availableSlots,
						timezone: targetTimezone,
						mode: "StaffOnly",
						serviceId,
						serviceDuration: durationMinutes,
						staffName: staffName || "未知員工",
						staffId: requiredStaffId
					},
					pairedItem: { item: itemIndex },
				});

			} catch (queryError) {
				this.logger.error('執行可用性查詢時出錯:', queryError);
				throw parseNeo4jError(node, queryError, '檢查時段可用性失敗。');
			}

			// 返回結果
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 處理節點級錯誤
			if (error instanceof NodeOperationError) { throw error; }
			(error as any).itemIndex = itemIndex;
			throw parseNeo4jError(node, error);
		} finally {
			// 關閉會話和驅動
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
