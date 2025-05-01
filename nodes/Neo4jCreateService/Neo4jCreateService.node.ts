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
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils';

// --- Node Class Definition ---
export class Neo4jCreateService implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Service',
		name: 'neo4jCreateService',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["name"]}} for {{$parameter["businessId"]}}',
		description: '為指定商家創建一個新的服務項目。businessId: 提供此服務的商家 ID (UUID),name: 服務名稱,duration_minutes: 服務持續時間（分鐘）,description: 服務描述,price: 服務價格（整數，例如分）(可選),bookingMode: 該服務的預約檢查模式。',
		defaults: {
			name: 'Neo4j Create Service',
		},
		inputs: ['main'],
		outputs: ['main'],
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
					numberStep: 1,
				},
				required: true,
				default: 30,
				description: '服務持續時間（分鐘）',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				required: true,
				default: '',
				description: '服務描述',
			},
			{
				displayName: 'Price (Integer)',
				name: 'price',
				type: 'number',
				typeOptions: {
					numberStep: 1,
				},
				default: 0,
				description: '服務價格（整數，例如分）(可選)',
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
						displayName: 'Booking Mode (UI Setting)',
						name: 'booking_mode',
						type: 'options',
						options: [
							{ name: 'Time Only', value: 'TimeOnly' },
							{ name: 'Staff Only', value: 'StaffOnly' },
							{ name: 'Resource Only', value: 'ResourceOnly' },
							{ name: 'Staff And Resource', value: 'StaffAndResource' },
						],
						default: 'TimeOnly',
						description: '服務的預約檢查模式 (UI 設定)。如果輸入資料中包含 `query.Booking_Mode`，將優先使用輸入資料的值。',
					},
				],
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
		const validBookingModes = ['TimeOnly', 'StaffOnly', 'ResourceOnly', 'StaffAndResource'];

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
					const price = this.getNodeParameter('price', i, undefined) as number | undefined;

					// Determine the booking_mode to use: Prioritize input, fallback to UI parameter
					let bookingModeToUse: string | undefined;
					const itemData = items[i].json as IDataObject;
					const queryData = itemData.query as IDataObject | undefined;
					const bookingModeFromInput = queryData?.Booking_Mode as string | undefined;

					this.logger.info(`Input query data: ${JSON.stringify(queryData)}`);
					this.logger.info(`Read booking_mode from input query.Booking_Mode: ${bookingModeFromInput}`);

					if (bookingModeFromInput !== undefined && bookingModeFromInput !== null && bookingModeFromInput !== '') {
						bookingModeToUse = bookingModeFromInput;
						this.logger.info(`Using booking_mode from input query: ${bookingModeToUse}`);
					} else {
						bookingModeToUse = this.getNodeParameter('options.booking_mode', i, 'TimeOnly') as string;
						this.logger.info(`Input query.Booking_Mode is missing or empty. Falling back to UI parameter 'options.booking_mode': ${bookingModeToUse}`);
					}

					// Validate the final booking_mode value
					if (!bookingModeToUse || !validBookingModes.includes(bookingModeToUse)) {
						let errorMessage = `Invalid booking_mode determined: "${bookingModeToUse}".`;
						if (bookingModeFromInput !== undefined) {
							errorMessage += ` (Received "${bookingModeFromInput}" from input query.Booking_Mode).`;
						} else {
							errorMessage += ` (Input query.Booking_Mode was missing/empty, fallback UI setting was "${this.getNodeParameter('options.booking_mode', i, 'TimeOnly') as string}").`;
						}
						errorMessage += ` Valid modes are: ${validBookingModes.join(', ')}`;
						throw new NodeOperationError(node, errorMessage, { itemIndex: i });
					}

					// 6. Define Specific Cypher Query & Parameters
					this.logger.info(`Creating Service with parameters:`);
					this.logger.info(`- businessId: ${businessId}`);
					this.logger.info(`- name: ${name}`);
					this.logger.info(`- duration_minutes: ${duration_minutes}`);
					this.logger.info(`- description: ${description}`);
					this.logger.info(`- price: ${price}`);
					this.logger.info(`- booking_mode (to be used): ${bookingModeToUse}`);

					const query = `
						MATCH (b:Business {business_id: $businessId})
						CREATE (s:Service {
							service_id: randomUUID(),
							name: $name,
							duration_minutes: $duration_minutes,
							description: $description,
							price: $price,
							booking_mode: $booking_mode_param,
							created_at: datetime()
						})
						MERGE (b)-[:OFFERS]->(s)
						RETURN s {.*} AS service
					`;
					const parameters: IDataObject = {
						businessId,
						name,
						duration_minutes: neo4j.int(duration_minutes),
						description,
						price: (price !== undefined) ? neo4j.int(price) : null,
						booking_mode_param: bookingModeToUse,
					};
					const isWrite = true;

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
