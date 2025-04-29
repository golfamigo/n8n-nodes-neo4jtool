// ============================================================================
// N8N Neo4j Node: Create Service
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
import neo4j, { Driver, Session, auth } from 'neo4j-driver'; // Import Integer

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils'; // Adjusted path relative to new location

// --- Node Class Definition ---
export class Neo4jCreateService implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Service', // From TaskInstructions.md
		name: 'neo4jCreateService', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg', // Point to the icon in the shared neo4j folder
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["name"]}} for {{$parameter["businessId"]}}', // Show service and business ID
		description: '為指定商家創建一個新的服務項目。,businessId: 提供此服務的商家 ID (UUID),name: 服務名稱,duration_minutes: 服務持續時間（分鐘）,description: 服務描述,price: 服務價格（整數，例如分）(可選)。', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Create Service',
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
				description: '提供此服務的商家 ID',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				description: '服務名稱',
			},
			{
				displayName: 'Duration (Minutes)',
				name: 'duration_minutes',
				type: 'number',
				typeOptions: {
					numberStep: 1, // Ensure integer input
				},
				required: true,
				default: 30, // Default duration
				description: '服務持續時間（分鐘）',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				required: true, // Added back as requested
				default: '',
				description: '服務描述',
			},
			{
				displayName: 'Price (Integer)',
				name: 'price',
				type: 'number',
				typeOptions: {
					numberStep: 1, // Ensure integer input if price is used
				},

				default: 0,
				description: '服務價格（整數，例如分）(可選)',
			},
			// REMOVED categoryId property
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
					const name = this.getNodeParameter('name', i, '') as string;
					const duration_minutes = this.getNodeParameter('duration_minutes', i, 30) as number;
					const description = this.getNodeParameter('description', i, '') as string;
					const price = this.getNodeParameter('price', i, undefined) as number | undefined; // Handle optional price
					// REMOVED categoryId retrieval
					// REMOVED is_system retrieval

					// 6. Define Specific Cypher Query & Parameters
					// Base query parts
					const matchClauses = ['MATCH (b:Business {business_id: $businessId})'];
					const createServiceClause = `
						CREATE (s:Service {
							service_id: randomUUID(),
							name: $name,
							duration_minutes: $duration_minutes,
							description: $description,
							price: $price,
							// REMOVED is_system property
							created_at: datetime()
						})
					`;
					const mergeRelationClauses = ['MERGE (b)-[:OFFERS]->(s)'];
					const returnClause = 'RETURN s {.*} AS service';

					const parameters: IDataObject = {
						businessId,
						name,
						// Use neo4j.int() for explicit integer conversion
						duration_minutes: neo4j.int(duration_minutes),
						description,
						// Handle optional price, ensuring it's an integer if provided
						price: (price !== undefined) ? neo4j.int(price) : null,
						// REMOVED is_system parameter
					};

					// REMOVED Handle optional category block

					// Combine query parts
					const query = [
						...matchClauses,
						createServiceClause,
						...mergeRelationClauses,
						returnClause,
					].join('\n');

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
