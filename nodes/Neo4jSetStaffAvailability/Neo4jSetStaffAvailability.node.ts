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
	runCypherQuery, // Using session.run directly might be better here too
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
				type: 'number',
				required: true,
				default: 1,
				typeOptions: {
					minValue: 1,
					maxValue: 7,
					numberStep: 1,
				},
				description: '星期幾 (1 = Monday, 7 = Sunday)', // Clarified numbering
			},
			{
				displayName: 'Start Time',
				name: 'startTime',
				type: 'string',
				required: true,
				default: '09:00',
				placeholder: 'HH:MM',
				description: '開始時間 (HH:MM 格式, UTC)',
			},
			{
				displayName: 'End Time',
				name: 'endTime',
				type: 'string',
				required: true,
				default: '17:00',
				placeholder: 'HH:MM',
				description: '結束時間 (HH:MM 格式, UTC)',
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
					const dayOfWeek = this.getNodeParameter('dayOfWeek', i, 1) as number;
					const startTime = this.getNodeParameter('startTime', i, '09:00') as string;
					const endTime = this.getNodeParameter('endTime', i, '17:00') as string;

					// Basic validation for time format
					if (!/^[0-2][0-9]:[0-5][0-9]$/.test(startTime) || !/^[0-2][0-9]:[0-5][0-9]$/.test(endTime)) {
						throw new NodeOperationError(node, 'Invalid Start or End Time format. Please use HH:MM.', { itemIndex: i });
					}

					// 6. Define Cypher Query & Parameters
					// Use MERGE to create or update based on staffId and dayOfWeek
					const query = `
						MERGE (sa:StaffAvailability {staff_id: $staffId, day_of_week: $dayOfWeek})
						ON CREATE SET
							sa.start_time = time($startTime),
							sa.end_time = time($endTime),
							sa.created_at = datetime()
						ON MATCH SET
							sa.start_time = time($startTime),
							sa.end_time = time($endTime),
							sa.updated_at = datetime()
						RETURN sa {.staff_id, .day_of_week, start_time: toString(sa.start_time), end_time: toString(sa.end_time)} AS availability // Return confirmation
					`;
					const parameters: IDataObject = {
						staffId,
						dayOfWeek: neo4j.int(dayOfWeek), // Ensure integer
						startTime,
						endTime,
					};
					const isWrite = true;

					// 7. Execute Query
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}
					// Using runCypherQuery here should be fine as MERGE returns data
					const results = await runCypherQuery.call(this, session, query, parameters, isWrite, i);
					returnData.push(...results);


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
