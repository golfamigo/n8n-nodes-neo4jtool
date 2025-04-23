// ============================================================================
// N8N Neo4j Node: Update Business
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
export class Neo4jUpdateBusiness implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Update Business', // From TaskInstructions.md
		name: 'neo4jUpdateBusiness', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg', // Point to the icon in the shared neo4j folder
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["businessId"]}}', // Show businessId in subtitle
		description: '根據 business_id 更新商家資訊。', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Update Business',
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
				description: '要更新的商家 ID',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: '新的商家名稱 (可選)',
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'string',
				default: '',
				description: '新的商家類型 (可選)',
			},
			{
				displayName: 'Address',
				name: 'address',
				type: 'string',
				default: '',
				description: '新的商家地址 (可選)',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				description: '新的商家聯繫電話 (可選)',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'name@email.com',
				description: '新的商家聯繫電子郵件 (可選)',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: '新的商家描述 (可選)',
			},
			{
			displayName: 'Booking Mode',
			name: 'booking_mode',
			type: 'options',
			options: [
			 {
			   name: 'Resource Only',
							value: 'ResourceOnly'
						},
						{
							name: 'Staff Only',
							value: 'StaffOnly'
						},
						{
							name: 'Staff And Resource',
							value: 'StaffAndResource'
						},
						{
							name: 'Time Only',
							value: 'TimeOnly'
						}
					],
					default: 'StaffAndResource',
					description: '新的商家預約檢查模式 (可選)',
				},
			// REMOVED business_hours as it's handled by separate nodes
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();
		const validBookingModes = ['ResourceOnly', 'StaffOnly', 'StaffAndResource', 'TimeOnly']; // Define valid modes

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
					const name = this.getNodeParameter('name', i, undefined) as string | undefined;
					const type = this.getNodeParameter('type', i, undefined) as string | undefined;
					const address = this.getNodeParameter('address', i, undefined) as string | undefined;
					const phone = this.getNodeParameter('phone', i, undefined) as string | undefined;
					const email = this.getNodeParameter('email', i, undefined) as string | undefined;
					const description = this.getNodeParameter('description', i, undefined) as string | undefined;
					const booking_mode = this.getNodeParameter('booking_mode', i, undefined) as string | undefined;
this.logger.info(`Updating business with booking_mode: ${booking_mode}`);

					// ADDED: Validate booking_mode if provided
					if (booking_mode !== undefined && booking_mode !== '' && !validBookingModes.includes(booking_mode)) {
						throw new NodeOperationError(node, `Invalid booking_mode: "${booking_mode}". Valid modes are: ${validBookingModes.join(', ')}`, { itemIndex: i });
					}

					// Build SET clause dynamically based on provided parameters
					const setClauses: string[] = [];
					const parameters: IDataObject = { businessId };

					// Explicitly log all parameters for update operation
					this.logger.info(`Updating Business with ID: ${businessId}`);

					if (name !== undefined && name !== '') {
					 setClauses.push('b.name = $name');
					 parameters.name = name;
					 this.logger.info(`- Setting name: ${name}`);
						}
						if (type !== undefined && type !== '') {
							setClauses.push('b.type = $type');
							parameters.type = type;
							this.logger.info(`- Setting type: ${type}`);
						}
						if (address !== undefined && address !== '') {
							setClauses.push('b.address = $address');
							parameters.address = address;
							this.logger.info(`- Setting address: ${address}`);
						}
						if (phone !== undefined && phone !== '') {
							setClauses.push('b.phone = $phone');
							parameters.phone = phone;
							this.logger.info(`- Setting phone: ${phone}`);
						}
						if (email !== undefined && email !== '') {
							setClauses.push('b.email = $email');
							parameters.email = email;
							this.logger.info(`- Setting email: ${email}`);
						}
						if (description !== undefined && description !== '') {
							setClauses.push('b.description = $description');
							parameters.description = description;
							this.logger.info(`- Setting description: ${description}`);
						}
						if (booking_mode !== undefined && booking_mode !== '') {
							setClauses.push('b.booking_mode = $booking_mode');
							parameters.booking_mode = booking_mode;
							this.logger.info(`- Setting booking_mode: ${booking_mode}`);
						}

					if (setClauses.length === 0) {
						// If no optional parameters are provided, maybe just return the existing node or throw an error?
						// For now, let's return the existing node after matching.
						this.logger.warn(`No update parameters provided for Business ID: ${businessId}. Returning current data.`);
						const findQuery = 'MATCH (b:Business {business_id: $businessId}) RETURN b {.*} AS business';
						const findParams = { businessId };
						if (!session) throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
						const findResults = await runCypherQuery.call(this, session, findQuery, findParams, false, i);
						returnData.push(...findResults);
						continue; // Skip to next item
					}

					// Add updated_at timestamp
					setClauses.push('b.updated_at = datetime()');

					// 6. Define Specific Cypher Query
					const query = `
						MATCH (b:Business {business_id: $businessId})
						SET ${setClauses.join(', ')}
						RETURN b {.*} AS business
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
