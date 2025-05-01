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
		description: '創建一個新的商家記錄並關聯所有者, Booking Mode只能設定為ResourceOnly, StaffOnly, StaffAndResource, TimeOnly 這4種模式，請依照商家的型態設定。,ownerUserId: 關聯的 User 節點的內部 ID (UUID) (不是 external_id),name: 商家名稱,type: 商家類型 (例如 Salon, Clinic),address: 商家地址,phone: 商家聯繫電話,email: 商家聯繫電子郵件,description: 商家描述,booking_mode: 商家的預約檢查模式，Booking Mode只能設定為ResourceOnly, StaffOnly, StaffAndResource, TimeOnly 這4種模式，請依照商家的型態設定。', // From TaskInstructions.md
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
				displayName: 'Description',
				name: 'description',
				type: 'string',
				required: true, // Changed to required based on feedback
				default: '',
				description: '商家描述',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				required: true,
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Booking Mode (UI Setting)', // Clarify this is the UI setting
						name: 'booking_mode',
						type: 'options', // Changed from multiOptions to options for single selection
						options: [
							{
								name: 'Resource Only',
								value: 'ResourceOnly',
							},
							{
								name: 'Staff Only',
								value: 'StaffOnly',
							},
							{
								name: 'Staff And Resource',
								value: 'StaffAndResource',
							},
							{
								name: 'Time Only',
								value: 'TimeOnly',
							},
						],
						default: 'TimeOnly', // Set a reasonable default, or '' if required must be true elsewhere
						description: '商家的預約檢查模式 (UI 設定)。如果輸入資料中包含 `query.Booking_Mode`，將優先使用輸入資料的值。',
					},
				],
			}
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
					const ownerUserId = this.getNodeParameter('ownerUserId', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const type = this.getNodeParameter('type', i, '') as string;
					const address = this.getNodeParameter('address', i, '') as string;
					const phone = this.getNodeParameter('phone', i, '') as string;
					const email = this.getNodeParameter('email', i, '') as string;
					const description = this.getNodeParameter('description', i, '') as string;

					// Determine the booking_mode to use: Prioritize input, fallback to UI parameter
					let booking_mode_to_use: string | undefined;
					const itemData = items[i].json as IDataObject;
					const queryData = itemData.query as IDataObject | undefined;
					const booking_mode_from_input = queryData?.Booking_Mode as string | undefined;

					this.logger.info(`Input query data: ${JSON.stringify(queryData)}`);
					this.logger.info(`Read booking_mode from input query.Booking_Mode: ${booking_mode_from_input}`);

					if (booking_mode_from_input !== undefined && booking_mode_from_input !== null && booking_mode_from_input !== '') {
						// Use value from input if provided and not empty
						booking_mode_to_use = booking_mode_from_input;
						this.logger.info(`Using booking_mode from input query: ${booking_mode_to_use}`);
					} else {
						// Fallback to UI parameter if input is missing or empty
						// Use dot notation to access parameter within 'options' collection
						booking_mode_to_use = this.getNodeParameter('options.booking_mode', i, 'TimeOnly') as string; // Use the default value defined in properties
						this.logger.info(`Input query.Booking_Mode is missing or empty. Falling back to UI parameter 'options.booking_mode': ${booking_mode_to_use}`);
					}

					// Validate the final booking_mode value
					if (!booking_mode_to_use || !validBookingModes.includes(booking_mode_to_use)) {
						let errorMessage = `Invalid booking_mode determined: "${booking_mode_to_use}".`;
						if (booking_mode_from_input !== undefined) {
							errorMessage += ` (Received "${booking_mode_from_input}" from input query.Booking_Mode).`;
						} else {
							errorMessage += ` (Input query.Booking_Mode was missing/empty, fallback UI setting was "${this.getNodeParameter('options.booking_mode', i, 'TimeOnly') as string}").`;
						}
						errorMessage += ` Valid modes are: ${validBookingModes.join(', ')}`;
						throw new NodeOperationError(node, errorMessage, { itemIndex: i });
					}

					// 6. Define Specific Cypher Query & Parameters
					this.logger.info(`Creating Business with final parameters:`);
					this.logger.info(`- ownerUserId: ${ownerUserId}`);
					this.logger.info(`- name: ${name}`);
					this.logger.info(`- type: ${type}`);
					this.logger.info(`- booking_mode (to be used): ${booking_mode_to_use}`); // Log the value being sent to Neo4j

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
								booking_mode: $booking_mode_param, // Use a distinct name for the Cypher parameter
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
						description,
						booking_mode_param: booking_mode_to_use, // Pass the validated value from input using the Cypher parameter name
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
