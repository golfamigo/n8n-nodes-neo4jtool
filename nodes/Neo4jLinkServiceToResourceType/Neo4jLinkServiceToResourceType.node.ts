// ============================================================================
// N8N Neo4j Node: Link Service to Resource Type
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
export class Neo4jLinkServiceToResourceType implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Link Service to Resource Type',
		name: 'neo4jLinkServiceToResourceType',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["serviceId"]}} REQUIRES {{$parameter["resourceTypeId"]}}',
		description: '創建服務 (Service) 與所需資源類型 (ResourceType) 之間的 :REQUIRES_RESOURCE 關係',
		defaults: {
			name: 'Neo4j Link Service to Resource Type',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			{
				displayName: 'Service ID',
				name: 'serviceId',
				type: 'string', // Using string for now
				required: true,
				default: '',
				description: '需要關聯的服務的 ID (UUID)',
				// placeholder: 'Enter Service ID or select...', // Placeholder if using options
				// typeOptions: { loadOptionsMethod: 'listServices' } // Add later if needed
			},
			{
				displayName: 'Resource Type ID',
				name: 'resourceTypeId',
				type: 'string', // Using string for now
				required: true,
				default: '',
				description: '服務所需的資源類型的 ID (UUID)',
				// placeholder: 'Enter Resource Type ID or select...', // Placeholder if using options
				// typeOptions: { loadOptionsMethod: 'listResourceTypes' } // Add later if needed
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
					const serviceId = this.getNodeParameter('serviceId', i, '') as string;
					const resourceTypeId = this.getNodeParameter('resourceTypeId', i, '') as string;

					// Validate IDs
					if (!serviceId || !resourceTypeId) {
						throw new NodeOperationError(node, 'Service ID and Resource Type ID are required.', { itemIndex: i });
					}

					// 6. Define Cypher Query & Parameters
					const query = `
						MATCH (s:Service {service_id: $serviceId})
						MATCH (rt:ResourceType {type_id: $resourceTypeId})
						MERGE (s)-[r:REQUIRES_RESOURCE]->(rt)
						RETURN type(r) AS relationshipType
					`;
					const parameters: IDataObject = {
						serviceId,
						resourceTypeId,
					};
					const isWrite = true; // This is a write operation (MERGE)

					// 7. Execute Query
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}
					const results = await runCypherQuery.call(this, session, query, parameters, isWrite, i);

					// Add relationship type to output for confirmation
					if (results.length > 0 && results[0].json.relationshipType) {
						returnData.push({
							json: { ...items[i].json, relationshipCreated: results[0].json.relationshipType },
							pairedItem: { item: i }
						});
					} else {
						// Handle case where MERGE didn't create/return anything (shouldn't happen with MERGE)
						// Or if nodes weren't found (MATCH failed) - runCypherQuery might throw or return empty
						returnData.push({
							json: { ...items[i].json, error: 'Relationship creation failed or nodes not found.' },
							pairedItem: { item: i }
						});
					}


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
