// ============================================================================
// N8N Neo4j Node: Find Customer by External ID and Business ID
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
// Renamed class
export class Neo4jFindCustomerByExternalIdAndBusinessId implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Find Customer by External ID & Business ID', // Changed
		name: 'neo4jFindCustomerByExternalIdAndBusinessId', // Changed
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["externalId"]}} in Business {{$parameter["businessId"]}}', // Changed subtitle
		description: '根據用戶 External ID 和商家 ID 查找客戶記錄。,externalId: 用戶的 External ID (UUID),businessId: 客戶註冊的商家 ID (UUID)。', // Changed
		defaults: {
			name: 'Neo4j Find Customer', // Kept simple default name
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			// Updated parameters
			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				required: true,
				default: '',
				description: '用戶的 External ID',
			},
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '客戶註冊的商家 ID',
			},
			// Removed other search criteria

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

					// 6. Define Cypher Query
					// Updated query based on externalId and businessId - CORRECTED RELATION DIRECTION
					const query = `
						MATCH (b:Business {business_id: $businessId})<-[:REGISTERED_WITH]-(c:Customer)-[:HAS_USER_ACCOUNT]->(u:User {external_id: $externalId})
						RETURN c {.*} AS customer
					`;
					const parameters: IDataObject = { externalId, businessId };
					const isWrite = false;

					// 7. Execute Query
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}
					const results = await runCypherQuery.call(this, session, query, parameters, isWrite, i);
					// If no customer found for this user/business combo, results will be empty.
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
