import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { type Session, type Driver } from 'neo4j-driver'; // Added Driver type
import {
	runCypherQuery,
	// Removed convertNeo4jProperties, generateBookingId, getNeo4jSession
	convertNeo4jValueToJs, // Added this import
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
		icon: 'file:neo4j.svg',
		group: ['transform'],
		version: 1,
		description: 'Creates a new booking record in Neo4j after checking availability based on business booking mode',
		defaults: {
			name: 'Neo4j Create Booking',
		},
		inputs: ['main'],
		outputs: ['main'],
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
				description: 'The unique ID of the staff member assigned (UUID). Required if business booking mode is StaffOnly or StaffAndResource.',
			},
			{
				displayName: 'Resource Type ID (Optional)',
				name: 'resourceTypeId',
				type: 'string',
				default: '',
				description: 'The unique ID of the resource type required (UUID). Required if business booking mode is ResourceOnly or StaffAndResource.',
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
		let driver: Driver | null = null; // Use Driver type
		let session: Session | null = null;

		try {
			// Standard session creation
			const credentials = await this.getCredentials('neo4jApi');
			const uri = credentials.uri as string;
			const user = credentials.user as string;
			const password = credentials.password as string;
			const database = credentials.database as string | undefined; // Optional database

			driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
			const sessionConfig: any = {}; // Use 'any' for flexibility or define a specific type
			if (database) {
				sessionConfig.database = database;
			}
			session = driver.session(sessionConfig);
			this.logger.debug('Neo4j session created.');


			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				// Ensure session is not null before proceeding inside the loop
				if (!session) {
					throw new NodeOperationError(this.getNode(), 'Failed to establish Neo4j session.', { itemIndex });
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

					// 1. Get Business Booking Mode
					const modeQuery = 'MATCH (b:Business {business_id: $businessId}) RETURN b.booking_mode AS bookingMode';
					const modeParams = { businessId };
					const modeResult = await runCypherQuery.call(this, session, modeQuery, modeParams, false, itemIndex);

					if (modeResult.length === 0) {
						throw new NodeOperationError(this.getNode(), `Business not found with ID: ${businessId}`, { itemIndex });
					}
					const bookingMode = modeResult[0].json.bookingMode as string;
					if (!bookingMode) {
						throw new NodeOperationError(this.getNode(), `Booking mode not set for business ID: ${businessId}`, { itemIndex });
					}
					this.logger.debug(`[Create Booking] Business ${businessId} booking mode: ${bookingMode}`);

					// 2. Perform Availability Check based on Booking Mode
					this.logger.debug(`[Create Booking] Performing availability check for mode: ${bookingMode}`);
					switch (bookingMode) {
						case 'TimeOnly':
							const timeParams: TimeOnlyCheckParams = { businessId, serviceId, bookingTime, itemIndex, node: this, customerId };
							await checkTimeOnlyAvailability(session, timeParams, this);
							break;
						case 'ResourceOnly':
							if (!resourceTypeId) throw new NodeOperationError(this.getNode(), 'Resource Type ID is required for ResourceOnly booking mode.', { itemIndex });
							const resourceParams: ResourceOnlyCheckParams = { businessId, serviceId, resourceTypeId, resourceQuantity, bookingTime, itemIndex, node: this };
							await checkResourceOnlyAvailability(session, resourceParams, this);
							break;
						case 'StaffOnly':
							if (!staffId) throw new NodeOperationError(this.getNode(), 'Staff ID is required for StaffOnly booking mode.', { itemIndex });
							const staffParams: StaffOnlyCheckParams = { businessId, serviceId, staffId, bookingTime, itemIndex, node: this, customerId };
							await checkStaffOnlyAvailability(session, staffParams, this);
							break;
						case 'StaffAndResource':
							if (!staffId) throw new NodeOperationError(this.getNode(), 'Staff ID is required for StaffAndResource booking mode.', { itemIndex });
							if (!resourceTypeId) throw new NodeOperationError(this.getNode(), 'Resource Type ID is required for StaffAndResource booking mode.', { itemIndex });
							const staffResourceParams: StaffAndResourceCheckParams = { businessId, serviceId, staffId, resourceTypeId, resourceQuantity, bookingTime, itemIndex, node: this, customerId };
							await checkStaffAndResourceAvailability(session, staffResourceParams, this);
							break;
						default:
							throw new NodeOperationError(this.getNode(), `Unsupported booking mode: ${bookingMode}`, { itemIndex });
					}
					this.logger.debug(`[Create Booking] Availability check passed for time: ${bookingTime}`);

					// 3. Create Booking if check passed
					// const bookingId = generateBookingId(); // Removed, will use apoc.create.uuid()
					const createParams: IDataObject = {
						// bookingId, // Removed
						customerId,
						businessId,
						serviceId,
						bookingTime, // Use normalized time
						status: 'Confirmed',
						notes,
						// Optional params based on mode (will be used in MERGE/CREATE clauses)
						staffId: (bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') ? staffId : null,
						resourceTypeId: (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? resourceTypeId : null,
						resourceQuantity: (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? neo4j.int(resourceQuantity) : null,
					};

					// Simplified Create Query - relies on prior checks for validity
					const createQuery = `
						// Find existing nodes
						MATCH (c:Customer {customer_id: $customerId})
						MATCH (b:Business {business_id: $businessId})
						MATCH (s:Service {service_id: $serviceId})

						// Create Booking node
						CREATE (bk:Booking {
							booking_id: $bookingId,
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

						// Create optional relationships based on parameters
						WITH bk, c, b, s
						${(bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') ? `
						OPTIONAL MATCH (st:Staff {staff_id: $staffId})
						WHERE st IS NOT NULL
						MERGE (bk)-[:SERVED_BY]->(st)
						` : ''}
						WITH bk, c, b, s
						${(bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? `
						OPTIONAL MATCH (rt:ResourceType {type_id: $resourceTypeId})
						WHERE rt IS NOT NULL AND $resourceQuantity IS NOT NULL
						CREATE (ru:ResourceUsage {
							usage_id: apoc.create.uuid(),
							booking_id: $bookingId,
							resource_type_id: $resourceTypeId,
							quantity: $resourceQuantity
						})
						MERGE (bk)-[:USES_RESOURCE]->(ru)
						MERGE (ru)-[:OF_TYPE]->(rt)
						` : ''}

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

						// Create optional relationships based on parameters
						WITH bk, c, b, s
						${(bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') ? `
						OPTIONAL MATCH (st:Staff {staff_id: $staffId})
						WHERE st IS NOT NULL
						MERGE (bk)-[:SERVED_BY]->(st)
						` : ''}
						WITH bk, c, b, s
						${(bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') ? `
						OPTIONAL MATCH (rt:ResourceType {type_id: $resourceTypeId})
						WHERE rt IS NOT NULL AND $resourceQuantity IS NOT NULL
						CREATE (ru:ResourceUsage {
							usage_id: apoc.create.uuid(),
							booking_id: bk.booking_id, // Use the generated booking_id
							resource_type_id: $resourceTypeId,
							quantity: $resourceQuantity
						})
						MERGE (bk)-[:USES_RESOURCE]->(ru)
						MERGE (ru)-[:OF_TYPE]->(rt)
						` : ''}

						// Return the created booking
						RETURN bk
					`;

					this.logger.debug('[Create Booking] Executing create query with params:', createParams);
					const results = await runCypherQuery.call(this, session, createQuery, createParams, true, itemIndex); // Read results
					this.logger.debug(`[Create Booking] Query executed, results count: ${results.length}`); // Fixed logger param

					// Process results
					results.forEach((record) => {
						// record.json contains the object representation of the Neo4j record
						// The query returns 'bk', so we access it via record.json.bk
						const bookingNodeData = record.json.bk as IDataObject | undefined; // Type assertion
						if (bookingNodeData && typeof bookingNodeData === 'object' && bookingNodeData.properties) {
							// convertNeo4jValueToJs was already applied by runCypherQuery/wrapNeo4jResult
							returnData.push({ json: bookingNodeData.properties, pairedItem: { item: itemIndex } });
						} else {
							// Handle case where booking node might not be returned as expected
							this.logger.warn(`[Create Booking] Booking node data not found or invalid in query result for item ${itemIndex}`, { recordData: record.json });
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
			if (this.continueOnFail()) {
				returnData.push({ json: { error: error.message } });
				return [returnData];
			}
			throw error;
		} finally {
			if (session) {
				try {
					await session.close();
					this.logger.debug('Neo4j session closed.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j session:', closeError);
				}
			}
			if (driver) {
				try {
					await driver.close();
					this.logger.debug('Neo4j driver closed.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j driver:', closeError);
				}
			}
		}

		return [returnData];
	}
}
