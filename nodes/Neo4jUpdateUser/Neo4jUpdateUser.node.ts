// ============================================================================
// N8N Neo4j Node: Update User
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
export class Neo4jUpdateUser implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Update User', // Changed
		name: 'neo4jUpdateUser', // Changed
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["userId"]}}', // Show internal user ID
		description: '根據內部 User ID 更新用戶資訊。,userId: 要更新的用戶內部 ID (UUID),name: 新的用戶姓名 (可選),email: 新的用戶電子郵件 (可選),phone: 新的用戶電話號碼 (可選),notification_enabled: Whether notifications are enabled for the user (optional)。', // Changed
		defaults: {
			name: 'Neo4j Update User',
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
			{
				displayName: 'User ID', // Use internal ID for update
				name: 'userId',
				type: 'string',
				required: true,
				default: '',
				description: '要更新的用戶內部 ID',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: '新的用戶姓名 (可選)',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'name@email.com',
				description: '新的用戶電子郵件 (可選)',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				description: '新的用戶電話號碼 (可選)',
			},
			{
				displayName: 'Notification Enabled',
				name: 'notification_enabled',
				type: 'boolean',
				default: false,
				description: 'Whether notifications are enabled for the user (optional)',
			},
			// Removed is_system as obsolete
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
					const userId = this.getNodeParameter('userId', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const email = this.getNodeParameter('email', i, '') as string;
					const phone = this.getNodeParameter('phone', i, '') as string;
					const notification_enabled = this.getNodeParameter('notification_enabled', i, undefined) as boolean | undefined; // Get as undefined if not set

					// Build SET clause dynamically
					const setClauses: string[] = [];
					const parameters: IDataObject = { userId };

					if (name !== undefined && name !== '') { setClauses.push('u.name = $name'); parameters.name = name; }
					if (email !== undefined && email !== '') { setClauses.push('u.email = $email'); parameters.email = email; }
					if (phone !== undefined && phone !== '') { setClauses.push('u.phone = $phone'); parameters.phone = phone; }
					if (notification_enabled !== undefined) { setClauses.push('u.notification_enabled = $notification_enabled'); parameters.notification_enabled = notification_enabled; }

					if (setClauses.length === 0) {
						this.logger.warn(`No update parameters provided for User ID: ${userId}. Returning current data.`);
						const findQuery = 'MATCH (u:User {id: $userId}) RETURN u {.*} AS user';
						const findParams = { userId };
						if (!session) throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
						const findResults = await runCypherQuery.call(this, session, findQuery, findParams, false, i);
						returnData.push(...findResults);
						continue;
					}

					// Add updated_at timestamp
					setClauses.push('u.updated_at = datetime()');

					// 6. Define Specific Cypher Query
					const query = `
						MATCH (u:User {id: $userId})
						SET ${setClauses.join(', ')}
						RETURN u {.*} AS user
					`;
					const isWrite = true; // This is a write operation (SET)

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
