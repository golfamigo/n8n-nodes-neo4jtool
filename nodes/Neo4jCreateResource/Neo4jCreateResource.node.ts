// ============================================================================
// N8N Neo4j Node: Create Resource
// ============================================================================
import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow'; // Removed jsonParse import
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
	// parseJsonParameter, // We might implement a simplified version here if needed
} from '../neo4j/helpers/utils'; // Adjusted path relative to new location

// --- Node Class Definition ---
export class Neo4jCreateResource implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Resource', // From TaskInstructions.md
		name: 'neo4jCreateResource', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["name"]}}', // Updated subtitle to remove type which is now implicit
		description: '創建一個新的資源記錄並關聯到商家和資源類型。,businessId: 資源所屬的商家 ID (UUID),resourceTypeId: 資源所屬的資源類型 ID (UUID)(如果不知道正確的ID是甚麼，可以使用Neo4j_List_Resource_Types工具查詢).,name: 資源名稱/編號 (例如 Table 5, Window Seat 2),capacity: 資源容量 (可選),propertiesJson: 其他屬性 (JSON 格式, 例如 {"feature": "window_view"}) (可選)。', // Updated description
		defaults: {
			name: 'Neo4j Create Resource',
		},
		inputs: ['main'],
		outputs: ['main'],
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
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '資源所屬的商家 ID',
			},
			{
				displayName: 'Resource Type ID', // Clear display name
				name: 'resourceTypeId',
				type: 'string', // Changed back to string
				required: true,
				default: '',
				description: 'The unique ID (UUID) of the resource type this resource belongs to', // Updated description
				// Removed typeOptions
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				description: 'Name of the resource instance (e.g., Chair 1, Room A)', // More descriptive
			},
			{
				displayName: 'Capacity',
				name: 'capacity',
				type: 'number',
				typeOptions: {
					numberStep: 1,
				},
				default: undefined,
				description: '資源容量 (可選)',
			},
			{
				displayName: 'Properties (JSON String)', // Updated display name
				name: 'propertiesJson',
				type: 'string', // Changed type back to string
				default: '{}',
				description: '其他屬性 (輸入 JSON 格式的字符串, 例如 {"feature": "window_view"}) (可選)', // Updated description
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
					const businessId = this.getNodeParameter('businessId', i, '') as string;
					const resourceTypeId = this.getNodeParameter('resourceTypeId', i, '') as string; // Corrected: Get resourceTypeId
					const name = this.getNodeParameter('name', i, '') as string;
					const capacity = this.getNodeParameter('capacity', i, undefined) as number | undefined;
					const propertiesJson = this.getNodeParameter('propertiesJson', i, '{}') as string;

					// Validate required resourceTypeId
					if (!resourceTypeId) {
						throw new NodeOperationError(node, 'Resource Type ID is required.', { itemIndex: i });
					}


					// Removed JSON parsing logic

					// 6. Define Specific Cypher Query & Parameters
					const query = `
						MATCH (b:Business {business_id: $businessId})
						MATCH (rt:ResourceType {type_id: $resourceTypeId}) // Match the ResourceType
						CREATE (r:Resource {
							resource_id: randomUUID(),
							business_id: $businessId,
							// Removed type property, relationship defines the type now
							name: $name,
							capacity: $capacity,
							properties: $propertiesJsonString,
							created_at: datetime()
						})
						// 建立向後兼容的關聯
						MERGE (r)-[:BELONGS_TO]->(b)
						// 建立向前兼容的關聯
						MERGE (b)-[:HAS_RESOURCE]->(r)
						// Create the relationship to the ResourceType
						MERGE (r)-[:OF_TYPE]->(rt)
						RETURN r {.*} AS resource
					`;
					const parameters: IDataObject = {
						businessId,
						resourceTypeId, // Use resourceTypeId
						name,
						capacity: capacity !== undefined ? neo4j.int(capacity) : null, // Convert to Neo4j Integer or null
						propertiesJsonString: propertiesJson, // Pass the string directly
					};
					const isWrite = true; // This is a write operation (CREATE)

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
