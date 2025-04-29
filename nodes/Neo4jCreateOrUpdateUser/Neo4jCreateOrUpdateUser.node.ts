// ============================================================================
// N8N Neo4j Node: Create or Update User
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
export class Neo4jCreateOrUpdateUser implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create or Update User', // From TaskInstructions.md
		name: 'neo4jCreateOrUpdateUser', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg', // Point to the icon in the shared neo4j folder
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["external_id"]}}', // Show external_id in subtitle
		description: '根據 external_id 查找或創建用戶，並在創建時生成內部 id。,external_id: The External ID to find or create the user by (UUID),name: Users name,email: Users email address,phone: Users phone number,notification_enabled: Whether notifications are enabled for the user。', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Create/Update User',
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
				displayName: 'External ID',
				name: 'external_id',
				type: 'string',
				required: true,
				default: '',
				description: 'The External ID to find or create the user by',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				description: 'User\'s name',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				required: true,
				default: '',
				description: 'User\'s email address',
				placeholder: 'name@email.com',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				required: true,
				default: '',
				description: 'User\'s phone number',
			},
			{
				displayName: 'Notification Enabled',
				name: 'notification_enabled',
				type: 'boolean',
				default: false,
				description: 'Whether notifications are enabled for the user',
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
					const external_id = this.getNodeParameter('external_id', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const email = this.getNodeParameter('email', i, '') as string;
					const phone = this.getNodeParameter('phone', i, '') as string;
					const notification_enabled = this.getNodeParameter('notification_enabled', i, false) as boolean;
					const is_system = this.getNodeParameter('is_system', i, false) as boolean;

					// 6. Define Specific Cypher Query & Parameters
					// Query from TaskInstructions.md
					const query = `
						MERGE (u:User {external_id: $external_id})
						ON CREATE SET
							u.id = randomUUID(),
							u.name = $name,
							u.email = $email,
							u.phone = $phone,
							u.notification_enabled = $notification_enabled,
							u.is_system = $is_system,
							u.created_at = datetime()
						ON MATCH SET
							u.name = $name,
							u.email = $email,
							u.phone = $phone,
							u.notification_enabled = $notification_enabled,
							u.is_system = $is_system,
							u.updated_at = datetime()
						RETURN u {.*} AS user
					`;
					const parameters: IDataObject = {
						external_id,
						name,
						email,
						phone,
						notification_enabled,
						is_system,
					};
					const isWrite = true; // This is a write operation (MERGE)

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
