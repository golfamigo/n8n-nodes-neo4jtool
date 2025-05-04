// ============================================================================
// N8N Neo4j Node: Create Business
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
export class Neo4jCreateBusiness implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Business', // From TaskInstructions.md
		name: 'neo4jCreateBusiness', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg', // Point to the icon in the shared neo4j folder
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["name"]}}', // Show business name in subtitle
		description: '創建一個新的商家記錄並關聯所有者。,ownerUserId: 關聯的 User 節點的內部 ID (UUID) (不是 external_id),name: 商家名稱,type: 商家類型 (例如 Salon, Clinic),address: 商家地址,phone: 商家聯繫電話,email: 商家聯繫電子郵件,description: 商家描述。', // Removed booking_mode description
		defaults: {
			name: 'Neo4j Create Business',
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
				displayName: 'Owner User ID',
				name: 'ownerUserId',
				type: 'string',
				required: true,
				default: '',
				description: '關聯的 User 節點的內部 ID (不是 external_id)',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				required: true,
				default: '',
				description: '商家名稱',
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'string',
				required: true,
				default: '',
				description: '商家類型 (例如 Salon, Clinic)',
			},
			{
				displayName: 'Address',
				name: 'address',
				type: 'string',
				required: true, // Changed to required based on feedback
				default: '',
				description: '商家地址',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				required: true, // Changed to required based on feedback
				default: '',
				description: '商家聯繫電話',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				required: true, // Changed to required based on feedback
				default: '',
				placeholder: 'name@email.com',
				description: '商家聯繫電子郵件',
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				required: true,
				default: 'Asia/Taipei',
				description: '商家所在時區 (例如 Asia/Taipei 或 +08:00)',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				required: true, // Changed to required based on feedback
				default: '',
				description: '商家描述',
			},
			// Removed booking_mode parameter from properties
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();
		// Removed validBookingModes definition

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
					const ownerUserId = this.getNodeParameter('ownerUserId', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const type = this.getNodeParameter('type', i, '') as string;
					const address = this.getNodeParameter('address', i, '') as string;
					const phone = this.getNodeParameter('phone', i, '') as string;
					const email = this.getNodeParameter('email', i, '') as string;
					const description = this.getNodeParameter('description', i, '') as string;
					const timezone = this.getNodeParameter('timezone', i, 'Asia/Taipei') as string;

					// Removed logic for determining and validating booking_mode

					// 6. Define Specific Cypher Query & Parameters
					this.logger.info(`Creating Business with parameters:`);
					this.logger.info(`- ownerUserId: ${ownerUserId}`);
					this.logger.info(`- name: ${name}`);
					this.logger.info(`- type: ${type}`);
					this.logger.info(`- timezone: ${timezone}`);
					// Removed booking_mode logging

					const query = `
					MATCH (owner:User {id: $ownerUserId})
					CREATE (b:Business {
						business_id: randomUUID(),
						name: $name,
						type: $type,
						address: $address,
						phone: $phone,
						email: $email,
						description: $description,
						timezone: $timezone,
						created_at: datetime()
					})
					MERGE (owner)-[:OWNS]->(b)
					RETURN b {.*} AS business
					`;
					const parameters: IDataObject = {
						ownerUserId,
						name,
						type,
						address,
						phone,
						email,
						timezone,
						description,
						// Removed booking_mode_param from parameters
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
