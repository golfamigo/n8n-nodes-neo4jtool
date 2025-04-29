// ============================================================================
// N8N Neo4j Node: Find Staff by External ID
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
export class Neo4jFindStaffByExternalId implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Find Staff by External ID',
		name: 'neo4jFindStaffByExternalId',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["externalId"]}}',
		description: '根據用戶 External ID 查找關聯的員工記錄。,externalId: 用戶的 External ID (UUID),businessId: 如果用戶可能在多個商家任職，可指定商家 ID (UUID) 進行過濾 (可選),limit: Max number of results to return。',
		defaults: {
			name: 'Neo4j Find Staff',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				required: true,
				default: '',
				description: '用戶的 External ID',
			},
			{
				displayName: 'Business ID (Optional)',
				name: 'businessId',
				type: 'string',
				default: '',
				description: '如果用戶可能在多個商家任職，可指定商家 ID 進行過濾',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Max number of results to return',
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
					const externalId = this.getNodeParameter('externalId', i, '') as string;
					const businessId = this.getNodeParameter('businessId', i, '') as string;
					const limit = this.getNodeParameter('limit', i, 50) as number;

					// 6. Define Cypher Query & Parameters
					// 修正：修改關係方向，使用正確的 HAS_USER_ACCOUNT 關係方向
					let query = `MATCH (u:User {external_id: $externalId})<-[:HAS_USER_ACCOUNT]-(st:Staff)`; // Corrected relationship type and direction

					const parameters: IDataObject = { externalId, limit: neo4j.int(limit) };

					if (businessId !== undefined && businessId !== '') {
						query += `\nMATCH (st)-[:EMPLOYED_BY]->(b:Business {business_id: $businessId})`;
						parameters.businessId = businessId;
					}

					query += `\nRETURN st {.*} AS staff\nLIMIT $limit`;
					const isWrite = false;

					// 7. Execute Query
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}
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
