// ============================================================================
// N8N Neo4j Node: Update Booking (Refactored)
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
import neo4j, { Driver, Session, auth, Integer as Neo4jInteger } from 'neo4j-driver';

// --- Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
	prepareQueryParams, // Import prepareQueryParams
	convertNeo4jValueToJs, // Import convertNeo4jValueToJs for processing results
} from '../neo4j/helpers/utils';

// --- Time Utilities ---
import {
	toNeo4jDateTimeString,
} from '../neo4j/helpers/timeUtils';

// --- Availability Check Utilities ---
import {
	checkTimeOnlyAvailability,
	checkResourceOnlyAvailability,
	checkStaffOnlyAvailability,
	checkStaffAndResourceAvailability,
	type TimeOnlyCheckParams,
	type ResourceOnlyCheckParams,
	type StaffOnlyCheckParams,
	type StaffAndResourceCheckParams,
} from '../neo4j/helpers/availabilityChecks';

// --- Resource Utilities (Potentially needed for future resource updates) ---
// import { generateResourceUsageCreationQuery } from '../neo4j/helpers/resourceUtils';

// --- Node Class Definition ---
export class Neo4jUpdateBooking implements INodeType {

	description: INodeTypeDescription = {
		displayName: 'Neo4j Update Booking',
		name: 'neo4jUpdateBooking',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1.1, // Incremented version for significant change
		subtitle: '={{$parameter["bookingId"]}}',
		description: '根據 booking_id 更新預約資訊。如果更新 bookingTime 或 staffId，會先檢查新時段/員工的可用性。bookingId: 要更新的預約 ID (UUID)。其他欄位為可選更新項。', // Updated description
		defaults: {
			name: 'Neo4j Update Booking',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			// Properties remain the same
			{
				displayName: 'Booking ID',
				name: 'bookingId',
				type: 'string',
				required: true,
				default: '',
				description: '要更新的預約 ID (UUID)',
			},
			{
				displayName: 'Booking Time',
				name: 'bookingTime',
				type: 'string', // Kept as string for flexibility, validated internally
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
				description: '更新服務員工 ID (UUID) (可選, 留空表示移除員工)',
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
			// Consider adding resourceTypeId and resourceQuantity if needed in the future
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();

		try {
			// 1. Get Credentials & Establish Connection (Standard)
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured.', { itemIndex: 0 });
			}
			const uri = `${credentials.host}:${credentials.port}`;
			const user = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			try {
				driver = neo4j.driver(uri, auth.basic(user, password));
				await driver.verifyConnectivity();
				session = driver.session({ database });
				this.logger.debug(`Neo4j session opened for database: ${database}`);
			} catch (connectionError) {
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection.');
			}

			// 2. Loop Through Input Items
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				if (!session) {
					throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex });
				}
				try {
					// 3. Get Input Parameters
					const bookingId = this.getNodeParameter('bookingId', itemIndex, '') as string;
					const rawBookingTime = this.getNodeParameter('bookingTime', itemIndex, undefined) as string | undefined; // Use undefined for optional check
					const newStatus = this.getNodeParameter('status', itemIndex, undefined) as string | undefined;
					const rawNewStaffId = this.getNodeParameter('staffId', itemIndex, undefined) as string | undefined; // Undefined means "don't change staff"
					const newNotes = this.getNodeParameter('notes', itemIndex, undefined) as string | undefined;

					if (!bookingId) {
						throw new NodeOperationError(node, 'Booking ID is required.', { itemIndex });
					}

					// 4. Fetch Existing Booking Info & Related Service Details
					const fetchQuery = `
						MATCH (bk:Booking {booking_id: $bookingId})
						OPTIONAL MATCH (bk)-[:AT_BUSINESS]->(b:Business)
						OPTIONAL MATCH (bk)-[:FOR_SERVICE]->(s:Service)
						OPTIONAL MATCH (bk)-[:SERVED_BY]->(st:Staff)
						OPTIONAL MATCH (bk)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rt:ResourceType)
						RETURN
							bk.booking_time AS currentBookingTime,
							bk.status AS currentStatus,
							b.business_id AS businessId,
							s.service_id AS serviceId,
							s.booking_mode AS bookingMode,
							s.duration_minutes AS serviceDuration,
							st.staff_id AS currentStaffId,
							rt.type_id AS currentResourceTypeId,
							ru.quantity AS currentResourceQuantity,
							// Fetch customer ID needed for checks
							(MATCH (c:Customer)-[:MAKES]->(bk) RETURN c.customer_id)[0] AS customerId
						LIMIT 1
					`;
					const fetchParams = { bookingId };
					const fetchResult = await runCypherQuery.call(this, session, fetchQuery, fetchParams, false, itemIndex);

					if (fetchResult.length === 0) {
						throw new NodeOperationError(node, `Booking not found with ID: ${bookingId}`, { itemIndex });
					}

					const existingData = fetchResult[0].json;
					const businessId = existingData.businessId as string | null;
					const serviceId = existingData.serviceId as string | null;
					const bookingMode = existingData.bookingMode as string | null;
					const serviceDuration = convertNeo4jValueToJs(existingData.serviceDuration) as number | null; // Use converter for potential Neo4jInteger
					const currentStaffId = existingData.currentStaffId as string | null;
					const currentResourceTypeId = existingData.currentResourceTypeId as string | null;
					const currentResourceQuantity = convertNeo4jValueToJs(existingData.currentResourceQuantity) as number | null;
					const currentBookingTimeRaw = existingData.currentBookingTime; // Keep raw for normalization
					const customerId = existingData.customerId as string | null; // Get customer ID

					if (!businessId || !serviceId || !bookingMode || serviceDuration === null || !customerId) {
						throw new NodeOperationError(node, `Could not retrieve essential related data (Business, Service, Booking Mode, Duration, Customer) for Booking ID: ${bookingId}`, { itemIndex });
					}
					const currentBookingTime = toNeo4jDateTimeString(currentBookingTimeRaw);
					if (!currentBookingTime) {
						throw new NodeOperationError(node, `Invalid current booking time stored for Booking ID: ${bookingId}`, { itemIndex });
					}

					// 5. Determine New Values & Check if Availability Check is Needed
					let newBookingTime: string | null = null;
					let needsAvailabilityCheck = false;
					let finalStaffId: string | null = currentStaffId; // Start with current staff

					if (rawBookingTime !== undefined && rawBookingTime !== '') {
						newBookingTime = toNeo4jDateTimeString(rawBookingTime);
						if (!newBookingTime) {
							throw new NodeOperationError(node, `Invalid new booking time format: ${rawBookingTime}. Use ISO 8601.`, { itemIndex });
						}
						if (newBookingTime !== currentBookingTime) {
							needsAvailabilityCheck = true;
						}
					} else {
						newBookingTime = currentBookingTime; // If not changing, use current for check
					}

					if (rawNewStaffId !== undefined) { // If staffId parameter was provided
						finalStaffId = rawNewStaffId === '' ? null : rawNewStaffId; // Empty string means remove staff (null)
						if (finalStaffId !== currentStaffId) {
							needsAvailabilityCheck = true;
						}
					}
					// Note: finalStaffId now holds the intended staff ID *after* the update.

					// Prepare values for the check (use new if changed, otherwise current)
					const timeForCheck = needsAvailabilityCheck ? (newBookingTime ?? currentBookingTime) : currentBookingTime;
					const staffForCheck = needsAvailabilityCheck ? finalStaffId : currentStaffId;
					// Use current resource info as this node doesn't update resources yet
					const resourceTypeForCheck = currentResourceTypeId;
					const resourceQuantityForCheck = currentResourceQuantity ?? 1;


					// 6. Perform Availability Check (if needed)
					if (needsAvailabilityCheck) {
						this.logger.debug(`[Update Booking] Performing availability check for mode: ${bookingMode} (Time or Staff changed)`);
						switch (bookingMode) {
							case 'TimeOnly':
								const timeParams: TimeOnlyCheckParams = { businessId, serviceId, bookingTime: timeForCheck, itemIndex, node: this, customerId, existingBookingId: bookingId }; // Pass existingBookingId
								await checkTimeOnlyAvailability(session, timeParams, this);
								break;
							case 'ResourceOnly':
								if (!resourceTypeForCheck) throw new NodeOperationError(this.getNode(), `Cannot check availability: Resource Type ID missing for Booking ${bookingId} in ResourceOnly mode.`, { itemIndex });
								const resourceParams: ResourceOnlyCheckParams = { businessId, serviceId, resourceTypeId: resourceTypeForCheck, resourceQuantity: resourceQuantityForCheck, bookingTime: timeForCheck, itemIndex, node: this, customerId, existingBookingId: bookingId };
								await checkResourceOnlyAvailability(session, resourceParams, this);
								break;
							case 'StaffOnly':
								// Check if the *final* staff ID is required but null/empty
								if (!staffForCheck) throw new NodeOperationError(this.getNode(), 'Cannot update: Staff ID is required for StaffOnly service booking mode.', { itemIndex });
								const staffParams: StaffOnlyCheckParams = { businessId, serviceId, staffId: staffForCheck, bookingTime: timeForCheck, itemIndex, node: this, customerId, existingBookingId: bookingId };
								await checkStaffOnlyAvailability(session, staffParams, this);
								break;
							case 'StaffAndResource':
								if (!staffForCheck) throw new NodeOperationError(this.getNode(), 'Cannot update: Staff ID is required for StaffAndResource service booking mode.', { itemIndex });
								if (!resourceTypeForCheck) throw new NodeOperationError(this.getNode(), `Cannot check availability: Resource Type ID missing for Booking ${bookingId} in StaffAndResource mode.`, { itemIndex });
								const staffResourceParams: StaffAndResourceCheckParams = { businessId, serviceId, staffId: staffForCheck, resourceTypeId: resourceTypeForCheck, resourceQuantity: resourceQuantityForCheck, bookingTime: timeForCheck, itemIndex, node: this, customerId, existingBookingId: bookingId };
								await checkStaffAndResourceAvailability(session, staffResourceParams, this);
								break;
							default:
								throw new NodeOperationError(this.getNode(), `Unsupported booking mode: ${bookingMode}`, { itemIndex });
						}
						this.logger.debug(`[Update Booking] Availability check passed for potential update.`);
					} else {
						this.logger.debug(`[Update Booking] No time or staff change detected, skipping availability check.`);
					}

					// 7. Build Update Query
					const setClauses: string[] = [];
					const updateParamsRaw: IDataObject = { bookingId }; // Start with required ID

					// Add fields to SET clause only if they were provided and are different (or new time)
					if (rawBookingTime !== undefined && newBookingTime !== currentBookingTime) {
						setClauses.push('bk.booking_time = datetime($newBookingTime)');
						updateParamsRaw.newBookingTime = newBookingTime; // Use the validated & normalized time
					}
					if (newStatus !== undefined && newStatus !== '') {
						setClauses.push('bk.status = $newStatus');
						updateParamsRaw.newStatus = newStatus;
					}
					if (newNotes !== undefined) { // Allow setting notes to empty string
						setClauses.push('bk.notes = $newNotes');
						updateParamsRaw.newNotes = newNotes;
					}

					// Use prepareQueryParams helper
					const preparedUpdateParams = prepareQueryParams(updateParamsRaw);

					// Start building the query
					let updateQuery = `MATCH (bk:Booking {booking_id: $bookingId})\n`;

					// Add SET clause if there are properties to update
					if (setClauses.length > 0) {
						setClauses.push('bk.updated_at = datetime()'); // Add updated timestamp
						updateQuery += `SET ${setClauses.join(', ')}\n`;
						updateQuery += `WITH bk\n`; // Pass bk for potential staff update
					} else {
						// If no properties set, still need bk for staff update or return
						updateQuery += `WITH bk\n`;
					}

					// Handle Staff Relationship Update only if rawNewStaffId was provided
					if (rawNewStaffId !== undefined) {
						// Always remove existing relationship if staff parameter was touched
						updateQuery += `OPTIONAL MATCH (bk)-[r_old_staff:SERVED_BY]->() DELETE r_old_staff\n`;
						if (finalStaffId) { // If new staffId is not null/empty
							// Match the new staff and create the relationship
							updateQuery += `WITH bk MATCH (st_new:Staff {staff_id: $finalStaffId}) MERGE (bk)-[:SERVED_BY]->(st_new)\n`;
							preparedUpdateParams.finalStaffId = finalStaffId; // Add finalStaffId to params
						}
						updateQuery += `WITH bk\n`; // Pass bk after staff update
					}
					// Note: If rawNewStaffId was undefined, no staff changes happen.

					// Add RETURN clause
					updateQuery += `RETURN bk {.*,
										 business_id: (MATCH (bk)-[:AT_BUSINESS]->(b) RETURN b.business_id)[0],
										 service_id: (MATCH (bk)-[:FOR_SERVICE]->(s) RETURN s.service_id)[0],
										 customer_id: (MATCH (c)-[:MAKES]->(bk) RETURN c.customer_id)[0],
										 staff_id: (MATCH (bk)-[:SERVED_BY]->(st) RETURN st.staff_id)[0],
										 resource_type_id: (MATCH (bk)-[:USES_RESOURCE]->()-[:OF_TYPE]->(rt) RETURN rt.type_id)[0],
										 resource_quantity: (MATCH (bk)-[:USES_RESOURCE]->(ru) RETURN ru.quantity)[0]
										} AS booking`; // Return enriched booking data

					this.logger.debug(`[Update Booking] Executing update query with params: ${JSON.stringify(preparedUpdateParams)}`);
					const results = await runCypherQuery.call(this, session, updateQuery, preparedUpdateParams, true, itemIndex);

					// Process results (convert Neo4j types in the result)
                    const processedResults = results.map(record => ({
                        json: {
                            booking: convertNeo4jValueToJs(record.json.booking) // Convert the whole booking object
                        },
                        pairedItem: record.pairedItem,
                    }));

					returnData.push(...processedResults); // Add processed results


				} catch (itemError) {
					if (this.continueOnFail(itemError)) {
						const item = items[itemIndex];
						const parsedError = parseNeo4jError(node, itemError, 'update booking');
						returnData.push({
							json: { ...item.json, error: parsedError.message, error_details: parsedError.description },
							error: parsedError, // Attach the parsed error object
							pairedItem: { item: itemIndex }
						});
						continue;
					}
					// If not continuing on fail, parse and re-throw
                	if (itemError instanceof NodeOperationError) { throw itemError; }
					// Add itemIndex to the error before parsing if possible
					(itemError as any).itemIndex = itemIndex;
					throw parseNeo4jError(node, itemError); // Parse other errors
				}
			}

		} catch (error) {
			// Node-Level Error Handling
			if (this.continueOnFail()) {
				const message = error instanceof Error ? error.message : String(error);
				returnData.push({ json: { error: message } });
				return this.prepareOutputData(returnData); // Prepare data even on node-level failure if continuing
			}
			if (error instanceof NodeOperationError) { throw error; }
			throw parseNeo4jError(node, error); // Parse other errors
		} finally {
			// Close Session and Driver
			if (session) {
				try { await session.close(); this.logger.debug('Neo4j session closed.'); }
				catch (e) { this.logger.error('Error closing Neo4j session:', e); }
			}
			if (driver) {
				try { await driver.close(); this.logger.debug('Neo4j driver closed.'); }
				catch (e) { this.logger.error('Error closing Neo4j driver:', e); }
			}
		}

		return this.prepareOutputData(returnData); // Prepare final output
	}
}
