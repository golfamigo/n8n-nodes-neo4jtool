import type { Session } from 'neo4j-driver'; // Keep Session type if needed by runCypherQuery
import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
// Removed unused neo4j import
import { runCypherQuery, convertNeo4jValueToJs } from '../utils';
import { isTimeBetween } from '../timeUtils'; // Removed getIsoWeekday, kept isTimeBetween
import { DateTime } from 'luxon'; // Import luxon

export interface TimeOnlyCheckParams {
	businessId: string;
	serviceId: string; // Needed to get duration
	bookingTime: string; // ISO String (already normalized expected)
	itemIndex: number;
	node: IExecuteFunctions; // To throw NodeOperationError correctly
	customerId?: string; // Optional for customer conflict check
}

// Helper function to check if a slot falls within any business hour range
function checkBusinessHours(
	slotStart: DateTime,
	slotEnd: DateTime,
	businessHours: Array<{ start_time: string; end_time: string }>, // Expecting time strings like "HH:MM:SS" or "HH:MM"
	context: IExecuteFunctions,
): boolean {
	if (businessHours.length === 0) {
		context.logger.debug('[Business Hours Check] No business hours defined.');
		return false; // No hours defined means not available
	}
	const slotStartTime = slotStart.toFormat('HH:mm:ss');
	const slotEndTime = slotEnd.toFormat('HH:mm:ss');

	for (const range of businessHours) {
		// Check if slot is within business hours using improved isTimeBetween
		// that can correctly handle overnight ranges
		if (isTimeBetween(slotStartTime, range.start_time, range.end_time, true) && // start is within or equal
			isTimeBetween(slotEndTime, range.start_time, range.end_time, false)) { // end is strictly within
			context.logger.debug(`[Business Hours Check] Slot ${slotStartTime}-${slotEndTime} is within ${range.start_time}-${range.end_time}`);
			return true;
		}
		// Handle edge case where slot ends exactly at closing time
		if (isTimeBetween(slotStartTime, range.start_time, range.end_time, true) && slotEndTime === range.end_time) {
			context.logger.debug(`[Business Hours Check] Slot ${slotStartTime}-${slotEndTime} ends exactly at closing time ${range.end_time}`);
			return true;
		}
	}
	context.logger.debug(`[Business Hours Check] Slot ${slotStartTime}-${slotEndTime} is outside defined business hours.`);
	return false;
}


export async function checkTimeOnlyAvailability(
	session: Session,
	params: TimeOnlyCheckParams,
	context: IExecuteFunctions,
): Promise<void> {
	context.logger.debug(`[TimeOnly Check v2] Checking for time: ${params.bookingTime}`);

	// --- 1. Get Service Duration ---
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
	context.logger.debug(`[TimeOnly Check v2] Service duration: ${serviceDuration} minutes`);

	// --- 2. Calculate Slot Times and Day ---
	const slotStart = DateTime.fromISO(params.bookingTime);
	const slotEnd = slotStart.plus({ minutes: serviceDuration });
	const slotDayOfWeek = slotStart.weekday; // Luxon weekday: 1 (Mon) to 7 (Sun)

	if (!slotStart.isValid || !slotEnd.isValid) {
		throw new NodeOperationError(params.node.getNode(), `Invalid booking time format: ${params.bookingTime}`, { itemIndex: params.itemIndex });
	}
	context.logger.debug(`[TimeOnly Check v2] Slot: ${slotStart.toISO()} - ${slotEnd.toISO()}, Day: ${slotDayOfWeek}`);

	// --- 3. Get and Check Business Hours ---
	const businessHoursQuery = `
        MATCH (b:Business {business_id: $businessId})-[:HAS_HOURS]->(bh:BusinessHours {day_of_week: $slotDayOfWeek})
        RETURN toString(bh.start_time) AS start_time, toString(bh.end_time) AS end_time
    `;
	const businessHoursParams = { businessId: params.businessId, slotDayOfWeek };
	const businessHoursResults = await runCypherQuery.call(context, session, businessHoursQuery, businessHoursParams, false, params.itemIndex);
	const businessHours = businessHoursResults.map(r => r.json as { start_time: string; end_time: string });

	if (!checkBusinessHours(slotStart, slotEnd, businessHours, context)) {
		throw new NodeOperationError(params.node.getNode(), `Booking time ${params.bookingTime} is outside of business hours for day ${slotDayOfWeek}.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug('[TimeOnly Check v2] Business hours check passed.');

	// --- 4. Check General Booking Conflicts ---
	const conflictCheckQuery = `
        MATCH (b:Booking)-[:AT_BUSINESS]->(:Business {business_id: $businessId})
        MATCH (b)-[:FOR_SERVICE]->(s:Service) // Get the service of the existing booking
        WHERE b.status <> 'Cancelled'
          AND b.booking_time < datetime($slotEnd) // Existing booking starts before potential slot ends
          AND b.booking_time + duration({minutes: s.duration_minutes}) > datetime($slotStart) // Existing booking ends after potential slot starts
        RETURN count(b) AS conflictCount
    `;
	const conflictCheckParams = {
		businessId: params.businessId,
		slotStart: slotStart.toISO(),
		slotEnd: slotEnd.toISO(),
	};
	const conflictResults = await runCypherQuery.call(context, session, conflictCheckQuery, conflictCheckParams, false, params.itemIndex);
	const conflictCount = convertNeo4jValueToJs(conflictResults[0]?.json.conflictCount) || 0;

	if (conflictCount > 0) {
		throw new NodeOperationError(params.node.getNode(), `Booking time ${params.bookingTime} conflicts with an existing booking.`, { itemIndex: params.itemIndex });
	}
	context.logger.debug('[TimeOnly Check v2] General conflict check passed.');

	// --- 5. Check Customer Conflicts (Optional) ---
	if (params.customerId) {
		const customerConflictQuery = `
            MATCH (:Customer {customer_id: $customerId})-[:MAKES]->(bk_cust:Booking)
            MATCH (bk_cust)-[:FOR_SERVICE]->(s_cust:Service) // Get existing booking's service
            WHERE bk_cust.status <> 'Cancelled'
              AND bk_cust.booking_time < datetime($slotEnd) // Existing booking starts before potential slot ends
              AND bk_cust.booking_time + duration({minutes: s_cust.duration_minutes}) > datetime($slotStart) // Existing booking ends after potential slot starts
            RETURN count(bk_cust) AS conflictCount
        `;
		const customerConflictParams = {
			customerId: params.customerId,
			slotStart: slotStart.toISO(),
			slotEnd: slotEnd.toISO(),
		};
		const customerConflictResults = await runCypherQuery.call(context, session, customerConflictQuery, customerConflictParams, false, params.itemIndex);
		const customerConflictCount = convertNeo4jValueToJs(customerConflictResults[0]?.json.conflictCount) || 0;

		if (customerConflictCount > 0) {
			throw new NodeOperationError(params.node.getNode(), `Customer ${params.customerId} has a conflicting booking at ${params.bookingTime}.`, { itemIndex: params.itemIndex });
		}
		context.logger.debug('[TimeOnly Check v2] Customer conflict check passed.');
	}

	// If all checks passed
	context.logger.debug(`[TimeOnly Check v2] All checks passed for time ${params.bookingTime}`);
}
