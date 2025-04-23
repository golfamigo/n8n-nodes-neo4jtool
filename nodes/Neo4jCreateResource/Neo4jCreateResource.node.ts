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
import { NodeOperationError, jsonParse } from 'n8n-workflow'; // Import jsonParse
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
		subtitle: '={{$parameter["type"]}}: {{$parameter["name"]}}', // Show type and name
		description: '創建一個新的資源記錄並關聯到商家。', // From TaskInstructions.md
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
				displayName: 'Type',
				name: 'type',
				type: 'string',
				required: true,
				default: '',
				description: '資源類型 (例如 Table, Seat, Room). 建議先用 ListResourceTypes 查詢.',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				description: '資源名稱/編號 (例如 Table 5, Window Seat 2)',
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
				displayName: 'Properties (JSON)',
				name: 'propertiesJson', // Use different name to avoid conflict with internal 'properties'
				type: 'json',
				default: '{}',
				description: '其他屬性 (JSON 格式, 例如 {"feature": "window_view"}) (可選)',
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
					const type = this.getNodeParameter('type', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const capacity = this.getNodeParameter('capacity', i, undefined) as number | undefined;
					const propertiesJson = this.getNodeParameter('propertiesJson', i, '{}') as string;

					// Parse JSON properties safely
					let properties: IDataObject = {};
					try {
						properties = jsonParse(propertiesJson);
						if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
							throw new NodeOperationError(node, 'Properties must be a valid JSON object.', { itemIndex: i });
						}
					} catch (jsonError) {
						throw new NodeOperationError(node, `Invalid JSON in Properties field: ${jsonError.message}`, { itemIndex: i });
					}


					// 6. Define Specific Cypher Query & Parameters
					const query = `
						MATCH (b:Business {business_id: $businessId})
						CREATE (r:Resource {
							resource_id: randomUUID(),
							business_id: $businessId,
							type: $type,
							name: $name,
							capacity: $capacity,
							properties: $propertiesJsonString,
							created_at: datetime()
						})
						// 建立向後兼容的關聯
						MERGE (r)-[:BELONGS_TO]->(b)
						// 建立向前兼容的關聯
						MERGE (b)-[:HAS_RESOURCE]->(r)
						RETURN r {.*} AS resource
					`;
					const parameters: IDataObject = {
						businessId,
						type,
						name,
						capacity: capacity !== undefined ? neo4j.int(capacity) : null, // Convert to Neo4j Integer or null
						propertiesJsonString: JSON.stringify(properties),
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
