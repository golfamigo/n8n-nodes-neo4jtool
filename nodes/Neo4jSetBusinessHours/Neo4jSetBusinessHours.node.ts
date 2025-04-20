// ============================================================================
// N8N Neo4j Node: Set Business Hours
// ============================================================================
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	parseNeo4jError,
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
		description: '設定或更新指定商家的營業時間 (會覆蓋舊設定)。',
		defaults: {
			name: 'Neo4j Set Business Hours',
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
				description: '要設定營業時間的商家 ID',
			},
			{
				displayName: 'Hours Data (JSON Array)',
				name: 'hoursData',
				type: 'string', // 保持為 string 類型以兼容 MCP
				required: true,
				default: '[\n  {\n    "day_of_week": 1,\n    "start_time": "09:00",\n    "end_time": "17:00"\n  }\n]',
				description: '包含每天營業時間的 JSON 陣列。如果某天休息，則不包含該天的物件。',
				hint: '格式: [{"day_of_week": 1, "start_time": "HH:MM", "end_time": "HH:MM"}, ...] (時間為 UTC)',
				typeOptions: {
					rows: 10,
				}
			},
		],
	};

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

					console.log('Raw hours data input:', hoursDataRaw);

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
							throw new NodeOperationError(node, 'Hours Data must be a valid JSON array.', { itemIndex: i });
						}

						console.log('Parsed hours data:', JSON.stringify(hoursData, null, 2));

						// 處理並規範化每個條目，使用 timeUtils 進行時間處理
						hoursData = hoursData.map(entry => {
							// 確保 day_of_week 是數字
							const dayOfWeek = typeof entry.day_of_week === 'string'
								? parseInt(entry.day_of_week, 10)
								: (entry.day_of_week || 0);

							// 如果 day_of_week 範圍不對，報錯
							if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
								throw new NodeOperationError(node, `Invalid day_of_week (${entry.day_of_week}). Must be between 1 (Monday) and 7 (Sunday).`, { itemIndex: i });
							}

							// 使用時間處理工具規範化時間格式
							const startTime = normalizeTimeOnly(entry.start_time);
							const endTime = normalizeTimeOnly(entry.end_time);

							// 確保時間格式正確
							if (!startTime || !endTime) {
								throw new NodeOperationError(node, `Missing or invalid time format in entry: ${JSON.stringify(entry)}`, { itemIndex: i });
							}

							// 返回規範化的條目
							return {
								day_of_week: dayOfWeek,
								start_time: startTime,
								end_time: endTime
							};
						});

						console.log('Normalized hours data:', JSON.stringify(hoursData, null, 2));

					} catch (jsonError) {
						console.error('JSON parsing error:', jsonError);
						throw new NodeOperationError(node, `Invalid JSON in Hours Data field: ${jsonError.message}`, { itemIndex: i });
					}

					// 6. 執行 - 修改為兩個單獨的查詢，而不是一個事務
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
					const deleteResult = await session.run(deleteQuery, { businessId });
					const deletedCount = deleteResult.records[0].get('deletedCount').toNumber();
					this.logger.debug(`Deleted ${deletedCount} existing business hours`);

					// 只有當有營業時間資料時才創建新記錄
					let hoursSetCount = 0;
					if (hoursData.length > 0) {
						// 創建新的營業時間，使用 toNeo4jTimeString 格式化時間
						const createQuery = `
							MATCH (b:Business {business_id: $businessId})
							UNWIND $hoursData AS dayHours
							CREATE (bh:BusinessHours {
								business_id: $businessId,
								day_of_week: dayHours.day_of_week,
								start_time: time($startTime),
								end_time: time($endTime),
								created_at: datetime()
							})
							MERGE (b)-[:HAS_HOURS]->(bh)
							RETURN count(bh) as createdCount
						`;

						this.logger.debug(`Executing create query for businessId: ${businessId} with ${hoursData.length} entries.`);

						// 處理每個營業時間條目
						for (const hourData of hoursData) {
							const startTime = toNeo4jTimeString(hourData.start_time);
							const endTime = toNeo4jTimeString(hourData.end_time);

							const createResult = await session.run(createQuery, {
								businessId,
								hoursData: [hourData],
								startTime,
								endTime
							});

							hoursSetCount += createResult.records[0].get('createdCount').toNumber();
						}

						this.logger.debug(`Created ${hoursSetCount} new business hours`);
					} else {
						this.logger.debug(`Skipping create query for businessId: ${businessId} as hoursData is empty.`);
					}

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
						const errorData = { ...item.json, error: parsedError };
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
