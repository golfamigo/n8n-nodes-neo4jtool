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
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils';

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
		description: '設定或更新指定員工在特定星期幾的可用起訖時間。',
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
				displayName: 'Day of Week',
				name: 'dayOfWeek',
				type: 'string', // 保持為 string 類型以確保 MCP 兼容性
				required: true,
				default: '1',
				description: '星期幾 (0-6, 0 是星期日, 1 是星期一)', // 更新為 0-6 數字系統
			},
			{
				displayName: 'Start Time',
				name: 'startTime',
				type: 'string',
				required: true,
				default: '09:00',
				placeholder: 'HH:MM',
				description: '開始時間 (HH:MM 格式)',
			},
			{
				displayName: 'End Time',
				name: 'endTime',
				type: 'string',
				required: true,
				default: '17:00',
				placeholder: 'HH:MM',
				description: '結束時間 (HH:MM 格式)',
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
					const dayOfWeekString = this.getNodeParameter('dayOfWeek', i, '1') as string; // 獲取為字串
					const startTime = this.getNodeParameter('startTime', i, '09:00') as string;
					const endTime = this.getNodeParameter('endTime', i, '17:00') as string;

					// 詳細記錄接收到的參數
					console.log('Setting staff availability with parameters:');
					console.log('- staffId:', staffId);
					console.log('- dayOfWeek (raw):', dayOfWeekString);
					console.log('- startTime:', startTime);
					console.log('- endTime:', endTime);

					// 將 dayOfWeek 字串轉換為數字
					const dayOfWeek = parseInt(dayOfWeekString, 10);
					if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
						throw new NodeOperationError(node, `Invalid Day of Week value: ${dayOfWeekString}. Must be a number between 0 and 6 (0 = Sunday, 6 = Saturday).`, { itemIndex: i });
					}

					console.log('- dayOfWeek (parsed):', dayOfWeek);

					// 基本時間格式驗證
					if (!/^[0-2][0-9]:[0-5][0-9]$/.test(startTime) || !/^[0-2][0-9]:[0-5][0-9]$/.test(endTime)) {
						throw new NodeOperationError(node, 'Invalid Start or End Time format. Please use HH:MM.', { itemIndex: i });
					}

					// 6. 分開查詢和更新以避免混合操作的問題

					// 6a. 先檢查員工和星期是否存在
					const checkQuery = `
						MATCH (st:Staff {staff_id: $staffId})
						RETURN st
					`;
					const checkParams: IDataObject = { staffId };

					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}

					const checkResults = await runCypherQuery.call(this, session, checkQuery, checkParams, false, i);
					if (checkResults.length === 0) {
						throw new NodeOperationError(node, `Staff with ID ${staffId} not found`, { itemIndex: i });
					}

					// 6b. 刪除現有可用性關係
					const deleteQuery = `
						MATCH (st:Staff {staff_id: $staffId})-[r:HAS_AVAILABILITY]->(sa:StaffAvailability)
						WHERE sa.day_of_week = $dayOfWeek
						DELETE r, sa
						RETURN count(r) as deletedCount
					`;
					const deleteParams: IDataObject = {
						staffId,
						dayOfWeek: neo4j.int(dayOfWeek),
					};

					const deleteResults = await runCypherQuery.call(this, session, deleteQuery, deleteParams, true, i);
					console.log(`Deleted ${deleteResults[0]?.json?.deletedCount || 0} existing availability records`);

					// 6c. 創建新的可用性記錄
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
					const createParams: IDataObject = {
						staffId,
						dayOfWeek: neo4j.int(dayOfWeek),
						startTime,
						endTime,
					};

					const createResults = await runCypherQuery.call(this, session, createQuery, createParams, true, i);
					returnData.push(...createResults);

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
