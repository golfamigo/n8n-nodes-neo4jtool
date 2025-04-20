// ============================================================================
// N8N Neo4j Node: Update Booking
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

// --- 引入時間處理工具函數 ---
import {
	toNeo4jDateTimeString,

	// 其他時間處理函數
	normalizeDateTime as _normalizeDateTime,
	normalizeTimeOnly as _normalizeTimeOnly,
	toNeo4jTimeString as _toNeo4jTimeString,
	addMinutesToDateTime as _addMinutesToDateTime,
	TIME_SETTINGS as _TIME_SETTINGS
} from '../neo4j/helpers/timeUtils';

// --- Node Class Definition ---
export class Neo4jUpdateBooking implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Update Booking', // From TaskInstructions.md
		name: 'neo4jUpdateBooking', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["bookingId"]}}', // Show bookingId
		description: '根據 booking_id 更新預約資訊（例如狀態、時間、備註）。', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Update Booking',
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
				displayName: 'Booking ID',
				name: 'bookingId',
				type: 'string',
				required: true,
				default: '',
				description: '要更新的預約 ID',
			},
			{
				displayName: 'Booking Time',
				name: 'bookingTime',
				type: 'string',
				default: '',
				description: '新的預約開始時間 (ISO 8601 格式, 需含時區) (可選)',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'string',
				default: '',
				description: '新的預約狀態 (例如 Confirmed, Cancelled, Completed) (可選)',
			},
			{
				displayName: 'Staff ID',
				name: 'staffId',
				type: 'string',
				default: '',
				description: '更新服務員工 ID (可選, 留空以移除)',
			},
			{
				displayName: 'Notes',
				name: 'notes',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: '新的預約備註 (可選)',
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
					const bookingId = this.getNodeParameter('bookingId', i, '') as string;
					const rawBookingTime = this.getNodeParameter('bookingTime', i, '') as string;
					const status = this.getNodeParameter('status', i, '') as string;
					const staffId = this.getNodeParameter('staffId', i, '') as string;
					const notes = this.getNodeParameter('notes', i, '') as string;

					// 處理並規範化預約時間 (如果有提供)
					let bookingTime: string | null = null;
					if (rawBookingTime !== undefined && rawBookingTime !== '') {
						bookingTime = toNeo4jDateTimeString(rawBookingTime);
						if (!bookingTime) {
							throw new NodeOperationError(node, `Invalid booking time format: ${rawBookingTime}. Please provide a valid ISO 8601 datetime.`, { itemIndex: i });
						}
					}

					// Build SET clause dynamically
					const setClauses: string[] = [];
					const parameters: IDataObject = { bookingId };

					if (bookingTime !== null) {
						setClauses.push('bk.booking_time = datetime($bookingTime)');
						parameters.bookingTime = bookingTime;
					}
					if (status !== undefined && status !== '') {
						setClauses.push('bk.status = $status');
						parameters.status = status;
					}
					if (notes !== undefined && notes !== '') {
						setClauses.push('bk.notes = $notes');
						parameters.notes = notes;
					}

					// Start building the query
					let query = `MATCH (bk:Booking {booking_id: $bookingId})\n`;

					// Add SET clause if there are properties to update
					if (setClauses.length > 0) {
						setClauses.push('bk.updated_at = datetime()'); // Always update timestamp if setting properties
						query += `SET ${setClauses.join(', ')}\n`;
					}

					// Handle Staff Relationship Update
					if (staffId !== undefined) {
						// Remove existing staff relationship first
						query += `WITH bk OPTIONAL MATCH (bk)-[r:SERVED_BY]->() DELETE r\n`;
						if (staffId !== '') {
							// If a new staffId is provided, match the staff and create the new relationship
							query += `WITH bk MATCH (st:Staff {staff_id: $staffId}) MERGE (bk)-[:SERVED_BY]->(st)\n`;
							parameters.staffId = staffId;
						}
						// If staffId is an empty string, we just removed the relationship.
					} else {
						// If staffId is undefined (not provided in input), we need WITH bk to pass it to RETURN
						if (setClauses.length > 0) { // Only add WITH if SET was applied
							query += `WITH bk\n`;
						}
					}

					// Add RETURN clause
					query += `RETURN bk {.*} AS booking`;

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
