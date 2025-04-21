// ============================================================================
// N8N Neo4j Node: Set Staff Availability
// ============================================================================
import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
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
export class Neo4jSetStaffAvailability implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Set Staff Availability',
		name: 'neo4jSetStaffAvailability',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for Staff {{$parameter["staffId"]}}',
		description: '設定或更新指定員工的可用時間。',
		defaults: {
			name: 'Neo4j Set Staff Availability',
		},
		inputs: ['main'],
		outputs: ['main'], // Output success/failure
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			{
				displayName: 'Staff ID',
				name: 'staffId',
				type: 'string',
				required: true,
				default: '',
				description: '目標員工的 staff_id',
			},
			{
				displayName: 'Availability Data',
				name: 'availabilityData',
				type: 'string',
				required: true,
				default: '[\n  {\n    "day_of_week": 1,\n    "start_time": "09:00",\n    "end_time": "17:00"\n  }\n]',
				description: '包含員工可用時間的 JSON 陣列。格式必須是 day_of_week, start_time, end_time。',
			hint: '格式: [{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}, ...] (1=週一, 7=週日，時間為 HH:MM 格式)',
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
					const staffId = this.getNodeParameter('staffId', i, '') as string;
					const availabilityDataRaw = this.getNodeParameter('availabilityData', i, '[]') as string;

					this.logger.debug('Raw availability data input:', { data: availabilityDataRaw });

					// Parse and validate availabilityData
					let availabilityData: any[];
					try {
						// 處理可能的字符串包裹（如果 MCP 傳送了帶引號的字符串）
						let jsonToParse = availabilityDataRaw;
						if (availabilityDataRaw.startsWith('"') && availabilityDataRaw.endsWith('"')) {
							// 移除外層引號並處理轉義
							jsonToParse = JSON.parse(availabilityDataRaw);
						}

						availabilityData = jsonParse(jsonToParse);

						if (!Array.isArray(availabilityData)) {
							throw new NodeOperationError(node, 'Availability Data must be a valid JSON array.', {
                itemIndex: i,
                description: `提供的格式不是有效的 JSON 陣列。應為: [{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]。收到的值: ${availabilityDataRaw}`
              } as IDataObject);
						}

						this.logger.debug('Parsed availability data:', { data: JSON.stringify(availabilityData, null, 2) });

						// 處理並規範化每個條目，使用 timeUtils 進行時間處理
						availabilityData = availabilityData.map(entry => {
							// 同時接受蛇形命名法和駝峰命名法
							const dayOfWeekValue = entry.day_of_week !== undefined ? entry.day_of_week : entry.dayOfWeek;
							const dayOfWeek = typeof dayOfWeekValue === 'string'
								? parseInt(dayOfWeekValue, 10)
								: (dayOfWeekValue || 0);

							// 如果 day_of_week 範圍不對，報錯
							// 如果 day_of_week 範圍不對，報錯
						if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
							throw new NodeOperationError(node, `無效的星期值。必須是 1-7 之間的整數 (1=星期一, 7=星期日)。收到的值: day_of_week=${dayOfWeekValue}`, { itemIndex: i } as IDataObject);
						}

							// 支援不同的時間格式和命名風格
							const startTimeValue = entry.start_time !== undefined ? entry.start_time : entry.startTime;
							const endTimeValue = entry.end_time !== undefined ? entry.end_time : entry.endTime;

							// 使用時間處理工具規範化時間格式
							const startTime = normalizeTimeOnly(startTimeValue);
							const endTime = normalizeTimeOnly(endTimeValue);

							// 確保時間格式正確
							if (!startTime || !endTime) {
								throw new NodeOperationError(node, `無效的時間格式。請使用 "HH:MM" 格式。收到的值: start_time="${startTimeValue}", end_time="${endTimeValue}"`, { itemIndex: i } as IDataObject);
							}

							// 返回規範化的條目
							return {
								day_of_week: dayOfWeek,
								start_time: startTime,
								end_time: endTime
							};
						});

						this.logger.debug('Normalized availability data:', { data: JSON.stringify(availabilityData, null, 2) });

					} catch (jsonError) {
						console.error('JSON parsing error:', jsonError);
						throw new NodeOperationError(node, `無效的 JSON 格式: ${(jsonError as Error).message}`, {
              itemIndex: i,
              description: `預期的格式為: [{"day_of_week": 0, "start_time": "09:00", "end_time": "17:00"}]。`
            } as IDataObject);
					}

					// 6. 執行 - 檢查員工是否存在
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}

					// 檢查員工是否存在
					const checkQuery = `
						MATCH (st:Staff {staff_id: $staffId})
						RETURN st
					`;
					const checkParams: IDataObject = { staffId };

					const checkResults = await runCypherQuery.call(this, session, checkQuery, checkParams, false, i);
					if (checkResults.length === 0) {
						throw new NodeOperationError(node, `員工 ID ${staffId} 不存在`, { itemIndex: i });
					}

					let totalDeletedCount = 0;
					let totalCreatedCount = 0;

					// 處理每個可用時間
					this.logger.debug(`總共收到 ${availabilityData.length} 個時間段需要處理`, { data: availabilityData.length });
					let processedCount = 0;

					for (const availabilityItem of availabilityData) {
						// 刪除現有的可用性關係
						const deleteQuery = `
							MATCH (st:Staff {staff_id: $staffId})-[r:HAS_AVAILABILITY]->(sa:StaffAvailability)
							WHERE sa.day_of_week = $dayOfWeek
							DELETE r, sa
							RETURN count(r) as deletedCount
						`;
						const deleteParams: IDataObject = {
							staffId,
							dayOfWeek: neo4j.int(availabilityItem.day_of_week),
						};

						const deleteResults = await runCypherQuery.call(this, session, deleteQuery, deleteParams, true, i);
						const deletedCount = deleteResults[0]?.json?.deletedCount || 0;
						totalDeletedCount += (typeof deletedCount === 'number' ? deletedCount : 0);
						this.logger.debug(`Deleted ${deletedCount} existing availability records for day ${availabilityItem.day_of_week}`);

						// 創建新的可用性記錄
						const createQuery = `
							MATCH (st:Staff {staff_id: $staffId})
							CREATE (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability {
								staff_id: $staffId,
								day_of_week: $dayOfWeek,
								start_time: time($startTime),
								end_time: time($endTime),
								created_at: datetime()
							})
							RETURN sa {
								.staff_id,
								day_of_week: toInteger(sa.day_of_week),
								start_time: toString(sa.start_time),
								end_time: toString(sa.end_time)
							} AS availability
						`;

						const startTime = toNeo4jTimeString(availabilityItem.start_time);
						const endTime = toNeo4jTimeString(availabilityItem.end_time);

						const createParams: IDataObject = {
							staffId,
							dayOfWeek: neo4j.int(availabilityItem.day_of_week),
							startTime,
							endTime,
						};

						const createResults = await runCypherQuery.call(this, session, createQuery, createParams, true, i);
						totalCreatedCount += createResults.length;
						this.logger.debug(`Created availability record for day ${availabilityItem.day_of_week}`);
					}

					this.logger.debug(`成功處理了 ${processedCount} 個時間段`, { count: processedCount });

					// 返回結果摘要
					returnData.push({
						json: {
							success: true,
							staffId: staffId,
							deletedCount: totalDeletedCount,
							availabilitySetCount: totalCreatedCount,
							processedDays: availabilityData.length
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
                  example: '[{"day_of_week": 0, "start_time": "09:00", "end_time": "17:00"}]',
                  notes: '必須使用 day_of_week, start_time, end_time 作為屬性名稱，day_of_week 範圍是 0-6 (0=星期日)，時間格式為 HH:MM'
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
			if (items.length === 1) (error as any).itemIndex = 0;
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
