// ============================================================================
// N8N Neo4j Node: Link Staff to User
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
export class Neo4jLinkStaffToUser implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Link Staff to User',
		name: 'neo4jLinkStaffToUser',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'Link Staff {{$parameter["staffId"]}} to User {{$parameter["userId"]}}',
		description: '將現有的員工記錄關聯到一個用戶帳號。,staffId: 要關聯的員工 staff_id (UUID),userId: 要關聯的用戶內部 ID (UUID)。',
		defaults: {
			name: 'Neo4j Link Staff to User',
		},
		inputs: ['main'],
		outputs: ['main'], // Output success/failure or relationship details
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
				description: '要關聯的員工 staff_id',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				required: true,
				default: '',
				description: '要關聯的用戶內部 ID',
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
					const userId = this.getNodeParameter('userId', i, '') as string;

					// 6. Define Cypher Query & Parameters
					// Use MERGE to create the relationship if it doesn't exist
					const query = `
						MATCH (st:Staff {staff_id: $staffId})
						MATCH (u:User {id: $userId})
						MERGE (st)-[r:HAS_USER_ACCOUNT]->(u)
						RETURN count(r) AS linkCreated // Return 1 if created/matched, 0 if nodes not found
					`;
					const parameters: IDataObject = { staffId, userId };
					const isWrite = true; // MERGE is a write operation

					// 7. Execute Query
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}
					const results = await runCypherQuery.call(this, session, query, parameters, isWrite, i);

					// Check if the link was actually created/found
					const linkCreatedCount = results.length > 0 ? results[0].json.linkCreated : 0;
					if (linkCreatedCount === 0) {
						// This indicates either staff or user was not found
						throw new NodeOperationError(node, `Staff ID '${staffId}' or User ID '${userId}' not found. Link not created.`, { itemIndex: i });
					}

					returnData.push({ json: { success: true, staffId, userId }, pairedItem: { item: i } });


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
