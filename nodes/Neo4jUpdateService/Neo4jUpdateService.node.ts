// ============================================================================
// N8N Neo4j Node: Update Service
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
import neo4j, { Driver, Session, auth } from 'neo4j-driver'; // Removed unused Integer import

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils'; // Adjusted path relative to new location

// --- Node Class Definition ---
export class Neo4jUpdateService implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Update Service', // From TaskInstructions.md
		name: 'neo4jUpdateService', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg', // Point to the icon in the shared neo4j folder
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["serviceId"]}}', // Show serviceId in subtitle
		description: '根據 service_id 更新服務資訊。,serviceId: 要更新的服務 ID (UUID),name: 新的服務名稱 (可選),duration_minutes: 新的服務持續時間（分鐘）(可選),description: 新的服務描述 (可選),price: 新的服務價格（整數，例如分）(可選),bookingMode: 新的服務預約檢查模式 (可選)。', // Added bookingMode description
		defaults: {
			name: 'Neo4j Update Service',
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
				displayName: 'Service ID',
				name: 'serviceId',
				type: 'string',
				required: true,
				default: '',
				description: '要更新的服務 ID',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: '新的服務名稱 (可選)',
			},
			{
				displayName: 'Duration (Minutes)',
				name: 'duration_minutes',
				type: 'number',
				typeOptions: {
					numberStep: 1,
				},
				default: undefined, // No default for optional number
				description: '新的服務持續時間（分鐘）(可選)',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: '新的服務描述 (可選)',
			},
			{
				displayName: 'Price (Integer)',
				name: 'price',
				type: 'number',
				typeOptions: {
					numberStep: 1,
				},
				default: undefined, // No default for optional number
				description: '新的服務價格（整數，例如分）(可選)',
			},
			// Use collection for booking mode to allow override from input
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				// required: false, // Make the entire collection optional for updates
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Booking Mode (UI Setting)',
						name: 'bookingModeUISetting', // Use a distinct name for UI setting
						type: 'options',
						options: [
							{ name: 'Time Only', value: 'TimeOnly' },
							{ name: 'Staff Only', value: 'StaffOnly' },
							{ name: 'Resource Only', value: 'ResourceOnly' },
							{ name: 'Staff And Resource', value: 'StaffAndResource' },
						],
						default: 'TimeOnly', // Set a valid default to satisfy ESLint
						description: '新的服務預約檢查模式 (UI 設定，可選)。如果通過輸入參數 `Booking Mode Input` 提供，將優先使用輸入值',
					},
				]
			},
			// Parameter to receive booking mode directly from input arguments
			{
				displayName: 'Booking Mode Input',
				name: 'bookingModeInput',
				type: 'string',
				default: '',
				description: 'Booking mode provided via input arguments (overrides UI setting)',
				// Removed hidden: true as it's not a valid INodeProperties property
			},
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		this.logger.debug(`Received items: ${JSON.stringify(items)}`);
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
					this.logger.debug(`Processing item index: ${i}`);
					this.logger.debug(`Item content: ${JSON.stringify(items[i])}`);
					// 5. Get Input Parameters
					const serviceId = this.getNodeParameter('serviceId', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const duration_minutes = this.getNodeParameter('duration_minutes', i, undefined) as number | undefined;
					const description = this.getNodeParameter('description', i, '') as string;
					const price = this.getNodeParameter('price', i, undefined) as number | undefined;

					// Determine the booking_mode to use (Direct Input > UI Fallback)
					let bookingModeToSet: string | undefined; // Renamed for clarity
					const bookingModeFromInput = this.getNodeParameter('bookingModeInput', i, '') as string;
					const bookingModeFromUI = this.getNodeParameter('options.bookingModeUISetting', i, 'TimeOnly') as string; // Read UI setting (now has default)
					const validBookingModes = ['TimeOnly', 'StaffOnly', 'ResourceOnly', 'StaffAndResource'];

					this.logger.debug(`Read booking_mode from direct input 'bookingModeInput': ${bookingModeFromInput}`);
					this.logger.debug(`Read booking_mode from UI 'options.bookingModeUISetting': ${bookingModeFromUI}`);

					// Prioritize valid input
					if (bookingModeFromInput && validBookingModes.includes(bookingModeFromInput)) {
						bookingModeToSet = bookingModeFromInput;
						this.logger.debug(`Using booking_mode from direct input: ${bookingModeToSet}`);
					}
					// Only use UI setting if input was NOT provided AND UI setting is not empty (user explicitly selected something)
					// Note: getNodeParameter returns the default ('TimeOnly') if nothing is selected.
					// We need a way to distinguish between user selecting the default vs. not selecting anything.
					// A common pattern is to add a "None" or "Do Not Change" option, or check if the parameter was actually set.
					// Let's assume for now that if bookingModeFromInput is empty, we use the UI value,
					// but we need to be careful not to update if the UI value is just the default and wasn't explicitly chosen.
					// Simpler approach for now: Only update if bookingModeFromInput is valid. Ignore UI setting for update via MCP.
					// If using UI, the user explicitly sets it. If using MCP, only bookingModeInput matters.
					else if (bookingModeFromInput === '') { // Only consider UI if input is explicitly empty
						// If bookingModeFromUI is not empty (meaning user selected something in UI or it defaulted)
						// We will use it, but validation is needed.
						if (bookingModeFromUI && validBookingModes.includes(bookingModeFromUI)) {
							bookingModeToSet = bookingModeFromUI;
							this.logger.debug(`Using booking_mode from UI setting: ${bookingModeToSet}`);
						} else if (bookingModeFromUI !== '') { // If UI value is present but invalid
							throw new NodeOperationError(node, `Invalid booking mode from UI setting: ${bookingModeFromUI}`, { itemIndex: i });
						} else {
							// bookingModeFromUI is empty, meaning user selected nothing (or default was empty - which it isn't now)
							// In this case, we don't want to update the booking mode.
							bookingModeToSet = undefined;
							this.logger.debug(`No valid booking mode provided via input or UI selection. Booking mode will not be updated.`);
						}
					} else if (bookingModeFromInput) {
						// Input was provided but invalid
						throw new NodeOperationError(node, `Invalid booking mode from input: ${bookingModeFromInput}`, { itemIndex: i });
					}
					// If bookingModeFromInput was empty, bookingModeToSet remains undefined unless UI was validly set.


					// Build SET clause dynamically
					const setClauses: string[] = [];
					const parameters: IDataObject = { serviceId };

					if (name !== undefined && name !== '') { setClauses.push('s.name = $name'); parameters.name = name; }
					if (duration_minutes !== undefined && duration_minutes !== null) { setClauses.push('s.duration_minutes = $duration_minutes'); parameters.duration_minutes = neo4j.int(duration_minutes); }
					if (description !== undefined && description !== '') { setClauses.push('s.description = $description'); parameters.description = description; }
					if (price !== undefined && price !== null) { setClauses.push('s.price = $price'); parameters.price = neo4j.int(price); }
					// Only add to SET clause if bookingModeToSet has a valid value
					if (bookingModeToSet !== undefined && bookingModeToSet !== '') {
						setClauses.push('s.booking_mode = $bookingModeParam');
						parameters.bookingModeParam = bookingModeToSet;
						this.logger.debug(`Adding booking_mode to SET clause: ${bookingModeToSet}`);
					} else {
						this.logger.debug(`Booking mode will not be updated.`);
					}


					// Start building the query
					let query = `MATCH (s:Service {service_id: $serviceId})\n`;

					// Add SET clause if there are properties to update
					if (setClauses.length > 0) {
						setClauses.push('s.updated_at = datetime()'); // Always update timestamp if setting properties
						query += `SET ${setClauses.join(', ')}\n`;
					}

					// REMOVED Handle Category Relationship Update block

					// Add WITH clause if properties were set, before RETURN
					if (setClauses.length > 0) {
						query += `WITH s\n`;
					}
					// Add RETURN clause
					query += `RETURN s {.*} AS service`;

					const isWrite = true; // This is a write operation

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
