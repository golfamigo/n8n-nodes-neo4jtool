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
	generateTimeSlotsWithBusinessHours,
	getIsoWeekday,
} from '../neo4j/helpers/timeUtils';

import {
  generateResourceAvailabilityQuery,
} from '../neo4j/helpers/resourceUtils';

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
		description: '根據時間和資源可用性查找可用的預約時間段',
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
				name: 'requiredResourceType',
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
			const requiredResourceType = this.getNodeParameter('requiredResourceType', itemIndex, '') as string;
			const requiredResourceCapacity = this.getNodeParameter('requiredResourceCapacity', itemIndex, 1) as number;

			// 驗證必填參數
			if (!requiredResourceType) {
				throw new NodeOperationError(node, 'ResourceOnly 模式下必須指定 Required Resource Type。', { itemIndex });
			}

			// 記錄接收到的參數
			this.logger.debug('執行 FindAvailableSlotsResourceOnly，參數:', {
				businessId,
				serviceId,
				startDateTime: startDateTimeStr,
				endDateTime: endDateTimeStr,
				intervalMinutes,
				requiredResourceType,
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
				WHERE rt.type_id = $requiredResourceType AND
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
				requiredResourceType
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
					throw new NodeOperationError(node, `找不到商家 ID '${businessId}'，或服務 ID '${serviceId}'，或資源類型的唯一識別碼 Type ID '${requiredResourceType}'。`, { itemIndex });
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
					throw new NodeOperationError(node, `資源類型 '${resourceTypeName || requiredResourceType}' 的總容量 (${totalCapacity}) 小於所需容量 (${requiredResourceCapacity})`, { itemIndex });
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

			// 5. 使用時間工具函數生成潛在時段
			this.logger.debug('開始生成潛在時段，營業時間為:', businessHours);

			// 調試營業時間格式的比較
			if (businessHours && businessHours.length > 0) {
				const tomorrow = DateTime.fromISO(normalizedStartDateTime);
				const targetWeekday = tomorrow.weekday;
				this.logger.debug(`目標日期 ${tomorrow.toISO()} 是星期 ${targetWeekday}`);

				const matchingHours = businessHours.filter(bh => bh.day_of_week === targetWeekday);
				if (matchingHours.length > 0) {
					this.logger.debug('發現符合星期的營業時間:', matchingHours);

					// 檢查時間比較邏輯
					const firstHour = matchingHours[0];
					const startTimeObj = DateTime.fromISO(firstHour.start_time || firstHour.start_time);
					const endTimeObj = DateTime.fromISO(firstHour.end_time || firstHour.end_time);
					const requestStart = startDt.toFormat('HH:mm:ss');
					const requestEnd = endDt.toFormat('HH:mm:ss');

					this.logger.debug('時間比較:', {
						期望開始: requestStart,
						營業開始: startTimeObj ? startTimeObj.toFormat('HH:mm:ss') : firstHour.start_time,
						開始時間比較: firstHour.start_time <= requestStart,
						期望結束: requestEnd,
						營業結束: endTimeObj ? endTimeObj.toFormat('HH:mm:ss') : firstHour.end_time,
						結束時間比較: requestEnd <= firstHour.end_time
					});
				} else {
					this.logger.debug(`無法找到星期 ${targetWeekday} 的營業時間記錄`);
				}
			}

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
						mode: "ResourceOnly",
						resourceType: resourceTypeName || requiredResourceType,
						resourceTypeId: requiredResourceType,
						resourceCapacity: requiredResourceCapacity,
						totalCapacity
					},
					pairedItem: { item: itemIndex },
				});

				return this.prepareOutputData(returnData);
			}

			// 6. ResourceOnly 查詢 - 檢查營業時間、資源可用性和預約衝突
			const resourceOnlyQuery = `
					// 輸入：潛在時段開始時間列表 (ISO 字符串)
					UNWIND $potentialSlots AS slotStr
					// 轉換為標準化 UTC 時間
					WITH datetime(slotStr) AS slotStart

					// 印出調試信息
					// 獲取商家、服務、時長
					MATCH (b:Business {business_id: $businessId})
					MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)
					WITH b, s, slotStart, duration({minutes: s.duration_minutes}) AS serviceDuration
					WITH b, s, slotStart, serviceDuration, slotStart + serviceDuration AS slotEnd

					// 檢查商家營業時間 - 強制轉換為 UTC 時間進行比較
					MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
					WHERE bh.day_of_week = date(slotStart).dayOfWeek
							AND time(bh.start_time) <= time(slotStart)
							AND time(bh.end_time) >= time(slotEnd)

					WITH b, s, slotStart, slotEnd, serviceDuration, toString(slotStart) AS slotStartStr

					${generateResourceAvailabilityQuery(
							'$requiredResourceType',
							'slotStart',
							'serviceDuration',  // 修正：使用正確的變數名稱，不需要 $ 前綴
							'$requiredResourceCapacity',
							'$businessId',
							{
									includeWhereClause: true,
									tempVarPrefix: 'rsrc',
									includeReturn: true,
									customVariables: {
											previousVars: 'slotStartStr',
											keepVars: 'slotStartStr,'
									}
							}
					)}
			`;

			const resourceOnlyParams: IDataObject = {
					businessId,
					serviceId,
					potentialSlots,
					requiredResourceType,
					requiredResourceCapacity: neo4j.int(requiredResourceCapacity),
					durationMinutes: neo4j.int(durationMinutes),  // 確保參數中包含durationMinutes
					serviceDuration: neo4j.int(durationMinutes)  // 添加與查詢中使用的同名參數
			};

			// 添加額外的調試日誌
			this.logger.debug('執行資源模式可用時段查詢', {
					potentialSlotsCount: potentialSlots.length,
					firstSlot: potentialSlots.length > 0 ? potentialSlots[0] : null,
					lastSlot: potentialSlots.length > 0 ? potentialSlots[potentialSlots.length - 1] : null,
					requiredResourceType,
					requiredResourceCapacity,
					durationMinutes,
					serviceDuration: durationMinutes,
					businessHoursCount: businessHours.length,
					resourceTypeName,
					totalCapacity
			});

			try {
				// 7. 執行 ResourceOnly 查詢
				this.logger.debug('執行資源模式可用時段查詢', {
					potentialSlotsCount: potentialSlots.length,
					firstSlot: potentialSlots.length > 0 ? potentialSlots[0] : null,
					lastSlot: potentialSlots.length > 0 ? potentialSlots[potentialSlots.length - 1] : null,
					requiredResourceType,
					requiredResourceCapacity
				});

				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex });
				}

				// 使用通用查詢執行函數以獲得更好的錯誤處理
				const availableSlotsResults = await runCypherQuery.call(
					this,
					session,
					resourceOnlyQuery,
					resourceOnlyParams,
					false,
					itemIndex
				);

				// 從查詢結果中提取數據
				const availableSlots: string[] = [];
				const slotDetails: any[] = [];

				// 調試輸出原始結果
				this.logger.debug(`查詢返回了 ${availableSlotsResults.length} 條記錄`);
				if (availableSlotsResults.length > 0) {
					this.logger.debug(`第一條記錄內容: ${JSON.stringify(availableSlotsResults[0].json || {})}`);
					for (const result of availableSlotsResults) {
							// 查找多種可能的屬性名稱
							const slot = result.json?.availableSlot || result.json?.slotStartStr || result.json?.slot;
							if (slot) {
									// 確保添加到 availableSlots 的值是字符串
									availableSlots.push(String(slot));
									slotDetails.push({
											slot: String(slot), // 確保 slot 是字符串
											resourceType: result.json?.resourceType || result.json?.resourceTypeName || resourceTypeName,
											totalCapacity: result.json?.totalCapacity || totalCapacity,
											usedResources: result.json?.usedResources || 0,
											availableCapacity: result.json?.availableCapacity || result.json?.availableCount || 0
									});
							} else {
									// 調試無效結果
									this.logger.debug(`發現無效結果: ${JSON.stringify(result.json || {})}`);
							}
					}
				} else {
					this.logger.debug(`查詢未返回可用時段記錄`);
				}

				this.logger.debug(`找到 ${availableSlots.length} 個可用時段，從 ${potentialSlots.length} 個潛在時段中篩選`);

				// 8. 準備結果數據
				returnData.push({
					json: {
						availableSlots,
						slotDetails,
						totalPotentialSlots: potentialSlots.length,
						filteredOutSlots: potentialSlots.length - availableSlots.length,
						mode: "ResourceOnly",
						resourceType: resourceTypeName || requiredResourceType,
						resourceTypeId: requiredResourceType,
						resourceCapacity: requiredResourceCapacity,
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
