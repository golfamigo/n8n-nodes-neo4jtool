import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	ICredentialDataDecryptedObject, // Added for credentials
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { type Session, type Driver, auth } from 'neo4j-driver'; // Added Driver, auth
import {
	runCypherQuery,
	parseNeo4jError, // Added for error handling consistency
	// Removed convertNeo4jProperties, generateBookingId, getNeo4jSession
	// Removed unused import: convertNeo4jValueToJs
} from '../neo4j/helpers/utils';
import { toNeo4jDateTimeString } from '../neo4j/helpers/timeUtils';
import {
	checkTimeOnlyAvailability,
	checkResourceOnlyAvailability,
	checkStaffOnlyAvailability,
	checkStaffAndResourceAvailability,
	type TimeOnlyCheckParams,
	type ResourceOnlyCheckParams,
	type StaffOnlyCheckParams,
	type StaffAndResourceCheckParams,
} from '../neo4j/helpers/availabilityChecks'; // Import check functions

export class Neo4jCreateBooking implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Booking',
		name: 'neo4jCreateBooking',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['transform'],
		version: 1,
		description: 'Creates a new booking record in Neo4j after checking availability based on the service\'s booking mode', // Updated description
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
				description: 'The unique ID of the staff member assigned (UUID). Required if the service\'s booking mode is StaffOnly or StaffAndResource.', // Updated description
			},
			{
				displayName: 'Resource Type ID (Optional)',
				name: 'resourceTypeId',
				type: 'string',
				default: '',
				description: 'The unique ID of the resource type required (UUID). Required if the service\'s booking mode is ResourceOnly or StaffAndResource.', // Updated description
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
		let driver: Driver | undefined; // Use undefined initial state
		let session: Session | undefined; // Use undefined initial state
		const node = this.getNode(); // Get node reference for error handling

		try {
			// 1. Get Credentials
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;

			// 2. Validate Credentials
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured or missing required fields (host, port, username, password).', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`; // Combine host and port
			const username = credentials.username as string; // Use username
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j'; // Default to 'neo4j' if undefined

			// 3. Establish Neo4j Connection
			try {
				driver = neo4j.driver(uri, auth.basic(username, password)); // Use auth.basic
				await driver.verifyConnectivity(); // Verify connection
				this.logger.debug('Neo4j driver connected successfully.');
				session = driver.session({ database }); // Open session
				this.logger.debug(`Neo4j session opened for database: ${database}`);
			} catch (connectionError) {
				this.logger.error('Failed to connect to Neo4j or open session:', connectionError);
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection or session.');
			}


			// 4. Loop Through Input Items
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				// Ensure session is available inside the loop
				if (!session) {
					throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex });
				}
				try {
					const customerId = this.getNodeParameter('customerId', itemIndex, '') as string;
					const businessId = this.getNodeParameter('businessId', itemIndex, '') as string;
					const serviceId = this.getNodeParameter('serviceId', itemIndex, '') as string;
					const bookingTimeInput = this.getNodeParameter('bookingTime', itemIndex, '') as string;
					const staffId = this.getNodeParameter('staffId', itemIndex, '') as string | undefined;
					const resourceTypeId = this.getNodeParameter('resourceTypeId', itemIndex, '') as string | undefined;
					const resourceQuantity = this.getNodeParameter('resourceQuantity', itemIndex, 1) as number;
					const notes = this.getNodeParameter('notes', itemIndex, '') as string;

					// Validate required IDs
					if (!customerId || !businessId || !serviceId) {
						throw new NodeOperationError(this.getNode(), 'Customer ID, Business ID, and Service ID are required.', { itemIndex });
					}

					// Normalize booking time
					const bookingTime = toNeo4jDateTimeString(bookingTimeInput);
					if (!bookingTime) {
						throw new NodeOperationError(this.getNode(), `Invalid booking time format: ${bookingTimeInput}. Please use ISO 8601 format.`, { itemIndex });
					}

					// 1. Get Service Booking Mode (Replaces getting business booking mode)
					const serviceModeQuery = 'MATCH (s:Service {service_id: $serviceId}) RETURN s.booking_mode AS bookingMode';
					const serviceModeParams = { serviceId };
					const serviceModeResult = await runCypherQuery.call(this, session, serviceModeQuery, serviceModeParams, false, itemIndex);

					if (serviceModeResult.length === 0) {
						throw new NodeOperationError(this.getNode(), `Service not found with ID: ${serviceId}`, { itemIndex });
					}
					const bookingMode = serviceModeResult[0].json.bookingMode as string; // Use service's booking mode
					if (!bookingMode) {
						// This case should ideally not happen if bookingMode is required on Service creation
						throw new NodeOperationError(this.getNode(), `Booking mode not set for service ID: ${serviceId}`, { itemIndex });
					}
					this.logger.debug(`[Create Booking] Service ${serviceId} booking mode: ${bookingMode}`);


					// 2. Perform Availability Check based on Service's Booking Mode
					this.logger.debug(`[Create Booking] Performing availability check for mode: ${bookingMode}`);
					switch (bookingMode) {
						case 'TimeOnly':
							const timeParams: TimeOnlyCheckParams = { businessId, serviceId, bookingTime, itemIndex, node: this, customerId };
							await checkTimeOnlyAvailability(session, timeParams, this);
							break;
						case 'ResourceOnly':
							if (!resourceTypeId) throw new NodeOperationError(this.getNode(), 'Resource Type ID is required for ResourceOnly service booking mode.', { itemIndex }); // Updated error message
							const resourceParams: ResourceOnlyCheckParams = { businessId, serviceId, resourceTypeId, resourceQuantity, bookingTime, itemIndex, node: this, customerId }; // Added customerId
							await checkResourceOnlyAvailability(session, resourceParams, this);
							break;
						case 'StaffOnly':
							if (!staffId) throw new NodeOperationError(this.getNode(), 'Staff ID is required for StaffOnly service booking mode.', { itemIndex }); // Updated error message
							const staffParams: StaffOnlyCheckParams = { businessId, serviceId, staffId, bookingTime, itemIndex, node: this, customerId };
							await checkStaffOnlyAvailability(session, staffParams, this);
							break;
						case 'StaffAndResource':
							if (!staffId) throw new NodeOperationError(this.getNode(), 'Staff ID is required for StaffAndResource service booking mode.', { itemIndex }); // Updated error message
							if (!resourceTypeId) throw new NodeOperationError(this.getNode(), 'Resource Type ID is required for StaffAndResource service booking mode.', { itemIndex }); // Updated error message
							const staffResourceParams: StaffAndResourceCheckParams = { businessId, serviceId, staffId, resourceTypeId, resourceQuantity, bookingTime, itemIndex, node: this, customerId };
							await checkStaffAndResourceAvailability(session, staffResourceParams, this);
							break;
						default:
							throw new NodeOperationError(this.getNode(), `Unsupported booking mode: ${bookingMode}`, { itemIndex });
					}
					this.logger.debug(`[Create Booking] Availability check passed for time: ${bookingTime}`);

					// 3. Create Booking if check passed
					const createParams: IDataObject = {
						customerId,
						businessId,
						serviceId,
						bookingTime, // Use normalized time
						status: 'Confirmed',
						notes,
						// Optional params based on service's booking mode
						staffId: (bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') ? staffId : null,
						resourceTypeId: (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? resourceTypeId : null,
						resourceQuantity: (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? neo4j.int(resourceQuantity) : null,
					};

					// Create Query - adjusted optional relationship logic
					const createQuery = `
						// Find existing nodes
						MATCH (c:Customer {customer_id: $customerId})
						MATCH (b:Business {business_id: $businessId})
						MATCH (s:Service {service_id: $serviceId})

						// Create Booking node using apoc.create.uuid() for booking_id
						CREATE (bk:Booking {
							booking_id: apoc.create.uuid(), // Use apoc.create.uuid()
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

						// Create optional relationships based on service's booking mode
						WITH bk, c, b, s // Pass bk along
						${(bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') ? `
						OPTIONAL MATCH (st:Staff {staff_id: $staffId}) // staffId is validated earlier based on mode
						// WHERE st IS NOT NULL // Removed redundant check, should exist if required by mode
						MERGE (bk)-[:SERVED_BY]->(st)
						` : ''}
						WITH bk, c, b, s // Pass bk along
						${(bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? `
						OPTIONAL MATCH (rt:ResourceType {type_id: $resourceTypeId}) // resourceTypeId is validated earlier
						// WHERE rt IS NOT NULL AND $resourceQuantity IS NOT NULL // Removed redundant checks
						CREATE (ru:ResourceUsage {
							usage_id: apoc.create.uuid(),
							booking_id: bk.booking_id,
							resource_type_id: $resourceTypeId,
							quantity: $resourceQuantity
						})
						MERGE (bk)-[:USES_RESOURCE]->(ru)
						MERGE (ru)-[:OF_TYPE]->(rt)
						` : ''}

						// Return the created booking
						RETURN bk {.*} AS booking // Return properties directly
					`;

					this.logger.debug('[Create Booking] Executing create query with params:', createParams);
					const results = await runCypherQuery.call(this, session, createQuery, createParams, true, itemIndex); // Read results
					this.logger.debug(`[Create Booking] Query executed, results count: ${results.length}`); // Fixed logger param

					// Process results
					results.forEach((record) => {
						// record.json contains the object representation of the Neo4j record
						// The query returns 'booking', which contains the properties map {.*}
						const bookingProperties = record.json.booking as IDataObject | undefined; // Changed bk to booking
						// Ensure bookingProperties is an object
						if (bookingProperties && typeof bookingProperties === 'object') {
							// Assign the properties object directly to json
							returnData.push({ json: bookingProperties, pairedItem: { item: itemIndex } }); // Use bookingProperties directly
						} else {
							// Handle case where booking node might not be returned as expected
							this.logger.warn(`[Create Booking] Booking properties not found or invalid in query result for item ${itemIndex}`, { recordData: record.json });
							// Optionally throw an error or return an empty object
							returnData.push({ json: { error: 'Booking creation confirmed but node data retrieval failed.' }, pairedItem: { item: itemIndex } });
						}
					});

				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({ json: { error: error.message }, pairedItem: { item: itemIndex } });
						continue;
					}
					throw error;
				}
			}

		} catch (error) {
			// Handle Node-Level Errors
			if (this.continueOnFail()) {
				returnData.push({ json: { error: (error as Error).message } }); // Ensure error has message
				// Return data even on fail if continueOnFail is true
				// The return statement was missing here in the original logic from Neo4jCreateUser
				return this.prepareOutputData(returnData);
			}
			// If not continuing on fail, parse and throw the error
			if (error instanceof NodeOperationError) { throw error; } // Re-throw known errors
			throw parseNeo4jError(node, error); // Parse other errors
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

		return [returnData];
	}
}
