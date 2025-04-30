// ============================================================================
// N8N Neo4j Node: Find Available Slots - ResourceOnly Mode
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
	// generateTimeSlotsWithBusinessHours, // Removed
	getIsoWeekday, // Keep for potential logging
} from '../neo4j/helpers/timeUtils';

// Removed resourceUtils import as the logic will be inline in Cypher
// Removed duplicate import: import neo4j from 'neo4j-driver';

// --- Node Class Definition ---
export class Neo4jFindAvailableSlotsResourceOnly implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Find Available Slots ResourceOnly',
		name: 'neo4jFindAvailableSlotsResourceOnly',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'ResourceOnly mode for Business {{$parameter["businessId"]}}',
		description: '根據時間和資源可用性查找可用的預約時間段。所有ID格式為 UUID(例如: ecadf8cb-f865-41d2-a1a0-db4311222cdc)，Required_Resource_TypeRequired_Resource_Type：所需資源類型的唯一識別碼 (Type ID)，格式為 UUID (例如: 17120d3b-7af6-4501-ada6-b2ec7193b6b9)，不是資源名稱。,businessId: 要查詢可用時段的商家 ID (UUID),serviceId: 要預約的服務 ID (UUID) (用於獲取時長),startDateTime: 查詢範圍的開始時間 (ISO 8601 格式, 需含時區),endDateTime: 查詢範圍的結束時間 (ISO 8601 格式, 需含時區),intervalMinutes: 生成潛在預約時段的時間間隔（分鐘）,requiredResourceTypeId: 所需資源類型的唯一識別碼 (Type ID) (UUID)，不是名稱,requiredResourceCapacity: 所需資源數量（預設為 1）。',
		defaults: {
			name: 'Neo4j Find Slots ResourceOnly',
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
				name: 'requiredResourceTypeId',
				type: 'string',
				required: true,
				default: '',
				description: '所需資源類型的唯一識別碼 (Type ID)，不是名稱',
			},
			{
				displayName: 'Required Resource Capacity',
				name: 'requiredResourceCapacity',
				type: 'number',
				typeOptions: { numberStep: 1 },
				default: 1,
				description: '所需資源數量（預設為 1）',
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
			const requiredResourceTypeId = this.getNodeParameter('requiredResourceTypeId', itemIndex, '') as string;
			const requiredResourceCapacity = this.getNodeParameter('requiredResourceCapacity', itemIndex, 1) as number;

			// 驗證必填參數
			if (!requiredResourceTypeId) {
				throw new NodeOperationError(node, 'ResourceOnly 模式下必須指定 Required Resource Type ID。', { itemIndex });
			}

			// 記錄接收到的參數
			this.logger.debug('執行 FindAvailableSlotsResourceOnly，參數:', {
				businessId,
				serviceId,
				startDateTime: startDateTimeStr,
				endDateTime: endDateTimeStr,
				intervalMinutes,
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

			// 特別記錄時區清水監測訊息
			const { DateTime } = require('luxon');
			const startDt = DateTime.fromISO(normalizedStartDateTime);
			const endDt = DateTime.fromISO(normalizedEndDateTime);
			this.logger.debug('時區清水監測:', {
				開始時間: {
					原始: startDateTimeStr,
					正規化: normalizedStartDateTime,
					時區: startDt.zoneName,
					偏移量: startDt.offset,
					UTC轉換: startDt.toUTC().toISO()
				},
				結束時間: {
					原始: endDateTimeStr,
					正規化: normalizedEndDateTime,
					時區: endDt.zoneName,
					偏移量: endDt.offset,
					UTC轉換: endDt.toUTC().toISO()
				}
			});

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

			// 4. 查詢商家信息、服務時長、營業時間和資源類型情況
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

				// 獲取資源類型信息 - 同時支持直接屬性關聯和 BELONGS_TO 關係
				MATCH (rt:ResourceType)
				WHERE rt.type_id = $requiredResourceTypeId AND
				      (rt.business_id = $businessId OR EXISTS((rt)-[:BELONGS_TO]->(b)))

				RETURN s.duration_minutes AS durationMinutes,
				       hoursList,
				       rt.name AS resourceTypeName,
				       rt.total_capacity AS totalCapacity,
				       rt.description AS resourceTypeDescription
			`;
			const preQueryParams = {
				businessId,
				serviceId,
				requiredResourceTypeId
			};

			let durationMinutes: number | null = null;
			let businessHours: any[] = [];
			let resourceTypeName: string | null = null;
			let totalCapacity: number | null = null;
			let resourceTypeDescription: string | null = null;

			try {
				this.logger.debug('執行預查詢獲取商家、服務和資源類型信息', preQueryParams);
				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex });
				}
				const preResult = await session.run(preQuery, preQueryParams);

				if (preResult.records.length === 0) {
					throw new NodeOperationError(node, `找不到商家 ID '${businessId}'，或服務 ID '${serviceId}'，或資源類型的唯一識別碼 Type ID '${requiredResourceTypeId}'。`, { itemIndex });
				}

				const record = preResult.records[0];
				durationMinutes = convertNeo4jValueToJs(record.get('durationMinutes'));
				businessHours = convertNeo4jValueToJs(record.get('hoursList'));
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
					resourceTypeName,
					totalCapacity,
					resourceTypeDescription,
				});

			} catch (preQueryError) {
				throw parseNeo4jError(node, preQueryError, '獲取商家/服務/資源類型信息失敗。');
			}

			// 5. 使用高效 Cypher 查詢直接生成和過濾時段
			const efficientQuery = `
				// 輸入參數
				WITH datetime($startDateTime) AS rangeStart,
					 datetime($endDateTime) AS rangeEnd,
					 $intervalMinutes AS intervalMinutes,
					 $serviceDuration AS serviceDurationMinutes,
					 $businessId AS businessId,
					 $requiredResourceTypeId AS resourceTypeId,
					 $requiredResourceCapacity AS resourceCapacity

				// 1. 生成時間序列
				WITH rangeStart, rangeEnd, intervalMinutes, serviceDurationMinutes, businessId, resourceTypeId, resourceCapacity,
					 range(0, duration.between(rangeStart, rangeEnd).minutes / intervalMinutes) AS indices
				UNWIND indices AS index
				WITH rangeStart + duration({minutes: index * intervalMinutes}) AS slotStart,
					 duration({minutes: serviceDurationMinutes}) AS serviceDuration,
					 businessId, resourceTypeId, resourceCapacity

				// 2. 計算結束時間和星期幾
				WITH slotStart, serviceDuration, slotStart + serviceDuration AS slotEnd,
					 date(slotStart).dayOfWeek AS slotDayOfWeek,
					 businessId, resourceTypeId, resourceCapacity

				// 3. 匹配商家和資源類型
				MATCH (b:Business {business_id: businessId})
				MATCH (rt:ResourceType {type_id: resourceTypeId, business_id: businessId}) // Ensure resource type belongs to business

				// 4. 檢查營業時間
				WHERE EXISTS {
					MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
					WHERE bh.day_of_week = slotDayOfWeek
					AND time(bh.start_time) <= time(slotStart)
					AND time(bh.end_time) >= time(slotEnd)
				}

				// 5. 計算每個潛在時段已使用的資源總量 (Revised Logic)
				WITH slotStart, slotEnd, b, rt, resourceCapacity // Pass necessary variables
				OPTIONAL MATCH (existing:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rt)
				MATCH (existing)-[:FOR_SERVICE]->(s_existing:Service)
				WHERE existing.status <> 'Cancelled'
				  AND existing.booking_time < slotEnd // Existing booking starts before potential slot ends
				  AND existing.booking_time + duration({minutes: s_existing.duration_minutes}) > slotStart // Existing booking ends after potential slot starts
				WITH slotStart, rt, resourceCapacity, sum(coalesce(ru.quantity, 0)) AS totalUsedDuringSlot // Aggregate total usage for the slot

				// 6. 檢查資源容量是否足夠
				WHERE rt.total_capacity >= totalUsedDuringSlot + resourceCapacity

				// 7. 返回可用時段 (ISO 字符串)
				RETURN toString(slotStart) AS availableSlot
				ORDER BY slotStart
			`;

			const efficientParams: IDataObject = {
				businessId,
				// serviceId is not directly needed in the query as duration is passed
				startDateTime: normalizedStartDateTime,
				endDateTime: normalizedEndDateTime,
				intervalMinutes: neo4j.int(intervalMinutes),
				serviceDuration: neo4j.int(durationMinutes), // Pass duration from preQuery
				requiredResourceTypeId,
				requiredResourceCapacity: neo4j.int(requiredResourceCapacity),
			};

			try {
				// 6. 執行高效查詢
				this.logger.debug('執行高效 ResourceOnly 可用時段查詢', efficientParams);

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
						mode: "ResourceOnly",
						serviceId,
						serviceDuration: durationMinutes,
						resourceType: resourceTypeName || requiredResourceTypeId,
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
				} catch (e) {
					this.logger.error('Error closing Neo4j session:', e);
				}
			}
			if (driver) {
				try {
					await driver.close();
				} catch (e) {
					this.logger.error('Error closing Neo4j driver:', e);
				}
			}
		}
	}
}
