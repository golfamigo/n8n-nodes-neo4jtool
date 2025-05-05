import type { Session } from 'neo4j-driver';
import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
// Removed unused neo4j import
import { runCypherQuery, convertNeo4jValueToJs } from '../utils';
import { isTimeBetween } from '../timeUtils'; // Import necessary time utils
import { DateTime } from 'luxon'; // Import luxon
import { checkTimeOnlyAvailability, TimeOnlyCheckParams } from './checkTimeOnly'; // Import TimeOnly check

// Re-use helper function from checkStaffOnly
function checkStaffAvailabilityRules(
	slotStart: DateTime,
	slotEnd: DateTime,
	availabilityRules: Array<{ type: string; start_time?: string; end_time?: string; date?: string }>,
	context: IExecuteFunctions,
): boolean {
	const slotStartTime = slotStart.toFormat('HH:mm:ss');
	const slotEndTime = slotEnd.toFormat('HH:mm:ss');
	const slotDate = slotStart.toISODate();

	let isAvailable = false;
	let hasBlockingException = false;
	let coveredBySchedule = false;
	let coveredByPositiveException = false;

	for (const rule of availabilityRules) {
		if (rule.type === 'EXCEPTION' && rule.date === slotDate) {
			// Check for blocking exception (handle potential undefined end_time)
			if (rule.start_time === '00:00:00' && rule.end_time && rule.end_time >= '23:59:00') {
				context.logger.debug(`[Staff Availability Check] Blocking exception found for date ${slotDate}`);
				hasBlockingException = true;
				break; // Full day block overrides everything
			} else if (rule.start_time && rule.end_time) {
				// Check if slot is within a positive exception window using improved isTimeBetween
				// that can correctly handle overnight ranges
				const startWithinException = isTimeBetween(slotStartTime, rule.start_time, rule.end_time, true);
				const endWithinException = isTimeBetween(slotEndTime, rule.start_time, rule.end_time, false);
				const endsAtClosing = slotEndTime === rule.end_time;

				if ((startWithinException && endWithinException) || (startWithinException && endsAtClosing)) {
					context.logger.debug(`[Staff Availability Check] Slot covered by positive exception: ${rule.start_time}-${rule.end_time}`);
					coveredByPositiveException = true;
				}
			}
		} else if (rule.type === 'SCHEDULE' && rule.start_time && rule.end_time) {
			// Check if slot is within a schedule window using improved isTimeBetween
			const startWithinSchedule = isTimeBetween(slotStartTime, rule.start_time, rule.end_time, true);
			const endWithinSchedule = isTimeBetween(slotEndTime, rule.start_time, rule.end_time, false);
			const endsAtClosing = slotEndTime === rule.end_time;

			if ((startWithinSchedule && endWithinSchedule) || (startWithinSchedule && endsAtClosing)) {
				context.logger.debug(`[Staff Availability Check] Slot covered by schedule: ${rule.start_time}-${rule.end_time}`);
				coveredBySchedule = true;
			}
		}
	}

	if (hasBlockingException) {
		isAvailable = false;
	} else {
		// Available if covered by a positive exception OR (covered by schedule AND no specific exception applies for this time)
		// Simplified: Available if covered by positive exception or schedule (as positive exception takes precedence if defined)
		isAvailable = coveredByPositiveException || coveredBySchedule;
	}

	context.logger.debug(`[Staff Availability Check] Final availability: ${isAvailable}`);
	return isAvailable;
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

export interface StaffAndResourceCheckParams {
	businessId: string;
	serviceId: string; // Needed to get duration
	staffId: string;
	resourceTypeId: string;
	resourceQuantity: number;
	bookingTime: string; // ISO String (already normalized expected)
	itemIndex: number;
	node: IExecuteFunctions; // To throw NodeOperationError correctly
	customerId?: string; // Optional for customer conflict check
	existingBookingId?: string; // Optional for excluding the current booking in update scenarios
}

export async function checkStaffAndResourceAvailability(
	session: Session,
	params: StaffAndResourceCheckParams,
	context: IExecuteFunctions,
): Promise<void> {
	context.logger.debug(`[StaffAndResource Check v2] Checking for staff: ${params.staffId}, resource type: ${params.resourceTypeId}, quantity: ${params.resourceQuantity} at time: ${params.bookingTime}`);

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
	// We need the duration later, so fetch it here first
	const serviceDurationQuery = `
        MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b:Business {business_id: $businessId})
        RETURN s.duration_minutes AS serviceDuration
    `;
	const serviceDurationParams: IDataObject = { serviceId: params.serviceId, businessId: params.businessId };
	const serviceDurationResults = await runCypherQuery.call(context, session, serviceDurationQuery, serviceDurationParams, false, params.itemIndex);
	if (serviceDurationResults.length === 0) {
		throw new NodeOperationError(params.node.getNode(), `Service ID ${params.serviceId} does not exist for Business ID ${params.businessId}`, { itemIndex: params.itemIndex });
	}
	const serviceDuration = convertNeo4jValueToJs(serviceDurationResults[0].json.serviceDuration);
	if (serviceDuration === null || typeof serviceDuration !== 'number' || serviceDuration <= 0) {
		throw new NodeOperationError(params.node.getNode(), `Invalid or missing service duration for Service ID ${params.serviceId}`, { itemIndex: params.itemIndex });
	}
	context.logger.debug(`[StaffAndResource Check v2] Service duration: ${serviceDuration} minutes`);

	// Now perform TimeOnly checks (excluding duration fetch)
	await checkTimeOnlyAvailability(session, timeOnlyParams, context); // This will re-fetch duration internally, slightly inefficient but okay for now. Could refactor checkTimeOnlyAvailability later.
	context.logger.debug('[StaffAndResource Check v2] TimeOnly checks passed.');


	// --- 2. Calculate Slot Times and Day (修改) ---
	// 獲取商家時區
	const businessTimezoneQuery = `
			MATCH (b:Business {business_id: $businessId})
			RETURN b.timezone AS timezone
	`;
	const businessTimezoneParams = { businessId: params.businessId };
	const businessTimezoneResults = await runCypherQuery.call(context, session, businessTimezoneQuery, businessTimezoneParams, false, params.itemIndex);
	const businessTimezone = businessTimezoneResults.length > 0 ?
			(businessTimezoneResults[0].json.timezone || 'UTC') : 'UTC';

	context.logger.debug(`[StaffAndResource Check] Business timezone: ${businessTimezone}`);

	// 原始時間解析
	const slotStartUTC = DateTime.fromISO(params.bookingTime);
	// 轉換為商家時區
	const businessTimezoneString = typeof businessTimezone === 'string' ? businessTimezone : 'UTC';
const slotStart = slotStartUTC.setZone(businessTimezoneString);
	const slotEnd = slotStart.plus({ minutes: serviceDuration });
	// 使用商家時區的時間計算星期幾和日期
	const slotDayOfWeek = slotStart.weekday;
	const slotDate = slotStart.toISODate();

	if (!slotStart.isValid || !slotEnd.isValid) {
			throw new NodeOperationError(params.node.getNode(), `Invalid booking time format: ${params.bookingTime}`, { itemIndex: params.itemIndex });
	}
	context.logger.debug(`[StaffAndResource Check] Slot in business timezone: ${slotStart.toISO()} - ${slotEnd.toISO()}, Day: ${slotDayOfWeek}, Date: ${slotDate}`);

	// --- 3. Perform StaffOnly Specific Checks ---
	// 3a. Get and Check Staff Availability Rules
	const staffAvailabilityQuery = `
        MATCH (st:Staff {staff_id: $staffId})-[:WORKS_AT]->(:Business {business_id: $businessId})
        WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(:Service {service_id: $serviceId}) }
        OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability)
        WHERE sa.type = 'SCHEDULE' AND sa.day_of_week = $slotDayOfWeek
           OR sa.type = 'EXCEPTION' AND sa.date = date($slotDate)
        RETURN sa.type AS type, toString(sa.start_time) AS start_time, toString(sa.end_time) AS end_time, toString(sa.date) AS date
    `;
	const staffAvailabilityParams = {
		staffId: params.staffId,
		businessId: params.businessId,
		serviceId: params.serviceId,
		slotDayOfWeek,
		slotDate,
	};
	const staffAvailabilityResults = await runCypherQuery.call(context, session, staffAvailabilityQuery, staffAvailabilityParams, false, params.itemIndex);
	if (staffAvailabilityResults.length === 0 && !(await runCypherQuery.call(context, session, `MATCH (st:Staff {staff_id: $staffId})-[:WORKS_AT]->(:Business {business_id: $businessId}) WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(:Service {service_id: $serviceId}) } RETURN count(st) > 0 AS exists`, { staffId: params.staffId, businessId: params.businessId, serviceId: params.serviceId }, false, params.itemIndex))[0]?.json.exists) {
		throw new NodeOperationError(params.node.getNode(), `Staff ${params.staffId} not found, does not belong to business ${params.businessId}, or cannot provide service ${params.serviceId}.`, { itemIndex: params.itemIndex });
	}
	const availabilityRules = staffAvailabilityResults.map(r => r.json as { type: string; start_time?: string; end_time?: string; date?: string });

	if (!checkStaffAvailabilityRules(slotStart, slotEnd, availabilityRules, context)) {
		throw new NodeOperationError(params.node.getNode(), `Staff ${params.staffId} is not available at ${params.bookingTime} based on schedule/exceptions.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug('[StaffAndResource Check v2] Staff availability rules check passed.');

	// 3b. Check Staff-Specific Booking Conflicts
	let staffConflictQuery = `
        MATCH (bk_staff:Booking)-[:SERVED_BY]->(:Staff {staff_id: $staffId})
        MATCH (bk_staff)-[:FOR_SERVICE]->(s_staff:Service)
        WHERE bk_staff.status <> 'Cancelled'
          AND bk_staff.booking_time < datetime($slotEnd)
          AND bk_staff.booking_time + duration({minutes: s_staff.duration_minutes}) > datetime($slotStart)
    `;

    // 如果提供了 existingBookingId，排除該預約
    if (params.existingBookingId) {
        staffConflictQuery += `
          AND bk_staff.booking_id <> $existingBookingId // Exclude the booking being updated
        `;
    }

    staffConflictQuery += `
        RETURN count(bk_staff) AS conflictCount
    `;
	// 添加可能的 existingBookingId 到參數中
	const staffConflictParams: IDataObject = {
		staffId: params.staffId,
		slotStart: slotStart.toISO(),
		slotEnd: slotEnd.toISO(),
	};

	// 如果提供了 existingBookingId，將其添加到查詢參數中
	if (params.existingBookingId) {
		staffConflictParams.existingBookingId = params.existingBookingId;
	}
	const staffConflictResults = await runCypherQuery.call(context, session, staffConflictQuery, staffConflictParams, false, params.itemIndex);
	const staffConflictCount = convertNeo4jValueToJs(staffConflictResults[0]?.json.conflictCount) || 0;

	if (staffConflictCount > 0) {
		throw new NodeOperationError(params.node.getNode(), `Staff ${params.staffId} has a conflicting booking at ${params.bookingTime}.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug('[StaffAndResource Check v2] Staff conflict check passed.');


	// --- 4. Perform ResourceOnly Specific Checks ---
	// 4a. Get Resource Type Capacity
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
	context.logger.debug(`[StaffAndResource Check v2] Resource Type ${params.resourceTypeId} total capacity: ${totalCapacity}`);

	// 4b. Calculate Used Resource Quantity in Slot
	// Use improved parameter preparation with validation
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

	let usedQuantityQuery = `
        MATCH (existing:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(:ResourceType {type_id: $resourceTypeId})
        MATCH (existing)-[:FOR_SERVICE]->(s_existing:Service)
        WHERE existing.status <> 'Cancelled'
          AND existing.booking_time < datetime($slotEnd)
          AND existing.booking_time + duration({minutes: s_existing.duration_minutes}) > datetime($slotStart)
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
	context.logger.debug(`[StaffAndResource Check v2] Resource Type ${params.resourceTypeId} currently used at slot: ${currentlyUsed}`);

	// 4c. Check Resource Capacity
	if (totalCapacity < currentlyUsed + params.resourceQuantity) {
		throw new NodeOperationError(params.node.getNode(), `Resource Type ${params.resourceTypeId} does not have enough capacity (${totalCapacity} total, ${currentlyUsed} used) for the required quantity (${params.resourceQuantity}) at ${params.bookingTime}.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug('[StaffAndResource Check v2] Resource capacity check passed.');


	// If all checks passed
	context.logger.debug(`[StaffAndResource Check v2] All checks passed for staff ${params.staffId} and resource ${params.resourceTypeId} at ${params.bookingTime}`);
}
