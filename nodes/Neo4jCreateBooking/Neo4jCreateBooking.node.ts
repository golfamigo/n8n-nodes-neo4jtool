import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { type Session, type Driver, auth } from 'neo4j-driver'; // Keep neo4j for Driver/Session types and auth
import {
	runCypherQuery,
	parseNeo4jError,
	prepareQueryParams, // Import prepareQueryParams
	// convertNeo4jValueToJs // No longer directly used here
} from '../neo4j/helpers/utils'; // Adjusted path assuming helpers are in ../neo4j/helpers/
import {
	normalizeDateTime,
  convertToTimezone,
  getBusinessTimezone,
  detectQueryTimezone,
} from '../neo4j/helpers/timeUtils'; // Adjusted path
import {
	generateResourceUsageCreationQuery, // Import resource usage creation helper
} from '../neo4j/helpers/resourceUtils'; // Adjusted path
import {
	checkTimeOnlyAvailability,
	checkResourceOnlyAvailability,
	checkStaffOnlyAvailability,
	checkStaffAndResourceAvailability,
	type TimeOnlyCheckParams,
	type ResourceOnlyCheckParams,
	type StaffOnlyCheckParams,
	type StaffAndResourceCheckParams,
} from '../neo4j/helpers/availabilityChecks'; // Adjusted path

