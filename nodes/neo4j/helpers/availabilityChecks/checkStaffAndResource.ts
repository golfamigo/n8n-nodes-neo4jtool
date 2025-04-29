import type { Session } from 'neo4j-driver';
import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j from 'neo4j-driver';
import { runCypherQuery, convertNeo4jValueToJs } from '../utils';
import { getIsoWeekday } from '../timeUtils'; // Import necessary time utils

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
    context.logger.debug(`[StaffAndResource Check] Checking for staff: ${params.staffId}, resource type: ${params.resourceTypeId}, quantity: ${params.resourceQuantity} at time: ${params.bookingTime}`);

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
    context.logger.debug(`[StaffAndResource Check] Service duration: ${serviceDuration} minutes`);

     // Calculate day of week using helper function
     const slotDayOfWeek = getIsoWeekday(params.bookingTime);
     if (slotDayOfWeek === null) {
          throw new NodeOperationError(params.node.getNode(), `Could not determine day of week for booking time ${params.bookingTime}.`, { itemIndex: params.itemIndex });
     }
      context.logger.debug(`[StaffAndResource Check] Calculated day of week: ${slotDayOfWeek}`);


    // 2. Perform combined availability check in one query
    const availabilityCheckQuery = `
        // Input parameters
        WITH datetime($bookingTime) AS slotStart,
             duration({minutes: $serviceDuration}) AS serviceDuration
        WITH slotStart, slotStart + serviceDuration AS slotEnd, date(slotStart) AS slotDate, $slotDayOfWeek AS slotDayOfWeek, serviceDuration, $serviceDuration AS durationMinutesVal // Use passed day of week

        // Match required entities
        MATCH (b:Business {business_id: $businessId})
        MATCH (st:Staff {staff_id: $requiredStaffId})-[:WORKS_AT]->(b)
        MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b)
        MATCH (rt:ResourceType {type_id: $requiredResourceTypeId, business_id: $businessId})
        WHERE EXISTS { MATCH (st)-[:CAN_PROVIDE]->(s) } // Ensure staff can provide service

        // Check 1: Business Hours
        WITH b, st, s, rt, slotStart, slotEnd, serviceDuration, slotDate, slotDayOfWeek, durationMinutesVal
        MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
        WHERE bh.day_of_week = slotDayOfWeek // Compare with passed parameter
        WITH b, st, s, rt, slotStart, slotEnd, serviceDuration, slotDate, slotDayOfWeek, durationMinutesVal, collect([time(bh.start_time), time(bh.end_time)]) AS businessHourRanges
        WHERE size(businessHourRanges) > 0 AND any(range IN businessHourRanges WHERE range[0] <= time(slotStart) AND range[1] >= time(slotEnd))

        // Check 2: Staff Availability (Schedule/Exceptions)
        WITH b, st, s, rt, slotStart, slotEnd, serviceDuration, slotDate, slotDayOfWeek, durationMinutesVal
        WHERE EXISTS {
            MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability)
            WHERE
                (sa.type = 'EXCEPTION' AND sa.date = slotDate AND time(sa.start_time) <= time(slotStart) AND time(sa.end_time) >= time(slotEnd))
                OR
                (sa.type = 'SCHEDULE' AND sa.day_of_week = slotDayOfWeek AND time(sa.start_time) <= time(slotStart) AND time(sa.end_time) >= time(slotEnd)
                 AND NOT EXISTS { MATCH (st)-[:HAS_AVAILABILITY]->(sa_ex:StaffAvailability {type: 'EXCEPTION', date: slotDate})
                     WHERE (time(sa_ex.start_time) = time({hour: 0, minute: 0}) AND time(sa_ex.end_time) >= time({hour: 23, minute: 59}))
                        OR (time(sa_ex.start_time) < time(slotEnd) AND time(sa_ex.end_time) > time(slotStart))
                 })
        }

        // Check 3: Resource Availability
        WITH b, st, s, rt, slotStart, slotEnd, serviceDuration, durationMinutesVal
        OPTIONAL MATCH (existingRes:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rt)
        WHERE existingRes.status <> 'Cancelled'
          AND existingRes.booking_time < slotEnd
          AND existingRes.booking_time + duration({minutes: durationMinutesVal}) > slotStart
        WITH b, st, s, rt, slotStart, slotEnd, serviceDuration, durationMinutesVal, sum(COALESCE(ru.quantity, 0)) AS usedResources
        WHERE rt.total_capacity >= usedResources + $requiredResourceCapacity // Resource check

        // Check 4: Staff Booking Conflicts
        WITH b, st, s, rt, slotStart, slotEnd, serviceDuration, durationMinutesVal
        WHERE NOT EXISTS {
            MATCH (bk_staff:Booking)-[:SERVED_BY]->(st)
            WHERE bk_staff.status <> 'Cancelled'
              AND bk_staff.booking_time < slotEnd
              AND bk_staff.booking_time + duration({minutes: durationMinutesVal}) > slotStart
        }

        // Check 5: Customer Booking Conflicts (Optional)
        ${params.customerId ? `
        WITH b, st, s, rt, slotStart, slotEnd, serviceDuration, durationMinutesVal
        MATCH (c:Customer {customer_id: $customerId})
        WHERE NOT EXISTS {
            MATCH (c)-[:MAKES]->(bk_cust:Booking)
            WHERE bk_cust.status <> 'Cancelled'
              AND bk_cust.booking_time < slotEnd
              AND bk_cust.booking_time + duration({minutes: durationMinutesVal}) > slotStart
        }
        ` : ''}

        // If all checks pass, return a confirmation
        RETURN st.staff_id AS availableStaffId, rt.type_id AS availableResourceTypeId
    `;

    const availabilityCheckParams: IDataObject = {
        businessId: params.businessId,
        serviceId: params.serviceId,
        requiredStaffId: params.staffId,
        requiredResourceTypeId: params.resourceTypeId,
        requiredResourceCapacity: neo4j.int(params.resourceQuantity),
        bookingTime: params.bookingTime,
        serviceDuration: serviceDuration, // Use calculated duration
        durationMinutes: neo4j.int(serviceDuration), // Pass as integer for conflict check
        slotDayOfWeek: neo4j.int(slotDayOfWeek), // Pass calculated day of week
        customerId: params.customerId,
    };

    context.logger.debug('[StaffAndResource Check] Executing combined availability query', availabilityCheckParams);
    const availabilityResults = await runCypherQuery.call(context, session, availabilityCheckQuery, availabilityCheckParams, false, params.itemIndex);

    if (availabilityResults.length === 0) {
        // Query returned no rows, meaning one of the checks failed
        throw new NodeOperationError(params.node.getNode(), `Staff ${params.staffId} and/or Resource ${params.resourceTypeId} are not available at ${params.bookingTime} due to business hours, availability, capacity, or booking conflicts.`, { itemIndex: params.itemIndex });
    }

    context.logger.debug(`[StaffAndResource Check] Passed for staff ${params.staffId} and resource ${params.resourceTypeId}`);
}
