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
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [{ name: 'neo4jApi', required: true }],
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
				displayName: 'Mode',
				name: 'mode',
				type: 'string',
				default: 'single',
				description: '選擇設定模式：single(單天) 或 batch(批量)',
			},
			// 單一天模式參數
			{
				displayName: 'Day of Week',
				name: 'dayOfWeek',
				type: 'string',
				default: '1',
				description: '星期幾 (1=星期一, 7=星期日，也可輸入 Monday, Tuesday 等英文名稱)',
				displayOptions: {
					show: {
						mode: ['single'],
					},
				},
			},
			{
				displayName: 'Start Time',
				name: 'startTime',
				type: 'string',
				required: true,
				default: '09:00',
				placeholder: 'HH:MM',
				description: '開始時間 (HH:MM 格式)',
				displayOptions: {
					show: {
						mode: ['single'],
					},
				},
			},
			{
				displayName: 'End Time',
				name: 'endTime',
				type: 'string',
				required: true,
				default: '17:00',
				placeholder: 'HH:MM',
				description: '結束時間 (HH:MM 格式)',
				displayOptions: {
					show: {
						mode: ['single'],
					},
				},
			},
			// 批量模式參數
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
				},
				displayOptions: {
					show: {
						mode: ['batch'],
					},
				},
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

					// 檢測模式 - 支援兩種模式，並智能回退
					let mode = 'single';
					try {
						mode = this.getNodeParameter('mode', i, 'single') as string;
					} catch (error) {
						this.logger.debug('Mode parameter not found, checking available parameters for auto-detection', { error });
					}

					// 確定可用時間數據 - 整合單一模式和批量模式
					let availabilityData: any[] = [];

					if (mode === 'single') {
						// 嘗試獲取單一模式參數
						try {
							const dayOfWeek = this.getNodeParameter('dayOfWeek', i, 1);
							const startTime = this.getNodeParameter('startTime', i, '') as string;
							const endTime = this.getNodeParameter('endTime', i, '') as string;

							this.logger.debug('Using single day mode', { staffId, dayOfWeek, startTime, endTime });

							// 將單一天參數轉換為數組格式，以便統一處理
							availabilityData = [{
								day_of_week: dayOfWeek,
								start_time: startTime,
								end_time: endTime
							}];
						} catch (error) {
							// 舊版 API 可能直接提供 availabilityData 而非 mode
							this.logger.debug('Single day parameters not found, trying availabilityData parameter', { error });
						}
					}

					// 如果沒有單一參數或模式是批量，嘗試獲取 availabilityData
					if (mode === 'batch' || availabilityData.length === 0) {
						try {
							const availabilityDataRaw = this.getNodeParameter('availabilityData', i, '[]') as string;

							this.logger.debug('Processing staff availability with batch mode', {
								staffId,
								itemIndex: i,
								data: availabilityDataRaw
							});

							// 解析 JSON
							let jsonToParse = availabilityDataRaw;
							// 處理引號問題
							while (typeof jsonToParse === 'string' && jsonToParse.startsWith('"') && jsonToParse.endsWith('"')) {
								jsonToParse = JSON.parse(jsonToParse);
							}

							const parsedData = jsonParse(jsonToParse);

							if (Array.isArray(parsedData)) {
								availabilityData = parsedData;
							} else {
								throw new NodeOperationError(node, 'Availability Data must be a valid JSON array.', {
									itemIndex: i,
									description: `Expected format: [{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]. Received: ${availabilityDataRaw}`
								});
							}
						} catch (error) {
							// 如果有單一模式數據，使用單一模式；否則傳遞錯誤
							if (availabilityData.length === 0) {
								throw new NodeOperationError(node, `Failed to get availability data: ${(error as Error).message}`, { itemIndex: i });
							} else {
								this.logger.debug('Using fallback single day data', { data: availabilityData[0] });
							}
						}
					}

					this.logger.debug('Parsed availability data', { staffId, data: availabilityData });

					// 如果仍然沒有數據，報錯
					if (availabilityData.length === 0) {
						throw new NodeOperationError(node, 'No availability data provided. Please provide either single day parameters or a valid JSON array.', { itemIndex: i });
					}

					// 驗證和規範化數據
					availabilityData = availabilityData.map((entry, entryIndex) => {
						// 支持蛇形命名法和駝峰命名法
						const dayOfWeekValue = entry.day_of_week ?? entry.dayOfWeek;
						if (dayOfWeekValue === undefined || dayOfWeekValue === null) {
							throw new NodeOperationError(node, `Missing day_of_week in availability entry ${entryIndex}.`, { itemIndex: i });
						}

						const dayOfWeek = typeof dayOfWeekValue === 'string' ? parseInt(dayOfWeekValue, 10) : dayOfWeekValue;
						if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
							throw new NodeOperationError(node, `Invalid day_of_week in entry ${entryIndex}. Must be an integer between 1 and 7 (1=Monday, 7=Sunday). Received: ${dayOfWeekValue}`, { itemIndex: i });
						}

						const startTimeValue = entry.start_time ?? entry.startTime;
						const endTimeValue = entry.end_time ?? entry.endTime;
						const startTime = normalizeTimeOnly(startTimeValue);
						const endTime = normalizeTimeOnly(endTimeValue);

						if (!startTime || !endTime) {
							throw new NodeOperationError(node, `Invalid time format in entry ${entryIndex}. Use "HH:MM" format. Received: start_time="${startTimeValue}", end_time="${endTimeValue}"`, { itemIndex: i });
						}

						// 驗證時間範圍
						if (startTime >= endTime) {
							throw new NodeOperationError(node, `Invalid time range in entry ${entryIndex}. start_time (${startTime}) must be earlier than end_time (${endTime}).`, { itemIndex: i });
						}

						return {
							day_of_week: dayOfWeek,
							start_time: startTime,
							end_time: endTime
						};
					});

					this.logger.debug('Normalized availability data', { staffId, data: availabilityData });

					// 6. 執行 - 檢查員工是否存在
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}

					const checkQuery = `
						MATCH (st:Staff {staff_id: $staffId})
						RETURN st
					`;
					const checkParams: IDataObject = { staffId };

					const checkResults = await runCypherQuery.call(this, session, checkQuery, checkParams, false, i);
					if (checkResults.length === 0) {
						throw new NodeOperationError(node, `Staff ID ${staffId} does not exist`, { itemIndex: i });
					}

					// 7. 在單一事務中處理可用時間
					let totalDeletedCount = 0;
					let totalCreatedCount = 0;
					let processedCount = 0;

					this.logger.debug(`Processing ${availabilityData.length} availability entries`, {
						staffId,
						count: availabilityData.length
					});

					for (const availabilityItem of availabilityData) {
						processedCount++;
						this.logger.debug(`Processing availability for day ${availabilityItem.day_of_week}`, {
							staffId,
							item: availabilityItem
						});

						// 刪除現有可用時間
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
						const deletedCount = Number(deleteResults[0]?.json?.deletedCount || 0);
						totalDeletedCount += deletedCount;
						this.logger.debug(`Deleted ${deletedCount} existing availability records for day ${availabilityItem.day_of_week}`, {
							staffId
						});

						// 創建新的可用時間
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
						this.logger.debug(`Created availability record for day ${availabilityItem.day_of_week}`, {
							staffId
						});
					}

					// 提交事務
					this.logger.info(`Successfully processed ${processedCount} availability entries`, {
						staffId,
						processedCount,
						deletedCount: totalDeletedCount,
						createdCount: totalCreatedCount
					});

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


					// 9. 處理項目級錯誤
					if (this.continueOnFail(itemError)) {
						const parsedError = parseNeo4jError(node, itemError);
						this.logger.warn(`Failed to process item ${i}: ${parsedError.message}`, {
							staffId: items[i].json.staffId,
							error: parsedError
						});
						const errorData = {
							...items[i].json,
							error: {
								message: parsedError.message,
								description: parsedError.description,
								expectedFormat: {
									example: '[{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]',
									notes: 'Use day_of_week (1-7, 1=Monday, 7=Sunday), start_time and end_time in HH:MM format.'
								}
							}
						};

						returnData.push({
							json: errorData,
							error: new NodeOperationError(node, parsedError.message, {
								itemIndex: i,
								description: parsedError.description ?? undefined
							}),
							pairedItem: { item: i }
						});
						continue;
					}
					throw itemError;
				}
			}

			// 10. 返回結果
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 11. 處理節點級錯誤
			if (error instanceof NodeOperationError) { throw error; }
			if (items.length === 1) (error as any).itemIndex = 0;
			throw parseNeo4jError(node, error);
		} finally {
			// 12. 關閉會話和驅動
			if (session) {
				try { await session.close(); } catch (e) { this.logger.error('Error closing Neo4j session:', e); }
			}
			if (driver) {
				try { await driver.close(); } catch (e) { this.logger.error('Error closing Neo4j driver:', e); }
			}
		}
	}
}
