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
	normalizeDateTime,
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
				displayName: 'Availability Data',
				name: 'availabilityData',
				type: 'string',
				required: true,
				default: '[\n  {\n    "type": "SCHEDULE",\n    "day_of_week": 1,\n    "start_time": "09:00",\n    "end_time": "17:00"\n  },\n  {\n    "type": "EXCEPTION",\n    "date": "2025-05-01",\n    "reason": "假期",\n    "start_time": "00:00",\n    "end_time": "23:59"\n  }\n]',
				description: '包含員工可用時間的 JSON 陣列。設定員工的排班和例外時間。',
				hint: '可以提供一個或多個時間項目。SCHEDULE類型需要day_of_week，EXCEPTION類型需要date。',
				typeOptions: {
					rows: 10,
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
					const availabilityDataRaw = this.getNodeParameter('availabilityData', i, '[]') as string;

					this.logger.debug('Processing staff availability data', {
						staffId,
						itemIndex: i,
						data: availabilityDataRaw
					});

					// 6. 解析 JSON 數據
					let availabilityData: any[] = [];
					try {
						// 處理可能的多層JSON字符串
						let jsonToParse = availabilityDataRaw;
						while (typeof jsonToParse === 'string' && jsonToParse.startsWith('"') && jsonToParse.endsWith('"')) {
							jsonToParse = JSON.parse(jsonToParse);
						}

						const parsedData = jsonParse(jsonToParse);

						if (Array.isArray(parsedData)) {
							availabilityData = parsedData;
						} else {
							throw new NodeOperationError(node, 'Availability Data must be a valid JSON array.', {
								itemIndex: i,
								description: `Expected format: [{"type": "SCHEDULE", "day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]. Received: ${availabilityDataRaw}`
							});
						}
					} catch (error) {
						throw new NodeOperationError(node, `Failed to parse availability data: ${(error as Error).message}`, {
							itemIndex: i,
							description: 'Please provide a valid JSON array with the correct format.'
						});
					}

					if (availabilityData.length === 0) {
						throw new NodeOperationError(node, 'No availability data provided. Please provide a valid JSON array.', { itemIndex: i });
					}

					// 7. 驗證和規範化數據
					availabilityData = availabilityData.map((entry, entryIndex) => {
						// 支持蛇形命名法和駝峰命名法
						const type = entry.type ?? 'SCHEDULE';
						if (type !== 'SCHEDULE' && type !== 'EXCEPTION') {
							throw new NodeOperationError(node, `Invalid availability type in entry ${entryIndex}. Must be 'SCHEDULE' or 'EXCEPTION'. Received: ${type}`, { itemIndex: i });
						}

						// 根據類型驗證必要欄位
						if (type === 'SCHEDULE') {
							const dayOfWeekValue = entry.day_of_week ?? entry.dayOfWeek;
							if (dayOfWeekValue === undefined || dayOfWeekValue === null) {
								throw new NodeOperationError(node, `Missing day_of_week in SCHEDULE availability entry ${entryIndex}.`, { itemIndex: i });
							}

							const dayOfWeek = typeof dayOfWeekValue === 'string' ? parseInt(dayOfWeekValue, 10) : dayOfWeekValue;
							if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
								throw new NodeOperationError(node, `Invalid day_of_week in entry ${entryIndex}. Must be an integer between 1 and 7 (1=Monday, 7=Sunday). Received: ${dayOfWeekValue}`, { itemIndex: i });
							}
							entry.day_of_week = dayOfWeek;
						} else { // EXCEPTION
							const dateValue = entry.date ?? entry.specificDate;
							if (!dateValue) {
								throw new NodeOperationError(node, `Missing date in EXCEPTION availability entry ${entryIndex}.`, { itemIndex: i });
							}

							// 驗證日期格式
							const normalizedDate = normalizeDateTime(dateValue);
							if (!normalizedDate) {
								throw new NodeOperationError(node, `Invalid date format in entry ${entryIndex}. Use YYYY-MM-DD format. Received: ${dateValue}`, { itemIndex: i });
							}
							entry.date = dateValue;
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

						// 返回格式化數據
						const normalizedEntry: any = {
							type: type,
							start_time: startTime,
							end_time: endTime
						};

						// 根據類型添加相應字段
						if (type === 'SCHEDULE') {
							normalizedEntry.day_of_week = entry.day_of_week;
						} else { // EXCEPTION
							normalizedEntry.date = entry.date;
							normalizedEntry.reason = entry.reason || '';
						}

						return normalizedEntry;
					});

					this.logger.debug('Normalized availability data', { staffId, data: availabilityData });

					// 8. 執行 - 檢查員工是否存在
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

					// 9. 在單一事務中處理可用時間
					let totalDeletedCount = 0;
					let totalCreatedCount = 0;
					let processedCount = 0;

					this.logger.debug(`Processing ${availabilityData.length} availability entries`, {
						staffId,
						count: availabilityData.length
					});

					for (const availabilityItem of availabilityData) {
						processedCount++;
						const isException = availabilityItem.type === 'EXCEPTION';

						this.logger.debug(`Processing availability type ${availabilityItem.type}`, {
							staffId,
							item: availabilityItem
						});

						// 刪除現有可用時間
						let deleteQuery;
						let deleteParams: IDataObject;

						if (isException) {
							// 對於例外情況，根據日期刪除
							deleteQuery = `
								MATCH (st:Staff {staff_id: $staffId})-[r:HAS_AVAILABILITY]->(sa:StaffAvailability)
								WHERE sa.type = 'EXCEPTION' AND sa.date = $date
								DELETE r, sa
								RETURN count(r) as deletedCount
							`;
							deleteParams = {
								staffId,
								date: availabilityItem.date,
							};
						} else {
							// 對於排班，根據週幾刪除
							deleteQuery = `
								MATCH (st:Staff {staff_id: $staffId})-[r:HAS_AVAILABILITY]->(sa:StaffAvailability)
								WHERE sa.type = 'SCHEDULE' AND sa.day_of_week = $dayOfWeek
								DELETE r, sa
								RETURN count(r) as deletedCount
							`;
							deleteParams = {
								staffId,
								dayOfWeek: neo4j.int(availabilityItem.day_of_week),
							};
						}

						const deleteResults = await runCypherQuery.call(this, session, deleteQuery, deleteParams, true, i);
						const deletedCount = Number(deleteResults[0]?.json?.deletedCount || 0);
						totalDeletedCount += deletedCount;
						this.logger.debug(`Deleted ${deletedCount} existing availability records for ${isException ? 'date ' + availabilityItem.date : 'day ' + availabilityItem.day_of_week}`, {
							staffId
						});

						// 創建新的可用時間
						let createQuery;
						let createParams: IDataObject;

						if (isException) {
							// 創建例外情況
							createQuery = `
								MATCH (st:Staff {staff_id: $staffId})
								CREATE (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability {
									staff_id: $staffId,
									type: 'EXCEPTION',
									date: date($date),
									reason: $reason,
									start_time: time($startTime),
									end_time: time($endTime),
									created_at: datetime()
								})
								RETURN sa {
									.staff_id,
									.type,
									date: toString(sa.date),
									reason: sa.reason,
									start_time: toString(sa.start_time),
									end_time: toString(sa.end_time)
								} AS availability
							`;

							const startTime = toNeo4jTimeString(availabilityItem.start_time);
							const endTime = toNeo4jTimeString(availabilityItem.end_time);

							createParams = {
								staffId,
								date: availabilityItem.date,
								reason: availabilityItem.reason || '',
								startTime,
								endTime,
							};
						} else {
							// 創建常規排班
							createQuery = `
								MATCH (st:Staff {staff_id: $staffId})
								CREATE (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability {
									staff_id: $staffId,
									type: 'SCHEDULE',
									day_of_week: $dayOfWeek,
									start_time: time($startTime),
									end_time: time($endTime),
									created_at: datetime()
								})
								RETURN sa {
									.staff_id,
									.type,
									day_of_week: toInteger(sa.day_of_week),
									start_time: toString(sa.start_time),
									end_time: toString(sa.end_time)
								} AS availability
							`;

							const startTime = toNeo4jTimeString(availabilityItem.start_time);
							const endTime = toNeo4jTimeString(availabilityItem.end_time);

							createParams = {
								staffId,
								dayOfWeek: neo4j.int(availabilityItem.day_of_week),
								startTime,
								endTime,
							};
						}

						const createResults = await runCypherQuery.call(this, session, createQuery, createParams, true, i);
						totalCreatedCount += createResults.length;
						this.logger.debug(`Created availability record for ${isException ? 'date ' + availabilityItem.date : 'day ' + availabilityItem.day_of_week}`, {
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
							processedEntries: availabilityData.length
						},
						pairedItem: { item: i }
					});

				} catch (itemError) {
					// 10. 處理項目級錯誤
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
									example: '[{"type": "SCHEDULE", "day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}, {"type": "EXCEPTION", "date": "2025-05-01", "reason": "假期", "start_time": "00:00", "end_time": "23:59"}]',
									notes: 'Use type (SCHEDULE/EXCEPTION), day_of_week (for SCHEDULE) or date (for EXCEPTION), start_time and end_time in HH:MM format.'
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

			// 11. 返回結果
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 12. 處理節點級錯誤
			if (error instanceof NodeOperationError) { throw error; }
			if (items.length === 1) (error as any).itemIndex = 0;
			throw parseNeo4jError(node, error);
		} finally {
			// 13. 關閉會話和驅動
			if (session) {
				try { await session.close(); } catch (e) { this.logger.error('Error closing Neo4j session:', e); }
			}
			if (driver) {
				try { await driver.close(); } catch (e) { this.logger.error('Error closing Neo4j driver:', e); }
			}
		}
	}
}
