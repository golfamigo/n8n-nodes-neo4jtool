// ============================================================================
// N8N Neo4j Node: Find Available Slots - TimeOnly Mode
// ============================================================================
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
	// Removed unused: IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';
import { DateTime } from 'luxon';

// --- 導入共用工具函數 ---
import {
	parseNeo4jError,
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

// --- 導入時間可用性檢查工具函數 ---
import {
	checkTimeOnlyAvailability,
	TimeOnlyCheckParams,
} from '../neo4j/helpers/availabilityChecks/checkTimeOnly';

// --- Node Class Definition ---
export class Neo4jFindAvailableSlotsTimeOnly implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Find Available Slots TimeOnly',
		name: 'neo4jFindAvailableSlotsTimeOnly',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'TimeOnly mode for Business {{$parameter["businessId"]}}',
		description: '根據時間查找可用的預約時間段 (僅考慮時間衝突),businessId: 要查詢可用時段的商家 ID (UUID),serviceId: 要預約的服務 ID (UUID) (用於獲取時長),startDateTime: 查詢範圍的開始時間 (ISO 8601 格式, 需含時區),endDateTime: 查詢範圍的結束時間 (ISO 8601 格式, 需含時區),intervalMinutes: 生成潛在預約時段的時間間隔（分鐘）',
		defaults: {
			name: 'Neo4j Find Slots TimeOnly',
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

			// 記錄接收到的參數
			this.logger.debug('執行 FindAvailableSlotsTimeOnly，參數:', {
				businessId,
				serviceId,
				startDateTime: startDateTimeStr,
				endDateTime: endDateTimeStr,
				intervalMinutes,
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

			// 4. 查詢服務時長 (只為獲取時長，用於後續生成時段)
			const serviceQuery = `
				MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b:Business {business_id: $businessId})
				RETURN s.duration_minutes AS durationMinutes
			`;
			const serviceQueryParams = { businessId, serviceId };
			let durationMinutes: number | null = null;

			try {
				this.logger.debug('執行服務時長查詢', { businessId, serviceId });

				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex });
				}

				const serviceResults = await runCypherQuery.call(
					this,
					session,
					serviceQuery,
					serviceQueryParams,
					false,
					itemIndex
				);

				if (serviceResults.length === 0) {
					throw new NodeOperationError(node, `找不到商家 ID '${businessId}' 或服務 ID '${serviceId}'，或兩者沒有關聯。`, { itemIndex });
				}

				durationMinutes = typeof serviceResults[0].json?.durationMinutes === 'number'
                    ? serviceResults[0].json.durationMinutes
                    : null;

				if (durationMinutes === null || durationMinutes <= 0) { // Add check for duration <= 0
					throw new NodeOperationError(node, `無法獲取或服務 ID: ${serviceId} 的時長無效 (${durationMinutes})`, { itemIndex });
				}

				this.logger.debug('獲取到的服務時長:', { durationMinutes });
			} catch (serviceQueryError) {
				throw parseNeo4jError(node, serviceQueryError, '獲取服務時長失敗。');
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

			// 5. 生成時間槽並檢查可用性
			const startDt = DateTime.fromISO(normalizedStartDateTime);
			const endDt = DateTime.fromISO(normalizedEndDateTime);

			if (!startDt.isValid || !endDt.isValid) {
				throw new NodeOperationError(node, '無效的日期時間格式', { itemIndex });
			}

			// 計算時間範圍內總分鐘數，用於確定可能的時段數量
			const durationInMinutes = endDt.diff(startDt, 'minutes').minutes;

			// Handle edge case where interval is larger than duration or duration is negative
			if (intervalMinutes <= 0) {
				throw new NodeOperationError(node, 'Slot Interval (Minutes) 必須大於 0。', { itemIndex });
			}
			const totalPossibleSlots = durationInMinutes >= 0 ? Math.floor(durationInMinutes / intervalMinutes) : 0;

			this.logger.debug('時間範圍統計:', {
				開始: startDt.toISO(),
				結束: endDt.toISO(),
				總分鐘數: durationInMinutes,
				總可能時段數: totalPossibleSlots
			});

			// 生成所有可能的時段
			const possibleSlots: string[] = [];
			for (let i = 0; i < totalPossibleSlots; i++) {
				const slotTime = startDt.plus({ minutes: i * intervalMinutes });
				// Ensure generated slot is valid before pushing
                if (slotTime.isValid && slotTime.toISO()) {
					possibleSlots.push(slotTime.toISO()!);
				} else {
					this.logger.warn(`Generated invalid slot time at index ${i}, skipping.`);
				}
			}

			// 使用輔助函數檢查每個時段的可用性
			const availableSlots: string[] = [];

			for (const slot of possibleSlots) {
				try {
					// Additional check: Ensure the slot + duration doesn't exceed the end time
                    const currentSlotStart = DateTime.fromISO(slot);
                    // durationMinutes is guaranteed non-null and > 0 here
                    const currentSlotEnd = currentSlotStart.plus({ minutes: durationMinutes! });

                    if (!currentSlotStart.isValid || !currentSlotEnd.isValid) {
                        this.logger.warn(`Skipping check for invalid slot DateTime: ${slot}`);
                        continue;
                    }

                    if (currentSlotEnd > endDt) {
                        this.logger.debug(`Skipping slot ${slot} as it ends after the range end ${endDt.toISO()}`);
                        continue;
                    }


					// 準備 checkTimeOnlyAvailability 函數的參數
					const checkParams: TimeOnlyCheckParams = {
						businessId,
						serviceId,
						bookingTime: slot,
						itemIndex,
						node: this,
					};

					// 使用輔助函數檢查該時段的可用性
					if (session) {
						await checkTimeOnlyAvailability(session, checkParams, this);
						// 如果沒有拋出錯誤，則該時段可用
						availableSlots.push(slot);
						this.logger.debug(`時段 ${slot} 可用`);
					}
				} catch (slotError) {
					// 時段不可用的錯誤，記錄但不中斷流程
					if (slotError instanceof NodeOperationError) {
						this.logger.debug(`時段 ${slot} 不可用: ${slotError.message}`);
					} else if (slotError instanceof Error) {
						this.logger.debug(`檢查時段 ${slot} 時發生錯誤: ${slotError.message}`);
                    } else {
						this.logger.warn(`檢查時段 ${slot} 時發生未知錯誤`);
					}
				}
			}

			this.logger.debug(`找到 ${availableSlots.length} 個可用時段，共檢查了 ${possibleSlots.length} 個可能時段`);

			// 將 UTC 時間轉換為目標時區
			const convertedSlots = availableSlots.map(slot => convertToTimezone(slot, targetTimezone!));

			this.logger.debug(`轉換時區 (${targetTimezone}) 後的可用時段:`, {
				原始UTC: availableSlots,
				轉換後: convertedSlots
			});

			// 6. 準備結果數據
			returnData.push({
				json: {
					availableSlots,
					timezone: targetTimezone,
					mode: "TimeOnly",
					serviceId,
					serviceDuration: durationMinutes, // durationMinutes is guaranteed non-null here
					checkedSlots: possibleSlots.length
				},
				pairedItem: { item: itemIndex },
			});

			// 7. 返回結果
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 8. 處理節點級錯誤
			if (error instanceof NodeOperationError) { throw error; }
			(error as any).itemIndex = itemIndex;
			throw parseNeo4jError(node, error);
		} finally {
			// 9. 關閉會話和驅動
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
