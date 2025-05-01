// ============================================================================
// N8N Neo4j Node: Verify Service Setup
// ============================================================================
import type {
	IExecuteFunctions,
	// Removed unused IDataObject
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	// Removed unused runCypherQuery (assuming session.run is used directly now)
	parseNeo4jError,
	convertNeo4jValueToJs,
} from '../neo4j/helpers/utils';

// --- Node Class Definition ---
export class Neo4jVerifyServiceSetup implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Verify Service Setup',
		name: 'neo4jVerifyServiceSetup',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for Service {{$parameter["serviceId"]}}',
		description: '檢查指定服務是否已完成所有必要設置以接受預約',
		defaults: {
			name: 'Neo4j Verify Service Setup',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			{
				displayName: 'Service ID',
				name: 'serviceId',
				type: 'string',
				required: true,
				default: '',
				description: '要檢查設置的服務 ID',
			},
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();
		const itemIndex = 0; // Assume single execution for now

		try {
			// 1. Get Credentials and Parameters
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;
			const serviceId = this.getNodeParameter('serviceId', itemIndex, '') as string;

			this.logger.debug('Executing VerifyServiceSetup for Service ID:', { serviceId }); // Corrected logger call

			// 2. Validate Credentials
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured.', { itemIndex });
			}

			// 3. Establish Neo4j Connection
			const uri = `${credentials.host}:${credentials.port}`;
			const neo4jUser = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';
			try {
				driver = neo4j.driver(uri, auth.basic(neo4jUser, password));
				await driver.verifyConnectivity();
				session = driver.session({ database });
				this.logger.debug('Neo4j connection established.');
			} catch (connectionError) {
				throw parseNeo4jError(node, connectionError, 'Neo4j connection failed.');
			}

			// 4. Get Service Info (including bookingMode and businessId)
			const serviceInfoQuery = `
                MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b:Business)
                RETURN s.name AS serviceName,
                       s.duration_minutes AS durationMinutes,
                       s.booking_mode AS bookingMode,
                       b.business_id AS businessId
            `;
			const serviceInfoParams = { serviceId };
			let serviceInfo: any = null;
			try {
				const serviceInfoResult = await session.run(serviceInfoQuery, serviceInfoParams);
				if (serviceInfoResult.records.length === 0) {
					throw new NodeOperationError(node, `Service not found or not linked to a business: ${serviceId}`, { itemIndex });
				}
				serviceInfo = convertNeo4jValueToJs(serviceInfoResult.records[0].toObject());
				if (!serviceInfo.bookingMode) {
					throw new NodeOperationError(node, `Booking mode not set for service: ${serviceId}`, { itemIndex });
				}
				if (!serviceInfo.durationMinutes) {
					throw new NodeOperationError(node, `Duration not set for service: ${serviceId}`, { itemIndex });
				}
			} catch (queryError) {
				throw parseNeo4jError(node, queryError, 'Failed to query service info.');
			}

			const { serviceName, durationMinutes, bookingMode, businessId } = serviceInfo;
			this.logger.debug(`Service Info: Name=${serviceName}, Duration=${durationMinutes}, Mode=${bookingMode}, Business=${businessId}`);

			// 5. Initialize Verification Result
			const verificationResult: any = {
				service: {
					id: serviceId,
					name: serviceName,
					duration: durationMinutes,
					bookingMode: bookingMode,
				},
				businessHours: { isComplete: true, issues: [] },
				staffSetup: { isComplete: true, issues: [] },
				resourceSetup: { isComplete: true, issues: [] },
				overallStatus: 'ready',
				recommendations: [],
			};

			// 6. Check Business Hours (Common Check)
			const businessHoursQuery = `
                MATCH (:Business {business_id: $businessId})-[:HAS_HOURS]->(bh:BusinessHours)
                RETURN count(bh) > 0 AS hasHours
            `;
			try {
				const hoursResult = await session.run(businessHoursQuery, { businessId });
				if (!hoursResult.records[0]?.get('hasHours')) {
					verificationResult.businessHours.isComplete = false;
					verificationResult.businessHours.issues.push('商家未設置任何營業時間');
					verificationResult.recommendations.push('請為商家設置營業時間');
				}
			} catch (queryError) {
				throw parseNeo4jError(node, queryError, 'Failed to query business hours.');
			}

			// 7. Mode-Specific Checks
			if (bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') {
				// Check Staff Setup
				const staffCheckQuery = `
                    MATCH (s:Service {service_id: $serviceId})<-[:CAN_PROVIDE]-(st:Staff)-[:WORKS_AT]->(:Business {business_id: $businessId})
                    WITH st, s
                    OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability)
                    RETURN st.staff_id AS staffId, st.name AS staffName, count(sa) > 0 AS hasAvailability
                `;
				try {
					const staffResult = await session.run(staffCheckQuery, { serviceId, businessId });
					const staffDetails = staffResult.records.map(r => convertNeo4jValueToJs(r.toObject()));
					if (staffDetails.length === 0) {
						verificationResult.staffSetup.isComplete = false;
						verificationResult.staffSetup.issues.push(`沒有找到任何可以提供此服務 (${serviceName}) 的員工`);
						verificationResult.recommendations.push(`請確保至少有一名員工關聯到此服務 (${serviceId}) 且屬於該商家 (${businessId})`);
					} else {
						staffDetails.forEach(staff => {
							if (!staff.hasAvailability) {
								verificationResult.staffSetup.isComplete = false;
								verificationResult.staffSetup.issues.push(`員工 "${staff.staffName}" (ID: ${staff.staffId}) 未設置可用時間`);
								verificationResult.recommendations.push(`請為員工 ${staff.staffId} 設置可用時間`);
							}
						});
					}
					verificationResult.staffSetup.details = staffDetails;
				} catch (queryError) {
					throw parseNeo4jError(node, queryError, 'Failed to query staff setup.');
				}
			}

			if (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') {
				// Check Resource Setup
				const resourceCheckQuery = `
                    MATCH (s:Service {service_id: $serviceId})-[:REQUIRES_RESOURCE]->(rt:ResourceType)-[:BELONGS_TO]->(:Business {business_id: $businessId})
                    WITH s, rt
                    OPTIONAL MATCH (r:Resource)-[:OF_TYPE]->(rt)
                    RETURN rt.type_id AS resourceTypeId,
                           rt.name AS resourceTypeName,
                           rt.total_capacity AS totalCapacity,
                           count(r) > 0 AS hasInstances
                `;
				try {
					const resourceResult = await session.run(resourceCheckQuery, { serviceId, businessId });
					const resourceDetails = resourceResult.records.map(r => convertNeo4jValueToJs(r.toObject()));
					if (resourceDetails.length === 0) {
						verificationResult.resourceSetup.isComplete = false;
						verificationResult.resourceSetup.issues.push(`此服務 (${serviceName}) 未關聯任何所需的資源類型`);
						verificationResult.recommendations.push(`請使用 Link Service to Resource Type 節點將此服務 (${serviceId}) 關聯到相應的資源類型`);
					} else {
						resourceDetails.forEach(resType => {
							if (resType.totalCapacity === null || typeof resType.totalCapacity !== 'number') {
								verificationResult.resourceSetup.isComplete = false;
								verificationResult.resourceSetup.issues.push(`資源類型 "${resType.resourceTypeName}" (ID: ${resType.resourceTypeId}) 未設置有效的總容量`);
								verificationResult.recommendations.push(`請為資源類型 ${resType.resourceTypeId} 設置總容量`);
							}
							if (!resType.hasInstances) {
								// This might be a warning depending on logic, but let's flag it
								verificationResult.resourceSetup.issues.push(`警告：資源類型 "${resType.resourceTypeName}" (ID: ${resType.resourceTypeId}) 尚未創建任何資源實例`);
								verificationResult.recommendations.push(`請為資源類型 ${resType.resourceTypeId} 創建至少一個資源實例`);
							}
						});
					}
					verificationResult.resourceSetup.details = resourceDetails;
				} catch (queryError) {
					throw parseNeo4jError(node, queryError, 'Failed to query resource setup.');
				}
			}

			// 8. Determine Overall Status
			if (
				!verificationResult.businessHours.isComplete ||
				!verificationResult.staffSetup.isComplete ||
				!verificationResult.resourceSetup.isComplete
			) {
				verificationResult.overallStatus = 'incomplete';
			}

			// 9. Add Final Recommendations
			if (verificationResult.overallStatus === 'incomplete') {
				if (verificationResult.recommendations.length === 0) {
					verificationResult.recommendations.push('請完成所有必要設置後再啟用此服務的預約');
				}
			} else {
				verificationResult.recommendations.push('所有必要設置已完成，此服務可以接受預約');
			}

			// 10. Return Result
			returnData.push({
				json: verificationResult,
				pairedItem: { item: itemIndex }
			});

			return this.prepareOutputData(returnData);

		} catch (error) {
			// Handle Node-Level Errors
			if (error instanceof NodeOperationError) { throw error; }
			throw parseNeo4jError(node, error);
		} finally {
			// Close Session and Driver
			if (session) {
				try { await session.close(); this.logger.debug('Neo4j session closed.'); }
				catch (e) { this.logger.error('Error closing Neo4j session:', e); }
			}
			if (driver) {
				try { await driver.close(); this.logger.debug('Neo4j driver closed.'); }
				catch (e) { this.logger.error('Error closing Neo4j driver:', e); }
			}
		}
	}
}
