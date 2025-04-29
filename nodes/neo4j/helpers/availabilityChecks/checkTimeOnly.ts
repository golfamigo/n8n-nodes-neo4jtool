import type { Session } from 'neo4j-driver';
import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j from 'neo4j-driver'; // Import neo4j driver for types if needed
import { runCypherQuery, convertNeo4jValueToJs } from '../utils';
import { getIsoWeekday } from '../timeUtils'; // Import necessary time utils

export interface TimeOnlyCheckParams {
    businessId: string;
    serviceId: string; // Needed to get duration
    bookingTime: string; // ISO String (already normalized expected)
    itemIndex: number;
    node: IExecuteFunctions; // To throw NodeOperationError correctly
    customerId?: string; // Optional for customer conflict check
}

export async function checkTimeOnlyAvailability(
    session: Session,
    params: TimeOnlyCheckParams,
    context: IExecuteFunctions,
): Promise<void> {
    context.logger.debug(`[TimeOnly Check] Checking for time: ${params.bookingTime}`);

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
    context.logger.debug(`[TimeOnly Check] Service duration: ${serviceDuration} minutes`);

    // Calculate day of week using helper function
    const slotDayOfWeek = getIsoWeekday(params.bookingTime);
    if (slotDayOfWeek === null) {
         throw new NodeOperationError(params.node.getNode(), `Could not determine day of week for booking time ${params.bookingTime}.`, { itemIndex: params.itemIndex });
    }
     context.logger.debug(`[TimeOnly Check] Calculated day of week: ${slotDayOfWeek}`);


    // 2. Perform combined check for Business Hours and Time Conflicts
    const availabilityCheckQuery = `
        // Input parameters
        WITH datetime($bookingTime) AS slotStart,
             duration({minutes: $serviceDuration}) AS serviceDuration
        WITH slotStart, slotStart + serviceDuration AS slotEnd, $slotDayOfWeek AS slotDayOfWeek // Use passed day of week

        // Match business
        MATCH (b:Business {business_id: $businessId})

        // Check 1: Business Hours
        WITH b, slotStart, slotEnd, serviceDuration, slotDayOfWeek
        MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
        WHERE bh.day_of_week = slotDayOfWeek // Compare with passed parameter
        WITH b, slotStart, slotEnd, serviceDuration, slotDayOfWeek, collect([time(bh.start_time), time(bh.end_time)]) AS businessHourRanges
        WHERE size(businessHourRanges) > 0 AND any(range IN businessHourRanges WHERE range[0] <= time(slotStart) AND range[1] >= time(slotEnd))

        // Check 2: General Booking Conflicts (any booking at the business during that time)
        WITH b, slotStart, slotEnd, serviceDuration
        WHERE NOT EXISTS {
            MATCH (bk:Booking)-[:AT_BUSINESS]->(b)
            WHERE bk.status <> 'Cancelled' // Ignore cancelled bookings
              AND bk.booking_time < slotEnd
              AND bk.booking_time + duration({minutes: $serviceDuration}) > slotStart // Use integer duration
        }

        // Check 3: Customer Booking Conflicts (Optional)
        ${params.customerId ? `
        WITH b, slotStart, slotEnd, serviceDuration
        MATCH (c:Customer {customer_id: $customerId})
        WHERE NOT EXISTS {
            MATCH (c)-[:MAKES]->(bk_cust:Booking)
            WHERE bk_cust.status <> 'Cancelled'
              AND bk_cust.booking_time < slotEnd
              AND bk_cust.booking_time + duration({minutes: $serviceDuration}) > slotStart
        }
        ` : ''}

        // If all checks pass, return a confirmation
        RETURN true AS available
    `;

    const availabilityCheckParams: IDataObject = {
        businessId: params.businessId,
        bookingTime: params.bookingTime,
        serviceDuration: neo4j.int(serviceDuration), // Pass duration as integer for Cypher duration function
        slotDayOfWeek: neo4j.int(slotDayOfWeek), // Pass calculated day of week
        customerId: params.customerId,
    };

    context.logger.debug('[TimeOnly Check] Executing combined availability query', availabilityCheckParams);
    const availabilityResults = await runCypherQuery.call(context, session, availabilityCheckQuery, availabilityCheckParams, false, params.itemIndex);

    if (availabilityResults.length === 0) {
        // Query returned no rows, meaning one of the checks failed
        throw new NodeOperationError(params.node.getNode(), `Booking time ${params.bookingTime} is not available due to business hours or existing conflicts.`, { itemIndex: params.itemIndex });
    }

    context.logger.debug(`[TimeOnly Check] All checks passed.`);
}
