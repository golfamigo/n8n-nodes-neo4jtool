import type { Session } from 'neo4j-driver';
import type { IExecuteFunctions } from 'n8n-workflow'; // Removed unused IDataObject
import { NodeOperationError } from 'n8n-workflow';
// Removed unused neo4j import
import { runCypherQuery, convertNeo4jValueToJs } from '../utils';
// Removed unused getIsoWeekday import
import { DateTime } from 'luxon'; // Import luxon
import { checkTimeOnlyAvailability, TimeOnlyCheckParams } from './checkTimeOnly'; // Import TimeOnly check

export interface ResourceOnlyCheckParams {
	businessId: string;
	serviceId: string; // Needed to get duration
	resourceTypeId: string;
	resourceQuantity: number;
	bookingTime: string; // ISO String (already normalized expected)
	itemIndex: number;
	node: IExecuteFunctions; // To throw NodeOperationError correctly
	customerId?: string; // Optional for customer conflict check
}

// Helper function to validate resource type ID
function isValidResourceTypeId(resourceTypeId: string | undefined | null): boolean {
	// Basic check for existence
	if (typeof resourceTypeId !== 'string' || resourceTypeId.trim() === '') {
		return false;
	}

	// Basic UUID format check (if system uses UUID)
	const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidPattern.test(resourceTypeId);
}

// Helper function to prepare query parameters with safety checks
function prepareResourceAvailabilityParams(
	resourceTypeId: string,
	serviceDuration: number,
	resourceQuantity: number,
	slotStart: DateTime,
	slotEnd: DateTime,
): { resourceTypeId: string; slotStart: string; slotEnd: string; } {
	// Add parameter validation
	if (serviceDuration <= 0 || serviceDuration > 1440) { // 1440 minutes = 24 hours
		throw new Error(`Service duration ${serviceDuration} is outside valid range (1-1440)`);
	}

	if (resourceQuantity <= 0 || resourceQuantity > 1000) { // Set reasonable upper limit
		throw new Error(`Resource quantity ${resourceQuantity} is outside valid range (1-1000)`);
	}

	if (!isValidResourceTypeId(resourceTypeId)) {
		throw new Error(`Invalid resource type ID: ${resourceTypeId}`);
	}

	// Check slotStart and slotEnd validity before calling toISO()
	if (!slotStart.isValid || !slotEnd.isValid) {
		throw new Error(`Internal error: Invalid DateTime object encountered during parameter preparation.`);
	}

	return {
		resourceTypeId,
		slotStart: slotStart.toISO()!, // Use non-null assertion operator
		slotEnd: slotEnd.toISO()!,   // Use non-null assertion operator
	};
}