export class Neo4jCreateBooking implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Booking',
		name: 'neo4jCreateBooking',
		icon: 'file:../neo4j/neo4j.svg', // Adjusted path
		group: ['transform'],
		version: 1,
		description: 'Creates a new booking record in Neo4j after checking availability based on the service\'s booking mode using helper functions', // Updated description
		defaults: {
			name: 'Neo4j Create Booking',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [
			{
				name: 'neo4jApi',
				required: true,
			},
		],
		properties: [
			// Properties remain the same as before...
			{
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				required: true,
				default: '',
				description: 'The unique ID of the customer making the booking (UUID)',
			},
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: 'The unique ID of the business where the booking is made (UUID)',
			},
			{
				displayName: 'Service ID',
				name: 'serviceId',
				type: 'string',
				required: true,
				default: '',
				description: 'The unique ID of the service being booked (UUID)',
			},
			{
				displayName: 'Booking Time',
				name: 'bookingTime',
				type: 'dateTime',
				required: true,
				default: '',
				description: 'The start date and time of the booking (ISO 8601 format with timezone)',
			},
			{
				displayName: 'Staff ID (Optional)',
				name: 'staffId',
				type: 'string',
				default: '',
				description: 'The unique ID of the staff member assigned (UUID). Required if the service\'s booking mode is StaffOnly or StaffAndResource.',
			},
			{
				displayName: 'Resource Type ID (Optional)',
				name: 'resourceTypeId',
				type: 'string',
				default: '',
				description: 'The unique ID of the resource type required (UUID). Required if the service\'s booking mode is ResourceOnly or StaffAndResource.',
			},
			{
				displayName: 'Resource Quantity (Optional)',
				name: 'resourceQuantity',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 1,
				description: 'The quantity of the resource type required. Defaults to 1. Used if Resource Type ID is provided.',
			},
			{
				displayName: 'Notes (Optional)',
				name: 'notes',
				type: 'string',
				default: '',
				typeOptions: {
					rows: 4,
				},
				description: 'Any additional notes for the booking',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();

		try {
			// 1. Get Credentials and Establish Connection (Same as before)
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured or missing required fields (host, port, username, password).', { itemIndex: 0 });
			}
			const uri = `${credentials.host}:${credentials.port}`;
			const username = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			try {
				driver = neo4j.driver(uri, auth.basic(username, password));
				await driver.verifyConnectivity();
				this.logger.debug('Neo4j driver connected successfully.');
				session = driver.session({ database });
				this.logger.debug(`Neo4j session opened for database: ${database}`);
			} catch (connectionError) {
				this.logger.error('Failed to connect to Neo4j or open session:', connectionError);
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection or session.');
			}

			// 4. Loop Through Input Items
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				if (!session) {
					throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex });
				}
				try {
					// Get Parameters (Same as before)
					const customerId = this.getNodeParameter('customerId', itemIndex, '') as string;
					const businessId = this.getNodeParameter('businessId', itemIndex, '') as string;
					const serviceId = this.getNodeParameter('serviceId', itemIndex, '') as string;
					const bookingTimeInput = this.getNodeParameter('bookingTime', itemIndex, '') as string;
					const staffId = this.getNodeParameter('staffId', itemIndex, '') as string | undefined;
					const resourceTypeId = this.getNodeParameter('resourceTypeId', itemIndex, '') as string | undefined;
					const resourceQuantity = this.getNodeParameter('resourceQuantity', itemIndex, 1) as number;
					const notes = this.getNodeParameter('notes', itemIndex, '') as string;

					// Validate required IDs (Same as before)
					if (!customerId || !businessId || !serviceId) {
						throw new NodeOperationError(this.getNode(), 'Customer ID, Business ID, and Service ID are required.', { itemIndex });
					}

					// 檢測預約時間中的時區信息
					const queryTimezone = detectQueryTimezone(bookingTimeInput);
					this.logger.debug(`[Create Booking] Detected timezone in booking time: ${queryTimezone}`);

					// 如果沒有時區信息，獲取商家時區
					let targetTimezone = queryTimezone;
					if (!targetTimezone && session) {
					targetTimezone = await getBusinessTimezone(session, businessId);
					this.logger.debug(`[Create Booking] Using business timezone: ${targetTimezone}`);
					}

					// 如果依然沒有時區信息，預設使用 UTC
					if (!targetTimezone) {
					targetTimezone = 'UTC';
					this.logger.debug('[Create Booking] No timezone info available, defaulting to UTC');
					}

					// 使用 normalizeDateTime 規範化時間格式
					const normalizedTime = normalizeDateTime(bookingTimeInput);
					this.logger.debug(`[Create Booking] Normalized booking time: ${normalizedTime}`);

					// 規範化時間格式但保留原始時區信息

					if (!normalizedTime) {
							throw new NodeOperationError(this.getNode(), `Invalid booking time format: ${bookingTimeInput}. Please use ISO 8601 format.`, { itemIndex });
					}
					const bookingTime = normalizedTime; // 使用規範化但未轉換時區的時間

					// 保存目標時區以供後續使用
					const originalTimezone = targetTimezone;

					// 1. Get Service Booking Mode using helper (Same as before)
					const serviceModeQuery = 'MATCH (s:Service {service_id: $serviceId}) RETURN s.booking_mode AS bookingMode';
					const serviceModeParams = { serviceId };
					const serviceModeResult = await runCypherQuery.call(this, session, serviceModeQuery, serviceModeParams, false, itemIndex);

					if (serviceModeResult.length === 0) {
						throw new NodeOperationError(this.getNode(), `Service not found with ID: ${serviceId}`, { itemIndex });
					}
					const bookingMode = serviceModeResult[0].json.bookingMode as string;
					if (!bookingMode) {
						throw new NodeOperationError(this.getNode(), `Booking mode not set for service ID: ${serviceId}`, { itemIndex });
					}
					this.logger.debug(`[Create Booking] Service ${serviceId} booking mode: ${bookingMode}`);

					// 2. Perform Availability Check using helpers (Same as before)
					this.logger.debug(`[Create Booking] Performing availability check for mode: ${bookingMode}`);
					switch (bookingMode) {
						case 'TimeOnly':
							const timeParams: TimeOnlyCheckParams = { businessId, serviceId, bookingTime: normalizedTime, itemIndex, node: this, customerId };
							await checkTimeOnlyAvailability(session, timeParams, this);
							break;
						case 'ResourceOnly':
							if (!resourceTypeId) throw new NodeOperationError(this.getNode(), 'Resource Type ID is required for ResourceOnly service booking mode.', { itemIndex });
							const resourceParams: ResourceOnlyCheckParams = { businessId, serviceId, resourceTypeId, resourceQuantity, bookingTime, itemIndex, node: this, customerId };
							await checkResourceOnlyAvailability(session, resourceParams, this);
							break;
						case 'StaffOnly':
							if (!staffId) throw new NodeOperationError(this.getNode(), 'Staff ID is required for StaffOnly service booking mode.', { itemIndex });
							const staffParams: StaffOnlyCheckParams = { businessId, serviceId, staffId, bookingTime, itemIndex, node: this, customerId };
							await checkStaffOnlyAvailability(session, staffParams, this);
							break;
						case 'StaffAndResource':
							if (!staffId) throw new NodeOperationError(this.getNode(), 'Staff ID is required for StaffAndResource service booking mode.', { itemIndex });
							if (!resourceTypeId) throw new NodeOperationError(this.getNode(), 'Resource Type ID is required for StaffAndResource service booking mode.', { itemIndex });
							const staffResourceParams: StaffAndResourceCheckParams = { businessId, serviceId, staffId, resourceTypeId, resourceQuantity, bookingTime, itemIndex, node: this, customerId };
							await checkStaffAndResourceAvailability(session, staffResourceParams, this);
							break;
						default:
							throw new NodeOperationError(this.getNode(), `Unsupported booking mode: ${bookingMode}`, { itemIndex });
					}
					this.logger.debug(`[Create Booking] Availability check passed for time: ${bookingTime}`);

					// 3. Create Booking if check passed
					// Prepare parameters object WITHOUT manual neo4j.int()
					const createParamsRaw: IDataObject = {
						customerId,
						businessId,
						serviceId,
						bookingTime,
						status: 'Confirmed',
						notes,
						staffId: (bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') ? staffId : null,
						resourceTypeId: (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? resourceTypeId : null,
						// Pass resourceQuantity as a standard number; prepareQueryParams will handle it
						resourceQuantity: (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? resourceQuantity : null,
					};

					// Use prepareQueryParams helper
					const preparedCreateParams = prepareQueryParams(createParamsRaw);

					// Generate resource usage part using helper function
					const resourceUsageCypher = (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource')
						? generateResourceUsageCreationQuery(
							'bk',                 // Variable name for the booking node in the main query
							'$resourceTypeId',    // Parameter name expected by the main query
							'$resourceQuantity',  // Parameter name expected by the main query
							'$businessId',        // Parameter name expected by the main query
							false                 // Do not add 'WITH bk' inside the helper block
						)
						: '';

					// Construct the final query using the resource helper
					const createQuery = `
						// Find existing nodes
						MATCH (c:Customer {customer_id: $customerId})
						MATCH (b:Business {business_id: $businessId})
						MATCH (s:Service {service_id: $serviceId})

						// Create Booking node
						CREATE (bk:Booking {
							booking_id: apoc.create.uuid(),
							customer_id: $customerId,
							business_id: $businessId,
							service_id: $serviceId,
							booking_time: datetime($bookingTime),
							status: $status,
							notes: $notes,
							created_at: datetime()
						})

						// Create base relationships
						MERGE (c)-[:MAKES]->(bk)
						MERGE (bk)-[:AT_BUSINESS]->(b)
						MERGE (bk)-[:FOR_SERVICE]->(s)

						// Optionally link Staff
						WITH bk, c, b, s // Pass bk along
						${(bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') ? `
						OPTIONAL MATCH (st:Staff {staff_id: $staffId})
						MERGE (bk)-[:SERVED_BY]->(st)
						` : ''}

						// Optionally create ResourceUsage using the generated Cypher
						WITH bk, c, b, s // Pass bk along again
						${resourceUsageCypher} // Inject the generated resource usage Cypher block

						// Return the created booking
						// Ensure 'bk' is the final variable before RETURN if resourceUsageCypher was added
						// If resourceUsageCypher is empty, the last WITH carries bk. If it's not empty,
						// the generateResourceUsageCreationQuery with withBookingAfter=false doesn't add a final WITH bk,
						// so we need one if the block was added. Let's add it unconditionally before RETURN for clarity.
						WITH bk
						RETURN bk {.*} AS booking
					`;

					this.logger.debug('[Create Booking] Executing create query with prepared params:', preparedCreateParams);
					// Use preparedCreateParams in runCypherQuery
					const results = await runCypherQuery.call(this, session, createQuery, preparedCreateParams, true, itemIndex);
					this.logger.debug(`[Create Booking] Query executed, results count: ${results.length}`);

					// Process results and convert time zones
					results.forEach((record) => {
						const bookingProperties = record.json.booking as IDataObject | undefined;
						if (bookingProperties && typeof bookingProperties === 'object') {
								// 如果存在預約時間，將其從 UTC 轉換回目標時區
								if (bookingProperties.booking_time && originalTimezone) {
										const utcBookingTime = bookingProperties.booking_time as string;
										bookingProperties.booking_time = convertToTimezone(utcBookingTime, originalTimezone);

										// 添加時區信息到結果
										bookingProperties.timezone = originalTimezone;

										this.logger.debug(`[Create Booking] Converted booking time from UTC to ${originalTimezone}: ${bookingProperties.booking_time}`);
								}

								returnData.push({ json: bookingProperties, pairedItem: { item: itemIndex } });
						} else {
								this.logger.warn(`[Create Booking] Booking properties not found or invalid in query result for item ${itemIndex}`, { recordData: record.json });
								returnData.push({ json: { error: 'Booking creation confirmed but node data retrieval failed.' }, pairedItem: { item: itemIndex } });
						}
					});

				} catch (error) {
					// Item-level error handling (Same as before)
					if (this.continueOnFail()) {
						// Ensure error is an instance of Error to access message
						const message = error instanceof Error ? error.message : String(error);
						returnData.push({ json: { error: message }, pairedItem: { item: itemIndex } });
						continue;
					}
					// If not continuing on fail, parse and re-throw
                	if (error instanceof NodeOperationError) { throw error; }
					// Add itemIndex to the error before parsing if possible
					(error as any).itemIndex = itemIndex;
					throw parseNeo4jError(node, error); // Parse other errors
				}
			}

		} catch (error) {
			// Node-Level Error Handling (Same as before)
			if (this.continueOnFail()) {
				const message = error instanceof Error ? error.message : String(error);
				returnData.push({ json: { error: message } });
				return this.prepareOutputData(returnData);
			}
			if (error instanceof NodeOperationError) { throw error; }
			throw parseNeo4jError(node, error);
		} finally {
			// Close Session and Driver (Same as before)
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

		return [returnData]; // Return as INodeExecutionData[][]
	}
}
