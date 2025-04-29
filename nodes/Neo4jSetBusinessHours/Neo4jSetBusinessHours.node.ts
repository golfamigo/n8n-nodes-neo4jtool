// ============================================================================
// N8N Neo4j Node: Set Business Hours
// ============================================================================
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
	IDataObject,
} from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	parseNeo4jError,
	runCypherQuery,
} from '../neo4j/helpers/utils';

// --- 引入時間處理工具函數 ---
import {
	toNeo4jTimeString,
	normalizeTimeOnly,

	// 以下保留供未來擴展使用
	normalizeDateTime as _normalizeDateTime,
	toNeo4jDateTimeString as _toNeo4jDateTimeString,
	addMinutesToDateTime as _addMinutesToDateTime,
	TIME_SETTINGS as _TIME_SETTINGS,
} from '../neo4j/helpers/timeUtils';

// --- Mapping for day names ---
const dayNameToNumber: { [key: string]: number } = {
	'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
	'friday': 5, 'saturday': 6, 'sunday': 7
};

// --- Node Class Definition ---
export class Neo4jSetBusinessHours implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Set Business Hours',
		name: 'neo4jSetBusinessHours',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for Business {{$parameter["businessId"]}}',
		// --- MODIFIED description ---
		description: `設定或更新指定商家的常規每週營業時間。此操作會 **完全覆蓋** 該商家所有舊的營業時間設定。
通過 'Hours Data' (JSON 陣列) 提供時間段:
每個時間段物件需包含 'day_of_week' (數字 1-7 或英文星期名), 'start_time' (HH:MM), 'end_time' (HH:MM)。

- **基本格式**: {"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}
- **設定休息時間**: 您可以為同一天提供多個不連續的時間段來表示休息時間。
  範例 (週一 9-12, 13-17，中間休息):
  [
    {"day_of_week": 1, "start_time": "09:00", "end_time": "12:00"},
    {"day_of_week": 1, "start_time": "13:00", "end_time": "17:00"}
  ]

**重要**: 請確保 start_time 早於 end_time。`,
		defaults: {
			name: 'Neo4j Set Business Hours',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [{ name: 'neo4jApi', required: true }],
		properties: [
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '要設定營業時間的商家 ID (UUID)',
			},
			{
				displayName: 'Hours Data',
				name: 'hoursData',
				type: 'string',
				required: true,
				// --- MODIFIED default 範例 ---
				default: `[
  {"day_of_week": 1, "start_time": "09:00", "end_time": "12:00"},
  {"day_of_week": 1, "start_time": "13:00", "end_time": "17:00"},
  {"day_of_week": 2, "start_time": "09:00", "end_time": "17:00"}
]`,
				// --- MODIFIED properties description ---
				description: '包含每天營業時間的 JSON 陣列。可為同一天設定多個時段以實現休息時間。詳細用法請參見節點主描述。',
				typeOptions: {
					rows: 10,
				},
			},
		],
	}; // End of description object

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();

		// This node typically runs once per businessId
		if (items.length > 1) {
			this.logger.warn('This node is processing multiple items. It will set hours for each businessId found in the input items.');
		}

		try {
			// 1. Get Credentials
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;

			// 2. Validate Credentials
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured.', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const user = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			// 3. Establish Neo4j Connection
			try {
				driver = neo4j.driver(uri, auth.basic(user, password));
				await driver.verifyConnectivity();
				session = driver.session({ database });
			} catch (connectionError) {
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection.');
			}

			// 4. Loop Through Input Items
			for (let i = 0; i < items.length; i++) {
				try {
					// 5. Get Input Parameters
					const businessId = this.getNodeParameter('businessId', i, '') as string;
					const hoursDataRaw = this.getNodeParameter('hoursData', i, '[]') as string;

					this.logger.debug('Raw hours data input:', { data: hoursDataRaw });

					// Parse and validate hoursData - 改進解析流程，更寬容地處理輸入
					let hoursData: any[];
					try {
						// 處理可能的字符串包裹（如果 MCP 傳送了帶引號的字符串）
						let jsonToParse = hoursDataRaw;
						if (hoursDataRaw.startsWith('"') && hoursDataRaw.endsWith('"')) {
							// 移除外層引號並處理轉義
							jsonToParse = JSON.parse(hoursDataRaw);
						}

						hoursData = jsonParse(jsonToParse);

						if (!Array.isArray(hoursData)) {
							throw new NodeOperationError(node, 'Hours Data must be a valid JSON array.', {
                itemIndex: i,
                description: `提供的格式不是有效的 JSON 陣列。應為: [{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]。收到的值: ${hoursDataRaw}`
              });
						}

						this.logger.debug('Parsed hours data:', { data: JSON.stringify(hoursData, null, 2) });

						// 處理並規範化每個條目，使用 timeUtils 進行時間處理
						hoursData = hoursData.map(entry => {
							// 同時接受蛇形命名法和駝峰命名法
							const dayOfWeekValue = entry.day_of_week !== undefined ? entry.day_of_week : entry.dayOfWeek;
							let dayOfWeek: number;
							if (typeof dayOfWeekValue === 'number') {
								dayOfWeek = dayOfWeekValue;
							} else if (typeof dayOfWeekValue === 'string') {
								const lowerCaseDay = dayOfWeekValue.toLowerCase();
								if (dayNameToNumber[lowerCaseDay]) {
									dayOfWeek = dayNameToNumber[lowerCaseDay];
								} else {
									// 嘗試解析為數字
									const parsedInt = parseInt(dayOfWeekValue, 10);
									if (!isNaN(parsedInt)) {
										dayOfWeek = parsedInt;
									} else {
										throw new NodeOperationError(node, `無效的星期值。必須是 1-7 之間的整數或有效的英文星期名稱 (Monday-Sunday)。收到的值: day_of_week=${dayOfWeekValue}`, { itemIndex: i });
									}
								}
							} else {
								throw new NodeOperationError(node, `無效的星期值類型。必須是數字或字串。收到的值: day_of_week=${dayOfWeekValue}`, { itemIndex: i });
							}

							// 驗證轉換後的數字範圍
							if (dayOfWeek < 1 || dayOfWeek > 7) {
								throw new NodeOperationError(node, `無效的星期值。必須是 1-7 之間的整數或有效的英文星期名稱 (Monday-Sunday)。收到的值: day_of_week=${dayOfWeekValue}`, { itemIndex: i });
							}

							// 支援不同的時間格式和命名風格
							const startTimeValue = entry.start_time !== undefined ? entry.start_time : entry.startTime;
							const endTimeValue = entry.end_time !== undefined ? entry.end_time : entry.endTime;

							// 使用時間處理工具規範化時間格式
							const startTime = normalizeTimeOnly(startTimeValue);
							const endTime = normalizeTimeOnly(endTimeValue);

							// 確保時間格式正確
							if (!startTime || !endTime) {
								throw new NodeOperationError(node, `無效的時間格式。請使用 "HH:MM" 格式。收到的值: start_time="${startTimeValue}", end_time="${endTimeValue}"`, { itemIndex: i });
							}

							// 返回規範化的條目
							return {
								day_of_week: dayOfWeek,
								start_time: startTime,
								end_time: endTime
							};
						});

						this.logger.debug('Normalized hours data:', { data: JSON.stringify(hoursData, null, 2)});

					} catch (jsonError) {
						console.error('JSON parsing error:', jsonError);
						throw new NodeOperationError(node, `無效的 JSON 格式: ${jsonError.message}`, {
              itemIndex: i,
              description: `預期的格式為: [{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]。`
            });
					}

					// 6. 使用 runCypherQuery 輔助函數執行查詢

					// 確保 session 可用
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}

					// 先刪除現有的營業時間
					const deleteQuery = `
						MATCH (b:Business {business_id: $businessId})
						OPTIONAL MATCH (b)-[r:HAS_HOURS]->(oldBh:BusinessHours)
						DELETE r, oldBh
						RETURN count(oldBh) as deletedCount
					`;

					this.logger.debug(`Executing delete query for businessId: ${businessId}`);
					const deleteParams: IDataObject = { businessId };
					const deleteResults = await runCypherQuery.call(this, session, deleteQuery, deleteParams, true, i);
					const deletedCount = deleteResults[0]?.json?.deletedCount || 0;
					this.logger.debug(`Deleted ${deletedCount} existing business hours`);

					// --- MODIFICATION START: Batch create records ---
					let hoursSetCount = 0;
					if (hoursData.length > 0) {
						// 準備批次創建的參數列表
						const batchCreateParams = hoursData.map(hourData => ({
							businessId: businessId, // 確保 businessId 在每個 map 項目中
							dayOfWeek: neo4j.int(hourData.day_of_week),
							startTime: toNeo4jTimeString(hourData.start_time),
							endTime: toNeo4jTimeString(hourData.end_time)
						}));

						// 批次創建 Cypher 查詢
						const batchCreateQuery = `
							UNWIND $batchData AS hourProps
							MATCH (b:Business {business_id: hourProps.businessId})
							CREATE (bh:BusinessHours {
								business_id: hourProps.businessId,
								day_of_week: hourProps.dayOfWeek,
								start_time: time(hourProps.startTime),
								end_time: time(hourProps.endTime),
								created_at: datetime()
							})
							MERGE (b)-[:HAS_HOURS]->(bh)
							WITH count(bh) AS totalCreated RETURN totalCreated
						`;

						const batchParams: IDataObject = { batchData: batchCreateParams };

						this.logger.debug(`Executing batch create for ${batchCreateParams.length} business hours records`);
						const batchCreateResults = await runCypherQuery.call(this, session, batchCreateQuery, batchParams, true, i);

						// 獲取總創建數量 (注意: UNWIND 會為每個創建的節點返回一行)
						const createdCountResult = batchCreateResults[0]?.json?.totalCreated;
						hoursSetCount = typeof createdCountResult === 'number' ? createdCountResult : (typeof createdCountResult === 'string' ? parseInt(createdCountResult, 10) : 0); // 確保轉換為數字

						this.logger.debug(`Batch created ${hoursSetCount} new business hours`);
					} else {
						this.logger.debug(`Skipping create query for businessId: ${businessId} as hoursData is empty.`);
					}
					// --- MODIFICATION END ---

					returnData.push({
						json: {
							success: true,
							businessId: businessId,
							deletedCount: deletedCount,
							hoursSetCount: hoursSetCount
						},
						pairedItem: { item: i }
					});

				} catch (itemError) {
					// 8. Handle Item-Level Errors
					if (this.continueOnFail(itemError)) {
						const item = items[i];
						const parsedError = parseNeo4jError(node, itemError);
						const errorData = {
              ...item.json,
              error: {
                ...parsedError,
                expectedFormat: {
                  example: '[{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]',
                  notes: '必須使用 day_of_week, start_time, end_time 作為屬性名稱，時間格式為 HH:MM'
                }
              }
            };

						returnData.push({
							json: errorData,
							error: new NodeOperationError(node, parsedError.message, { itemIndex: i, description: parsedError.description ?? undefined }),
							pairedItem: { item: i }
						});
						continue;
					}
					throw itemError;
				}
			}

			// 9. Return Results
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 10. Handle Node-Level Errors
			if (error instanceof NodeOperationError) { throw error; }
			if (items.length === 1) (error as any).itemIndex = 0; // Add index if possible
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
