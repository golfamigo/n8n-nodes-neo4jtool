import type { Session } from 'neo4j-driver';
import type { IExecuteFunctions, IDataObject } from 'n8n-workflow'; // Added IDataObject
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
	existingBookingId?: string; // Optional for excluding the current booking in update scenarios
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
		existingBookingId: params.existingBookingId, // 如果存在，將 existingBookingId 傳遞給 TimeOnly 檢查
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

	// 獲取商家時區
	const businessTimezoneQuery = `
			MATCH (b:Business {business_id: $businessId})
			RETURN b.timezone AS timezone
	`;
	const businessTimezoneParams = { businessId: params.businessId };
	const businessTimezoneResults = await runCypherQuery.call(context, session, businessTimezoneQuery, businessTimezoneParams, false, params.itemIndex);
	const businessTimezone = businessTimezoneResults.length > 0 ?
			(businessTimezoneResults[0].json.timezone || 'UTC') : 'UTC';

	context.logger.debug(`[ResourceOnly Check] Business timezone: ${businessTimezone}`);

	// 原始時間解析
	const slotStartUTC = DateTime.fromISO(params.bookingTime);
	// 轉換為商家時區
	const businessTimezoneString = typeof businessTimezone === 'string' ? businessTimezone : 'UTC';
const slotStart = slotStartUTC.setZone(businessTimezoneString);
	const slotEnd = slotStart.plus({ minutes: serviceDuration });

	if (!slotStart.isValid || !slotEnd.isValid) { // Should be caught by TimeOnly check, but double-check
			throw new NodeOperationError(params.node.getNode(), `Invalid booking time format: ${params.bookingTime}`, { itemIndex: params.itemIndex });
	}

	context.logger.debug(`[ResourceOnly Check] Slot in business timezone: ${slotStart.toISO()} - ${slotEnd.toISO()}`);

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
	// 使用改進的參數準備並進行驗證
	let queryParams: IDataObject;
	try {
		queryParams = prepareResourceAvailabilityParams(
			params.resourceTypeId,
			serviceDuration,
			params.resourceQuantity,
			slotStart,
			slotEnd
		);

		// 如果提供了 existingBookingId，將其添加到查詢參數中
		if (params.existingBookingId) {
			queryParams.existingBookingId = params.existingBookingId;
		}
	} catch (error) {
		throw new NodeOperationError(params.node.getNode(), `Parameter validation error: ${error instanceof Error ? error.message : 'Unknown error'}`, { itemIndex: params.itemIndex });
	}

	// 構建資源使用查詢，排除當前預約（如果提供了existingBookingId）
	let usedQuantityQuery = `
        MATCH (existing:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(:ResourceType {type_id: $resourceTypeId})
        MATCH (existing)-[:FOR_SERVICE]->(s_existing:Service) // Get existing booking's service
        WHERE existing.status <> 'Cancelled'
          AND existing.booking_time < datetime($slotEnd) // Existing booking starts before potential slot ends
          AND existing.booking_time + duration({minutes: s_existing.duration_minutes}) > datetime($slotStart) // Existing booking ends after potential slot starts
    `;

    // 如果提供了 existingBookingId，排除該預約
    if (params.existingBookingId) {
        usedQuantityQuery += `
          AND existing.booking_id <> $existingBookingId // Exclude the booking being updated
        `;
    }

    usedQuantityQuery += `
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
