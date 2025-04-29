// ============================================================================
// N8N Neo4j Node: Delete Resource
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
} from '../neo4j/helpers/utils'; // Adjusted path relative to new location

// --- Node Class Definition ---
export class Neo4jDeleteResource implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Delete Resource', // From TaskInstructions.md
		name: 'neo4jDeleteResource', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["resourceId"]}}', // Show resourceId
		description: '根據 resource_id 刪除資源及其關聯關係。,resourceId: 要刪除的資源 ID (UUID)', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Delete Resource',
		},
		inputs: ['main'],
		outputs: ['main'], // Output might be empty or indicate success/failure
		// @ts-ignore - Workaround
		usableAsTool: true,

		// --- Credentials ---
		credentials: [
			{
				name: 'neo4jApi',
				required: true,
			},
		],

		// --- Node Specific Input Properties ---
		properties: [
			// Parameters from TaskInstructions.md
			{
				displayName: 'Resource ID',
				name: 'resourceId',
				type: 'string',
				required: true,
				default: '',
				description: '要刪除的資源 ID',
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
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured or missing required fields (host, port, username, password).', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const user = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			// 3. Establish Neo4j Connection
			try {
				driver = neo4j.driver(uri, auth.basic(user, password));
				await driver.verifyConnectivity();
				this.logger.debug('Neo4j driver connected successfully.');
				session = driver.session({ database });
				this.logger.debug(`Neo4j session opened for database: ${database}`);
			} catch (connectionError) {
				this.logger.error('Failed to connect to Neo4j or open session:', connectionError);
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection or session.');
			}

			// 4. Loop Through Input Items
			for (let i = 0; i < items.length; i++) {
				try {
					// 5. Get Input Parameters
					const resourceId = this.getNodeParameter('resourceId', i, '') as string;

					// 6. Define Specific Cypher Query & Parameters
					// Query from TaskInstructions.md
					// IMPORTANT: DETACH DELETE removes the node and all its relationships.
					const query = 'MATCH (r:Resource {resource_id: $resourceId}) DETACH DELETE r';
					const parameters: IDataObject = { resourceId };
					const isWrite = true; // This is a write operation (DELETE)

					// 7. Execute Query
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}
					// Delete operations might not return data.
					await runCypherQuery.call(this, session, query, parameters, isWrite, i);

					// Optionally, return a success message or status
					returnData.push({ json: { success: true, deletedResourceId: resourceId }, pairedItem: { item: i } });

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
			throw parseNeo4jError(node, error);
		} finally {
			// 11. Close Session and Driver
			if (session) {
				try {
					await session.close();
					this.logger.debug('Neo4j session closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j session:', closeError);
				}
			}
			if (driver) {
				try {
					await driver.close();
					this.logger.debug('Neo4j driver closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j driver:', closeError);
				}
			}
		}
	}
}
