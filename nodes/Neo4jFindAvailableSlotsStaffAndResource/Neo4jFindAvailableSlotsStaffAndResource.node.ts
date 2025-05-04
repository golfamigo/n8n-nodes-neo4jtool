// ============================================================================
// N8N Neo4j Node: Find Available Slots - StaffAndResource Mode
// ============================================================================
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
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
	getIsoWeekday,
	convertToTimezone,
  getBusinessTimezone,
  detectQueryTimezone,
} from '../neo4j/helpers/timeUtils';

// --- 導入輔助函式 ---
import {
	checkStaffAndResourceAvailability,
	StaffAndResourceCheckParams
} from '../neo4j/helpers/availabilityChecks/checkStaffAndResource';

// --- 導入 Luxon DateTime 處理時間 ---
import { DateTime } from 'luxon';

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

			// 4. 查詢基本資訊
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
				WITH b, hoursList, s, st
				MATCH (st)-[:CAN_PROVIDE]->(s)

				// 確認資源類型存在
				MATCH (rt:ResourceType {type_id: $requiredResourceTypeId})
				WHERE rt.business_id = $businessId OR EXISTS((rt)-[:BELONGS_TO]->(b))

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
					// 提供更具體的錯誤信息
					throw new NodeOperationError(node, `找不到商家 ID '${businessId}', 或服務 ID '${serviceId}', 或員工 ID '${requiredStaffId}' (可能無法提供服務), 或資源類型 ID '${requiredResourceTypeId}'.`, { itemIndex });
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

			// 5. 生成時間序列並檢查每個時段
			// 直接使用 DateTime 處理時間間隔和序列生成
			const startDT = DateTime.fromISO(normalizedStartDateTime);
			const endDT = DateTime.fromISO(normalizedEndDateTime);

			if (!startDT.isValid || !endDT.isValid) {
				throw new NodeOperationError(node, '無效的日期時間。', { itemIndex });
			}

			// 計算時間間隔總數
			const totalMinutes = endDT.diff(startDT, 'minutes').minutes;
			const slotsCount = Math.floor(totalMinutes / intervalMinutes);

			this.logger.debug('生成時間序列:', {
				總時間差_分鐘: totalMinutes,
				時段間隔_分鐘: intervalMinutes,
				總時段數: slotsCount
			});

			const availableSlots: string[] = [];

			// 為每個時段使用 checkStaffAndResourceAvailability 檢查可用性
			for (let i = 0; i < slotsCount; i++) {
				const slotStartDT = startDT.plus({ minutes: i * intervalMinutes });
				const slotEndDT = slotStartDT.plus({ minutes: durationMinutes });

				// 檢查是否超出範圍
				if (slotEndDT > endDT) {
					break;
				}

				const bookingTimeISO = slotStartDT.toISO();
				if (!bookingTimeISO) {
					continue; // 跳過無效時間格式
				}

				try {
					// 使用輔助函數檢查可用性
					const checkParams: StaffAndResourceCheckParams = {
						businessId,
						serviceId,
						staffId: requiredStaffId,
						resourceTypeId: requiredResourceTypeId,
						resourceQuantity: requiredResourceCapacity,
						bookingTime: bookingTimeISO,
						itemIndex,
						node: this,
					};

					// 使用 checkStaffAndResourceAvailability 輔助函數檢查可用性
					await checkStaffAndResourceAvailability(session, checkParams, this);

					// 如果沒有拋出錯誤，則表示此時段可用
					availableSlots.push(bookingTimeISO);
					this.logger.debug(`時段可用: ${bookingTimeISO}`);
				} catch (slotError) {
					// 如果是 NodeOperationError，則表示此時段不可用，這是預期的
					if (slotError instanceof NodeOperationError) {
						this.logger.debug(`時段不可用 ${bookingTimeISO}: ${slotError.message}`);
					} else {
						// 對於其他錯誤，記錄但繼續檢查下一個時段
						this.logger.warn(`檢查時段 ${bookingTimeISO} 時發生錯誤:`, slotError);
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

			// 6. 準備結果數據
			returnData.push({
				json: {
					availableSlots,
					timezone: targetTimezone,
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
