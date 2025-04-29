import type { Session } from 'neo4j-driver';
import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j from 'neo4j-driver';
import { runCypherQuery, convertNeo4jValueToJs } from '../utils';
import { getIsoWeekday } from '../timeUtils'; // Import necessary time utils

export interface ResourceOnlyCheckParams {
    businessId: string;
    serviceId: string; // Needed to get duration
    resourceTypeId: string;
    resourceQuantity: number;
    bookingTime: string; // ISO String (already normalized expected)
    itemIndex: number;
    node: IExecuteFunctions; // To throw NodeOperationError correctly
}

export async function checkResourceOnlyAvailability(
    session: Session,
    params: ResourceOnlyCheckParams,
    context: IExecuteFunctions,
): Promise<void> {
    context.logger.debug(`[ResourceOnly Check] Checking for resource type: ${params.resourceTypeId}, quantity: ${params.resourceQuantity} at time: ${params.bookingTime}`);

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
    context.logger.debug(`[ResourceOnly Check] Service duration: ${serviceDuration} minutes`);

    // Calculate day of week using helper function
    const slotDayOfWeek = getIsoWeekday(params.bookingTime);
    if (slotDayOfWeek === null) {
         throw new NodeOperationError(params.node.getNode(), `Could not determine day of week for booking time ${params.bookingTime}.`, { itemIndex: params.itemIndex });
    }
     context.logger.debug(`[ResourceOnly Check] Calculated day of week: ${slotDayOfWeek}`);

    // 2. Perform combined check for Business Hours and Resource Availability
    const availabilityCheckQuery = `
        // Input parameters
        WITH datetime($bookingTime) AS slotStart,
             duration({minutes: $serviceDuration}) AS serviceDuration
        WITH slotStart, slotStart + serviceDuration AS slotEnd, $slotDayOfWeek AS slotDayOfWeek, serviceDuration, $serviceDuration AS durationMinutesVal // Use passed day of week

        // Match business and resource type
        MATCH (b:Business {business_id: $businessId})
        MATCH (rt:ResourceType {type_id: $resourceTypeId, business_id: $businessId})

        // Check 1: Business Hours
        WITH b, rt, slotStart, slotEnd, serviceDuration, slotDayOfWeek, durationMinutesVal
        MATCH (b)-[:HAS_HOURS]->(bh:BusinessHours)
        WHERE bh.day_of_week = slotDayOfWeek // Compare with passed parameter
        WITH b, rt, slotStart, slotEnd, serviceDuration, slotDayOfWeek, durationMinutesVal, collect([time(bh.start_time), time(bh.end_time)]) AS businessHourRanges
        WHERE size(businessHourRanges) > 0 AND any(range IN businessHourRanges WHERE range[0] <= time(slotStart) AND range[1] >= time(slotEnd))

        // Check 2: Resource Availability
        WITH rt, slotStart, slotEnd, durationMinutesVal
        OPTIONAL MATCH (existing:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rt)
        WHERE existing.status <> 'Cancelled' // Ignore cancelled bookings
          AND existing.booking_time < slotEnd
          AND existing.booking_time + duration({minutes: durationMinutesVal}) > slotStart
        WITH rt, sum(COALESCE(ru.quantity, 0)) AS usedResources
        WHERE rt.total_capacity >= usedResources + $resourceQuantity

        // If all checks pass, return a confirmation
        RETURN rt.type_id AS availableResourceTypeId
    `;
    const availabilityCheckParams: IDataObject = {
        resourceTypeId: params.resourceTypeId,
        businessId: params.businessId,
        bookingTime: params.bookingTime,
        serviceDuration: serviceDuration, // Use calculated duration
        resourceQuantity: neo4j.int(params.resourceQuantity),
        slotDayOfWeek: neo4j.int(slotDayOfWeek), // Pass calculated day of week
    };

    context.logger.debug('[ResourceOnly Check] Executing combined availability query', availabilityCheckParams);
    const availabilityResults = await runCypherQuery.call(context, session, availabilityCheckQuery, availabilityCheckParams, false, params.itemIndex);

    if (availabilityResults.length === 0) {
        // Query returned no rows, meaning one of the checks failed
        throw new NodeOperationError(params.node.getNode(), `Resource type ${params.resourceTypeId} is not available at ${params.bookingTime} due to business hours or insufficient capacity. Required: ${params.resourceQuantity}.`, { itemIndex: params.itemIndex });
    }

    context.logger.debug(`[ResourceOnly Check] Passed for resource type ${params.resourceTypeId}`);
}
