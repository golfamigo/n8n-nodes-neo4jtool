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

// --- Mapping for day names ---
const dayNameToNumber: { [key: string]: number } = {
	'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
	'friday': 5, 'saturday': 6, 'sunday': 7
};

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
		// --- MODIFIED description ---
		description: `設定或更新指定員工的可用時間。此操作會 **完全覆蓋** 該員工所有舊的可用時間設定。
通過 'Availability Data' (JSON 陣列) 提供時間段:
每個時間段物件需包含 'start_time' (HH:MM), 'end_time' (HH:MM)。
必須指定 'type' (SCHEDULE 或 EXCEPTION，預設 SCHEDULE)。

- **type: "SCHEDULE"**: 設定常規每週排班。
  - 需要 'day_of_week' (數字 1-7 或英文星期名)。
  - 範例: {"type": "SCHEDULE", "day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}

- **type: "EXCEPTION"**: 設定特定日期例外，會覆蓋當天的 SCHEDULE。
  - 需要 'date' (YYYY-MM-DD)。
  - 可選 'reason' (字串，僅供參考，不影響可用時段計算邏輯)。
  - **用法區分 (基於 start_time/end_time)**:
    - **表示請假/全天不可用**: 將 'start_time' 設為 "00:00"，'end_time' 設為 "23:59"。FindAvailableSlots 將無法在此範圍內找到可用時段。
      範例: {"type": "EXCEPTION", "date": "2025-12-25", "start_time": "00:00", "end_time": "23:59", "reason": "休假"}
    - **表示特殊可用時段**: 設定實際的 'start_time' 和 'end_time'。FindAvailableSlots 將只在此範圍內查找可用時段。
      範例: {"type": "EXCEPTION", "date": "2025-12-31", "start_time": "13:00", "end_time": "17:00", "reason": "僅下午"}

**重要**: 請確保 start_time 早於 end_time。`,
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
				description: '目標員工的 staff_id (UUID)', // 保持簡潔
			},
			{
				displayName: 'Availability Data',
				name: 'availabilityData',
				type: 'string',
				required: true,
				// --- MODIFIED default 範例 ---
				default: `[
  {"type": "SCHEDULE", "day_of_week": 1, "start_time": "09:00", "end_time": "17:00"},
  {"type": "EXCEPTION", "date": "2025-12-25", "start_time": "00:00", "end_time": "23:59", "reason": "休假"}
]`,
				// --- MODIFIED properties description ---
				description: '包含員工可用時間的 JSON 陣列。詳細用法請參見節點主描述。', // 指向主描述
				typeOptions: {
					rows: 8, // 可以減少行數
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
								description: `Expected format: [{"type": "SCHEDULE", "day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]. Received: ${availabilityDataRaw}. Use start_time and end_time.`
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
										throw new NodeOperationError(node, `Invalid day_of_week in entry ${entryIndex}. Must be an integer between 1 and 7 or a valid English day name (Monday-Sunday). Received: ${dayOfWeekValue}`, { itemIndex: i });
									}
								}
							} else {
								throw new NodeOperationError(node, `Invalid day_of_week type in entry ${entryIndex}. Must be a number or string. Received: ${dayOfWeekValue}`, { itemIndex: i });
							}

							// 驗證轉換後的數字範圍
							if (dayOfWeek < 1 || dayOfWeek > 7) {
								throw new NodeOperationError(node, `Invalid day_of_week in entry ${entryIndex}. Must be an integer between 1 and 7 or a valid English day name (Monday-Sunday). Received: ${dayOfWeekValue}`, { itemIndex: i });
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

						const startTimeValue = entry.start_time; // Enforce snake_case input
						const endTimeValue = entry.end_time; // Enforce snake_case input
						const startTime = normalizeTimeOnly(startTimeValue);
						const endTime = normalizeTimeOnly(endTimeValue);

						if (!startTime || !endTime) {
							// Corrected line 186: Added comma between template literal and options object
							throw new NodeOperationError(node, `Invalid time format in entry ${entryIndex}. Use "HH:MM" format. Received: start_time="${startTimeValue}", end_time="${endTimeValue}". Use start_time and end_time.`, { itemIndex: i });
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

					// --- MODIFICATION START: Delete all old availability first ---
					let totalDeletedCount = 0;
					const initialDeleteQuery = `
						MATCH (st:Staff {staff_id: $staffId})-[r:HAS_AVAILABILITY]->(sa:StaffAvailability)
						DELETE r, sa
						RETURN count(sa) as deletedCount
					`;
					const initialDeleteParams: IDataObject = { staffId };
					try {
						const initialDeleteResults = await runCypherQuery.call(this, session, initialDeleteQuery, initialDeleteParams, true, i);
						totalDeletedCount = Number(initialDeleteResults[0]?.json?.deletedCount || 0);
						this.logger.debug(`Initially deleted ${totalDeletedCount} existing availability records for staff ${staffId}`);
					} catch (deleteError) {
						throw parseNeo4jError(node, deleteError, `Failed to delete existing availability for staff ${staffId}`);
					}
					// --- MODIFICATION END ---

					// 9. 在單一事務中處理可用時間
					// totalDeletedCount is now declared before the loop
					let totalCreatedCount = 0;
					let processedCount = 0;

					this.logger.debug(`Processing ${availabilityData.length} availability entries`, {
						staffId,
						count: availabilityData.length
					});

					// --- MODIFICATION START: Collect data for batch create ---
					const batchCreateParams: any[] = [];
					for (const availabilityItem of availabilityData) {
						processedCount++;
						const isException = availabilityItem.type === 'EXCEPTION';
						this.logger.debug(`Preparing availability type ${availabilityItem.type} for batch create`, {
							staffId,
							item: availabilityItem
						});

						const startTime = toNeo4jTimeString(availabilityItem.start_time);
						const endTime = toNeo4jTimeString(availabilityItem.end_time);

						const params: IDataObject = {
							staffId: staffId, // Ensure staffId is in each item for UNWIND
							type: availabilityItem.type,
							startTime: startTime,
							endTime: endTime,
						};

						if (isException) {
							params.date = availabilityItem.date;
							params.reason = availabilityItem.reason || '';
						} else {
							params.dayOfWeek = neo4j.int(availabilityItem.day_of_week);
						}
						batchCreateParams.push(params);
					}
					// --- MODIFICATION END ---

					// --- MODIFICATION START: Execute batch create after loop ---
					if (batchCreateParams.length > 0) {
						const batchCreateQuery = `
							UNWIND $batchData AS props
							MATCH (st:Staff {staff_id: props.staffId})
							CREATE (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability {
								staff_id: props.staffId,
								type: props.type,
								date: CASE props.type WHEN 'EXCEPTION' THEN date(props.date) ELSE null END,
								day_of_week: CASE props.type WHEN 'SCHEDULE' THEN props.dayOfWeek ELSE null END,
								reason: props.reason,
								start_time: time(props.startTime),
								end_time: time(props.endTime),
								created_at: datetime()
							})
							RETURN count(sa) as createdCount // Return total count
						`;
						const batchParams: IDataObject = { batchData: batchCreateParams };

						this.logger.debug(`Executing batch create for ${batchCreateParams.length} availability records`);
						const batchCreateResults = await runCypherQuery.call(this, session, batchCreateQuery, batchParams, true, i);
						totalCreatedCount = batchCreateResults.length; // Result rows = created nodes
						this.logger.debug(`Batch created ${totalCreatedCount} new availability records`);
					} else {
						this.logger.debug('No availability data to create.');
					}
					// --- MODIFICATION END ---

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
								expectedFormat: { // Updated expected format example
									example: `[{"type": "SCHEDULE", "day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}, {"type": "EXCEPTION", "date": "2025-05-01", "reason": "假期", "start_time": "00:00", "end_time": "23:59"}]`,
									notes: `Use type (SCHEDULE/EXCEPTION), day_of_week (for SCHEDULE) or date (for EXCEPTION), start_time and end_time in HH:MM format. Use "00:00"-"23:59" for full day exception.`
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
