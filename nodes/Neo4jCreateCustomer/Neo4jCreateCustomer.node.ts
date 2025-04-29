// ============================================================================
// N8N Neo4j Node: Create Customer
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
export class Neo4jCreateCustomer implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Customer', // From TaskInstructions.md
		name: 'neo4jCreateCustomer', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg', // Point to the icon in the shared neo4j folder
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["name"]}} for {{$parameter["businessId"]}}', // Show customer name and business ID
		description: '為指定商家創建一個新的客戶資料並關聯用戶。,businessId: 客戶註冊的商家 ID (UUID),userId: 關聯的 User 節點的內部 ID (UUID),name: 客戶姓名 (可以與 User.name 不同),phone: 客戶聯繫電話,email: 客戶聯繫電子郵件。', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Create Customer',
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
				description: '客戶註冊的商家 ID',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				required: true,
				default: '',
				description: '關聯的 User 節點的內部 ID',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				description: '客戶姓名 (可以與 User.name 不同)',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				required: true, // Changed to required based on feedback in CreateBusiness
				default: '',
				description: '客戶聯繫電話',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				required: true, // Changed to required based on feedback in CreateBusiness
				default: '',
				placeholder: 'name@email.com',
				description: '客戶聯繫電子郵件',
			},
			// Removed is_system as it's obsolete
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
					const userId = this.getNodeParameter('userId', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const phone = this.getNodeParameter('phone', i, '') as string;
					const email = this.getNodeParameter('email', i, '') as string;
					// is_system removed

					// 6. Define Specific Cypher Query & Parameters
					// Query from TaskInstructions.md, adapted to remove is_system
					const query = `
						MATCH (b:Business {business_id: $businessId}), (u:User {id: $userId})
						CREATE (c:Customer {
							customer_id: randomUUID(),
							name: $name,
							business_id: $businessId,
							phone: $phone,
							email: $email,
							created_at: datetime()
						})
						MERGE (c)-[:REGISTERED_WITH]->(b)
						MERGE (c)-[:HAS_USER_ACCOUNT]->(u)
						RETURN c {.*} AS customer
					`;
					const parameters: IDataObject = {
						businessId,
						userId,
						name,
						phone,
						email,
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
