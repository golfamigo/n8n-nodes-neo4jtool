import type { Session } from 'neo4j-driver';
import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j from 'neo4j-driver';
import { runCypherQuery, convertNeo4jValueToJs } from '../utils';
import { getIsoWeekday } from '../timeUtils'; // Import necessary time utils

export interface StaffOnlyCheckParams {
    businessId: string;
    serviceId: string; // Needed to get duration
    staffId: string;
    bookingTime: string; // ISO String (already normalized expected)
    itemIndex: number;
    node: IExecuteFunctions; // To throw NodeOperationError correctly
    customerId?: string; // Optional for customer conflict check
}

export async function checkStaffOnlyAvailability(
    session: Session,
    params: StaffOnlyCheckParams,
    context: IExecuteFunctions,
): Promise<void> {
    context.logger.debug(`[StaffOnly Check] Checking for staff: ${params.staffId} at time: ${params.bookingTime}`);

    // 1. Get Service Duration
    const serviceCheckQuery = `
        MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b:Business {business_id: $businessId})
        RETURN s.duration_minutes AS serviceDuration
    `;
    const serviceParams: IDataObject = { serviceId: params.serviceId, businessId: params.businessId };
    const serviceResults = await runCypherQuery.call(context, session, serviceCheckQuery, serviceParams, false, params.itemIndex);
    if (serviceResults.length === 0) {
        throw new NodeOperationError(params.node.getNode(), `Service ID ${params.serviceId} does not exist for Business ID ${params.businessId}`, { itemIndex: params.itemIndex });
    }
    const serviceDuration = convertNeo4jValueToJs(serviceResults[0].json.serviceDuration);
    if (serviceDuration === null || typeof serviceDuration !== 'number' || serviceDuration <= 0) {
        throw new NodeOperationError(params.node.getNode(), `Invalid or missing service duration for Service ID ${params.serviceId}`, { itemIndex: params.itemIndex });
    }
    context.logger.debug(`[StaffOnly Check] Service duration: ${serviceDuration} minutes`);

    // Calculate day of week using helper function
    const slotDayOfWeek = getIsoWeekday(params.bookingTime);
    if (slotDayOfWeek === null) {
         throw new NodeOperationError(params.node.getNode(), `Could not determine day of week for booking time ${params.bookingTime}.`, { itemIndex: params.itemIndex });
    }
     context.logger.debug(`[StaffOnly Check] Calculated day of week: ${slotDayOfWeek}`);

    // 2. Perform combined availability check in one query (Revised Logic v3)
    const availabilityCheckQuery = `
        // Input parameters
        WITH datetime($bookingTime) AS slotStart,
             duration({minutes: $serviceDuration}) AS serviceDuration
        WITH slotStart, slotStart + serviceDuration AS slotEnd, date(slotStart) AS slotDate, $slotDayOfWeek AS slotDayOfWeek, serviceDuration, $serviceDuration AS durationMinutesVal

        // Match required entities
        MATCH (b:Business {business_id: $businessId})
        MATCH (st:Staff {staff_id: $requiredStaffId})-[:WORKS_AT]->(b)
        MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)
        WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) } // Ensure staff can provide service

        // Check 1: Business Hours
        WITH b, st, s, slotStart, slotEnd, serviceDuration, slotDate, slotDayOfWeek, durationMinutesVal
        MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
        WHERE bh.day_of_week = slotDayOfWeek
        WITH b, st, s, slotStart, slotEnd, serviceDuration, slotDate, slotDayOfWeek, durationMinutesVal, collect([time(bh.start_time), time(bh.end_time)]) AS businessHourRanges
        WHERE size(businessHourRanges) > 0 AND any(range IN businessHourRanges WHERE range[0] <= time(slotStart) AND range[1] >= time(slotEnd))

        // Check 2: Staff Availability (Revised Logic v3)
        WITH b, st, s, slotStart, slotEnd, serviceDuration, slotDate, slotDayOfWeek, durationMinutesVal
        OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(sched:StaffAvailability {type: 'SCHEDULE', day_of_week: slotDayOfWeek})
        OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(exc:StaffAvailability {type: 'EXCEPTION', date: slotDate})
        WITH b, st, s, slotStart, slotEnd, serviceDuration, slotDate, slotDayOfWeek, durationMinutesVal, sched, exc,
             (exc IS NOT NULL AND time(exc.start_time) <= time(slotStart) AND time(exc.end_time) >= time(slotEnd)) // Covered by positive exception
             OR
             (sched IS NOT NULL AND time(sched.start_time) <= time(slotStart) AND time(sched.end_time) >= time(slotEnd)) // Covered by schedule
             AS isCoveredByWindow
        WITH b, st, s, slotStart, slotEnd, serviceDuration, slotDate, slotDayOfWeek, durationMinutesVal, isCoveredByWindow,
             EXISTS {
                 MATCH (st)-[:HAS_AVAILABILITY]->(blockingExc:StaffAvailability {type: 'EXCEPTION', date: slotDate})
                 WHERE (time(blockingExc.start_time) = time({hour: 0, minute: 0}) AND time(blockingExc.end_time) >= time({hour: 23, minute: 59}))
                    OR (time(blockingExc.start_time) < time(slotEnd) AND time(blockingExc.end_time) > time(slotStart))
             } AS isBlockedByException
        WHERE isCoveredByWindow AND NOT isBlockedByException

        // Check 3: Staff Booking Conflicts
        WITH b, st, s, slotStart, slotEnd, serviceDuration, durationMinutesVal
        WHERE NOT EXISTS {
            MATCH (bk_staff:Booking)-[:SERVED_BY]->(st)
            WHERE bk_staff.status <> 'Cancelled'
              AND bk_staff.booking_time < slotEnd
              AND bk_staff.booking_time + duration({minutes: durationMinutesVal}) > slotStart
        }

        // Check 4: Customer Booking Conflicts (Optional)
        ${params.customerId ? `
        WITH b, st, s, slotStart, slotEnd, serviceDuration, durationMinutesVal
        MATCH (c:Customer {customer_id: $customerId})
        WHERE NOT EXISTS {
            MATCH (c)-[:MAKES]->(bk_cust:Booking)
            WHERE bk_cust.status <> 'Cancelled'
              AND bk_cust.booking_time < slotEnd
              AND bk_cust.booking_time + duration({minutes: durationMinutesVal}) > slotStart
        }
        ` : ''}

        // If all checks pass, return a confirmation
        RETURN st.staff_id AS availableStaffId
    `;

    const availabilityCheckParams: IDataObject = {
        businessId: params.businessId,
        serviceId: params.serviceId,
        requiredStaffId: params.staffId,
        bookingTime: params.bookingTime,
        serviceDuration: serviceDuration, // Use calculated duration
        durationMinutes: neo4j.int(serviceDuration), // Pass as integer for conflict check
        slotDayOfWeek: neo4j.int(slotDayOfWeek), // Pass calculated day of week
        customerId: params.customerId, // Will be null/undefined if not provided
    };

    context.logger.debug('[StaffOnly Check] Executing revised combined availability query v3', availabilityCheckParams);
    const availabilityResults = await runCypherQuery.call(context, session, availabilityCheckQuery, availabilityCheckParams, false, params.itemIndex);

    if (availabilityResults.length === 0) {
        // Query returned no rows, meaning one of the checks failed
        throw new NodeOperationError(params.node.getNode(), `Staff ${params.staffId} is not available at ${params.bookingTime} due to business hours, staff schedule/exceptions, or booking conflicts.`, { itemIndex: params.itemIndex });
    }

    context.logger.debug(`[StaffOnly Check] Passed for staff ${params.staffId}`);
}