export async function checkResourceOnlyAvailability(
	session: Session,
	params: ResourceOnlyCheckParams,
	context: IExecuteFunctions,
): Promise<void> {
	context.logger.debug(`[ResourceOnly Check v2] Checking for resource type: ${params.resourceTypeId}, quantity: ${params.resourceQuantity} at time: ${params.bookingTime}`);

	// --- 1. Perform TimeOnly Checks (Duration, Business Hours, General Conflicts, Customer Conflicts) ---
	const timeOnlyParams: TimeOnlyCheckParams = {
		businessId: params.businessId,
		serviceId: params.serviceId,
		bookingTime: params.bookingTime,
		itemIndex: params.itemIndex,
		node: params.node,
		customerId: params.customerId,
	};
	await checkTimeOnlyAvailability(session, timeOnlyParams, context);
	context.logger.debug('[ResourceOnly Check v2] TimeOnly checks passed.');

	// --- 2. Calculate Slot Times (again, needed for resource checks) ---
	// We need serviceDuration again, could potentially pass it from TimeOnly check if refactored
	const serviceDurationQuery = `
        MATCH (s:Service {service_id: $serviceId})
        RETURN s.duration_minutes AS serviceDuration
    `;
	const serviceDurationParams = { serviceId: params.serviceId };
	const serviceDurationResults = await runCypherQuery.call(context, session, serviceDurationQuery, serviceDurationParams, false, params.itemIndex);
	const serviceDuration = convertNeo4jValueToJs(serviceDurationResults[0]?.json.serviceDuration);
	if (serviceDuration === null || typeof serviceDuration !== 'number' || serviceDuration <= 0) {
		throw new NodeOperationError(params.node.getNode(), `Could not re-fetch service duration for Service ID ${params.serviceId}`, { itemIndex: params.itemIndex });
	}

	const slotStart = DateTime.fromISO(params.bookingTime);
	const slotEnd = slotStart.plus({ minutes: serviceDuration });

	if (!slotStart.isValid || !slotEnd.isValid) { // Should be caught by TimeOnly check, but double-check
		throw new NodeOperationError(params.node.getNode(), `Invalid booking time format: ${params.bookingTime}`, { itemIndex: params.itemIndex });
	}

	// --- 3. Get Resource Type Capacity ---
	const capacityQuery = `
        MATCH (rt:ResourceType {type_id: $resourceTypeId})
        WHERE rt.business_id = $businessId
          OR EXISTS((rt)-[:BELONGS_TO]->(:Business {business_id: $businessId}))
        RETURN rt.total_capacity AS totalCapacity
    `;
	const capacityParams = { resourceTypeId: params.resourceTypeId, businessId: params.businessId };
	const capacityResults = await runCypherQuery.call(context, session, capacityQuery, capacityParams, false, params.itemIndex);
	if (capacityResults.length === 0) {
		throw new NodeOperationError(params.node.getNode(), `Resource Type ${params.resourceTypeId} not found for Business ${params.businessId}.`, { itemIndex: params.itemIndex });
	}
	const totalCapacity = convertNeo4jValueToJs(capacityResults[0].json.totalCapacity);
	if (totalCapacity === null || typeof totalCapacity !== 'number') {
		throw new NodeOperationError(params.node.getNode(), `Invalid total capacity for Resource Type ${params.resourceTypeId}.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug(`[ResourceOnly Check v2] Resource Type ${params.resourceTypeId} total capacity: ${totalCapacity}`);

	// --- 4. Calculate Used Resource Quantity in Slot ---
	// Use improved parameter preparation with validation
	let queryParams;
	try {
		queryParams = prepareResourceAvailabilityParams(
			params.resourceTypeId,
			serviceDuration,
			params.resourceQuantity,
			slotStart,
			slotEnd
		);
	} catch (error) {
		throw new NodeOperationError(params.node.getNode(), `Parameter validation error: ${error instanceof Error ? error.message : 'Unknown error'}`, { itemIndex: params.itemIndex });
	}

	const usedQuantityQuery = `
        MATCH (existing:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(:ResourceType {type_id: $resourceTypeId})
        MATCH (existing)-[:FOR_SERVICE]->(s_existing:Service) // Get existing booking's service
        WHERE existing.status <> 'Cancelled'
          AND existing.booking_time < datetime($slotEnd) // Existing booking starts before potential slot ends
          AND existing.booking_time + duration({minutes: s_existing.duration_minutes}) > datetime($slotStart) // Existing booking ends after potential slot starts
        RETURN sum(coalesce(ru.quantity, 0)) AS currentlyUsed
    `;
	const usedQuantityResults = await runCypherQuery.call(context, session, usedQuantityQuery, queryParams, false, params.itemIndex);
	const currentlyUsed = convertNeo4jValueToJs(usedQuantityResults[0]?.json.currentlyUsed) || 0;
	context.logger.debug(`[ResourceOnly Check v2] Resource Type ${params.resourceTypeId} currently used at slot: ${currentlyUsed}`);

	// --- 5. Check Resource Capacity ---
	if (totalCapacity < currentlyUsed + params.resourceQuantity) {
		throw new NodeOperationError(params.node.getNode(), `Resource Type ${params.resourceTypeId} does not have enough capacity (${totalCapacity} total, ${currentlyUsed} used) for the required quantity (${params.resourceQuantity}) at ${params.bookingTime}.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug('[ResourceOnly Check v2] Resource capacity check passed.');

	// If all checks passed
	context.logger.debug(`[ResourceOnly Check v2] All checks passed for resource type ${params.resourceTypeId} at ${params.bookingTime}`);
}
