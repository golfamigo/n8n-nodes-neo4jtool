import type { Session } from 'neo4j-driver';
import type { IExecuteFunctions, IDataObject } from 'n8n-workflow'; // Added IDataObject
import { NodeOperationError } from 'n8n-workflow';
// Removed unused neo4j import
import { runCypherQuery, convertNeo4jValueToJs } from '../utils';
import { isTimeBetween } from '../timeUtils'; // Removed getIsoWeekday, kept isTimeBetween
import { DateTime } from 'luxon'; // Import luxon
import { checkTimeOnlyAvailability, TimeOnlyCheckParams } from './checkTimeOnly'; // Import TimeOnly check

export interface StaffOnlyCheckParams {
	businessId: string;
	serviceId: string; // Needed to get duration
	staffId: string;
	bookingTime: string; // ISO String (already normalized expected)
	itemIndex: number;
	node: IExecuteFunctions; // To throw NodeOperationError correctly
	customerId?: string; // Optional for customer conflict check
	existingBookingId?: string; // Optional for excluding the current booking in update scenarios
}

// Helper function to check staff availability rules
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


export async function checkStaffOnlyAvailability(
	session: Session,
	params: StaffOnlyCheckParams,
	context: IExecuteFunctions,
): Promise<void> {
	context.logger.debug(`[StaffOnly Check v2] Checking for staff: ${params.staffId} at time: ${params.bookingTime}`);

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
	context.logger.debug('[StaffOnly Check v2] TimeOnly checks passed.');

	// --- 2. Calculate Slot Times and Day (again, needed for staff checks) ---
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

	// 新增: 獲取商家時區
	const businessTimezoneQuery = `
			MATCH (b:Business {business_id: $businessId})
			RETURN b.timezone AS timezone
	`;
	const businessTimezoneParams = { businessId: params.businessId };
	const businessTimezoneResults = await runCypherQuery.call(context, session, businessTimezoneQuery, businessTimezoneParams, false, params.itemIndex);
	const businessTimezone = businessTimezoneResults.length > 0 ?
			(businessTimezoneResults[0].json.timezone || 'UTC') : 'UTC';

	context.logger.debug(`[StaffOnly Check] Business timezone: ${businessTimezone}`);

	// 原始時間解析
	const slotStartUTC = DateTime.fromISO(params.bookingTime);
	// 轉換為商家時區
	const businessTimezoneString = typeof businessTimezone === 'string' ? businessTimezone : 'UTC';
const slotStart = slotStartUTC.setZone(businessTimezoneString);
	const slotEnd = slotStart.plus({ minutes: serviceDuration });
	// 使用商家時區的時間計算星期幾和日期
	const slotDayOfWeek = slotStart.weekday;
	const slotDate = slotStart.toISODate();

	if (!slotStart.isValid || !slotEnd.isValid) { // Should be caught by TimeOnly check, but double-check
			throw new NodeOperationError(params.node.getNode(), `Invalid booking time format: ${params.bookingTime}`, { itemIndex: params.itemIndex });
	}

	context.logger.debug(`[StaffOnly Check] Slot in business timezone: ${slotStart.toISO()} - ${slotEnd.toISO()}, Day: ${slotDayOfWeek}, Date: ${slotDate}`);

	// --- 3. Get and Check Staff Availability Rules ---
	const staffAvailabilityQuery = `
        MATCH (st:Staff {staff_id: $staffId})-[:WORKS_AT]->(:Business {business_id: $businessId})
        WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(:Service {service_id: $serviceId}) } // Ensure staff can provide service
        OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability)
        WHERE sa.type = 'SCHEDULE' AND sa.day_of_week = $slotDayOfWeek
           OR sa.type = 'EXCEPTION' AND sa.date = date($slotDate)
        RETURN sa.type AS type, toString(sa.start_time) AS start_time, toString(sa.end_time) AS end_time, toString(sa.date) AS date
    `;
	const staffAvailabilityParams = {
		staffId: params.staffId,
		businessId: params.businessId, // Added businessId for context
		serviceId: params.serviceId, // Added serviceId for context
		slotDayOfWeek,
		slotDate,
	};
	const staffAvailabilityResults = await runCypherQuery.call(context, session, staffAvailabilityQuery, staffAvailabilityParams, false, params.itemIndex);
	// Check if staff exists and can provide service (query won't return rows otherwise)
	if (staffAvailabilityResults.length === 0 && !(await runCypherQuery.call(context, session, `MATCH (st:Staff {staff_id: $staffId})-[:WORKS_AT]->(:Business {business_id: $businessId}) WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(:Service {service_id: $serviceId}) } RETURN count(st) > 0 AS exists`, { staffId: params.staffId, businessId: params.businessId, serviceId: params.serviceId }, false, params.itemIndex))[0]?.json.exists) {
		throw new NodeOperationError(params.node.getNode(), `Staff ${params.staffId} not found, does not belong to business ${params.businessId}, or cannot provide service ${params.serviceId}.`, { itemIndex: params.itemIndex });
	}
	const availabilityRules = staffAvailabilityResults.map(r => r.json as { type: string; start_time?: string; end_time?: string; date?: string });

	if (!checkStaffAvailabilityRules(slotStart, slotEnd, availabilityRules, context)) {
		throw new NodeOperationError(params.node.getNode(), `Staff ${params.staffId} is not available at ${params.bookingTime} based on schedule/exceptions.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug('[StaffOnly Check v2] Staff availability rules check passed.');

	// --- 4. Check Staff-Specific Booking Conflicts ---
	// 構建員工衝突檢查查詢，排除當前預約（如果提供了existingBookingId）
	let staffConflictQuery = `
        MATCH (bk_staff:Booking)-[:SERVED_BY]->(:Staff {staff_id: $staffId})
        MATCH (bk_staff)-[:FOR_SERVICE]->(s_staff:Service) // Get existing booking's service
        WHERE bk_staff.status <> 'Cancelled'
          AND bk_staff.booking_time < datetime($slotEnd) // Existing booking starts before potential slot ends
          AND bk_staff.booking_time + duration({minutes: s_staff.duration_minutes}) > datetime($slotStart) // Existing booking ends after potential slot starts
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
	context.logger.debug('[StaffOnly Check v2] Staff conflict check passed.');

	// If all checks passed
	context.logger.debug(`[StaffOnly Check v2] All checks passed for staff ${params.staffId} at ${params.bookingTime}`);
}
