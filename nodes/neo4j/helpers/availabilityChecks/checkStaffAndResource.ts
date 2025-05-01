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
			if (rule.start_time === '00:00:00' && rule.end_time && rule.end_time >= '23:59:00') {
				context.logger.debug(`[Staff Availability Check] Blocking exception found for date ${slotDate}`);
				hasBlockingException = true;
				break;
			} else if (rule.start_time && rule.end_time) {
				if (isTimeBetween(slotStartTime, rule.start_time, rule.end_time, true) &&
					isTimeBetween(slotEndTime, rule.start_time, rule.end_time, false) ||
					(isTimeBetween(slotStartTime, rule.start_time, rule.end_time, true) && slotEndTime === rule.end_time)) {
					context.logger.debug(`[Staff Availability Check] Slot covered by positive exception: ${rule.start_time}-${rule.end_time}`);
					coveredByPositiveException = true;
				}
			}
		} else if (rule.type === 'SCHEDULE' && rule.start_time && rule.end_time) {
			if (isTimeBetween(slotStartTime, rule.start_time, rule.end_time, true) &&
				isTimeBetween(slotEndTime, rule.start_time, rule.end_time, false) ||
				(isTimeBetween(slotStartTime, rule.start_time, rule.end_time, true) && slotEndTime === rule.end_time)) {
				context.logger.debug(`[Staff Availability Check] Slot covered by schedule: ${rule.start_time}-${rule.end_time}`);
				coveredBySchedule = true;
			}
		}
	}

	if (hasBlockingException) {
		isAvailable = false;
	} else {
		isAvailable = coveredByPositiveException || coveredBySchedule;
	}

	context.logger.debug(`[Staff Availability Check] Final availability: ${isAvailable}`);
	return isAvailable;
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


	// --- 2. Calculate Slot Times and Day (needed for specific checks) ---
	const slotStart = DateTime.fromISO(params.bookingTime);
	const slotEnd = slotStart.plus({ minutes: serviceDuration });
	const slotDayOfWeek = slotStart.weekday;
	const slotDate = slotStart.toISODate();

	if (!slotStart.isValid || !slotEnd.isValid) {
		throw new NodeOperationError(params.node.getNode(), `Invalid booking time format: ${params.bookingTime}`, { itemIndex: params.itemIndex });
	}

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
	const staffConflictQuery = `
        MATCH (bk_staff:Booking)-[:SERVED_BY]->(:Staff {staff_id: $staffId})
        MATCH (bk_staff)-[:FOR_SERVICE]->(s_staff:Service)
        WHERE bk_staff.status <> 'Cancelled'
          AND bk_staff.booking_time < datetime($slotEnd)
          AND bk_staff.booking_time + duration({minutes: s_staff.duration_minutes}) > datetime($slotStart)
        RETURN count(bk_staff) AS conflictCount
    `;
	const staffConflictParams = {
		staffId: params.staffId,
		slotStart: slotStart.toISO(),
		slotEnd: slotEnd.toISO(),
	};
	const staffConflictResults = await runCypherQuery.call(context, session, staffConflictQuery, staffConflictParams, false, params.itemIndex);
	const staffConflictCount = convertNeo4jValueToJs(staffConflictResults[0]?.json.conflictCount) || 0;

	if (staffConflictCount > 0) {
		throw new NodeOperationError(params.node.getNode(), `Staff ${params.staffId} has a conflicting booking at ${params.bookingTime}.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug('[StaffAndResource Check v2] Staff conflict check passed.');


	// --- 4. Perform ResourceOnly Specific Checks ---
	// 4a. Get Resource Type Capacity
	const capacityQuery = `
        MATCH (rt:ResourceType {type_id: $resourceTypeId, business_id: $businessId})
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
	const usedQuantityQuery = `
        MATCH (existing:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(:ResourceType {type_id: $resourceTypeId})
        MATCH (existing)-[:FOR_SERVICE]->(s_existing:Service)
        WHERE existing.status <> 'Cancelled'
          AND existing.booking_time < datetime($slotEnd)
          AND existing.booking_time + duration({minutes: s_existing.duration_minutes}) > datetime($slotStart)
        RETURN sum(coalesce(ru.quantity, 0)) AS currentlyUsed
    `;
	const usedQuantityParams = {
		resourceTypeId: params.resourceTypeId,
		slotStart: slotStart.toISO(),
		slotEnd: slotEnd.toISO(),
	};
	const usedQuantityResults = await runCypherQuery.call(context, session, usedQuantityQuery, usedQuantityParams, false, params.itemIndex);
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
