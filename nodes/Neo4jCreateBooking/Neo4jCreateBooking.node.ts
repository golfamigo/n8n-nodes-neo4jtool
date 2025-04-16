// ============================================================================
// N8N Neo4j Node: Create Booking
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
export class Neo4jCreateBooking implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j: Create Booking', // From TaskInstructions.md
		name: 'neo4jCreateBooking', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for {{$parameter["customerId"]}} at {{$parameter["businessId"]}}', // Show customer and business
		description: '創建一個新的預約記錄並建立必要的關聯。', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Create Booking',
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
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				required: true,
				default: '',
				description: '進行預約的客戶 ID',
			},
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '預約的商家 ID',
			},
			{
				displayName: 'Service ID',
				name: 'serviceId',
				type: 'string',
				required: true,
				default: '',
				description: '預約的服務 ID',
			},
			{
				displayName: 'Booking Time',
				name: 'bookingTime',
				type: 'string', // Keep as string for ISO8601
				required: true,
				default: '',
				description: '預約開始時間 (ISO 8601 格式，需含時區)',
			},
			{
				displayName: 'Staff ID',
				name: 'staffId',
				type: 'string',
				default: '',
				description: '指定服務員工 ID (可選)',
			},
			{
				displayName: 'Notes',
				name: 'notes',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: '預約備註 (可選)',
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
					const customerId = this.getNodeParameter('customerId', i, '') as string;
					const businessId = this.getNodeParameter('businessId', i, '') as string;
					const serviceId = this.getNodeParameter('serviceId', i, '') as string;
					const bookingTime = this.getNodeParameter('bookingTime', i, '') as string;
					const staffId = this.getNodeParameter('staffId', i, '') as string;
					const notes = this.getNodeParameter('notes', i, '') as string;

					// 6. Define Specific Cypher Query & Parameters
					// Base query parts
					const matchClauses = [
						'MATCH (c:Customer {customer_id: $customerId})',
						'MATCH (b:Business {business_id: $businessId})',
						'MATCH (s:Service {service_id: $serviceId})',
					];
					const createBookingClause = `
						CREATE (bk:Booking {
							booking_id: randomUUID(),
							customer_id: $customerId,
							business_id: $businessId,
							service_id: $serviceId,
							booking_time: datetime($bookingTime), // Convert ISO string to Neo4j datetime
							status: 'Confirmed',
							notes: $notes,
							created_at: datetime()
						})
					`;
					const mergeRelationClauses = [
						'MERGE (c)-[:MAKES]->(bk)',
						'MERGE (bk)-[:AT_BUSINESS]->(b)',
						'MERGE (bk)-[:FOR_SERVICE]->(s)',
					];
					const returnClause = 'RETURN bk {.*} AS booking';

					const parameters: IDataObject = {
						customerId,
						businessId,
						serviceId,
						bookingTime,
						notes,
					};

					// Handle optional staff
					if (staffId !== undefined && staffId !== '') {
						matchClauses.push('MATCH (st:Staff {staff_id: $staffId})');
						mergeRelationClauses.push('MERGE (bk)-[:SERVED_BY]->(st)');
						parameters.staffId = staffId;
					}

					// Combine query parts
					const query = [
						...matchClauses,
						createBookingClause,
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
