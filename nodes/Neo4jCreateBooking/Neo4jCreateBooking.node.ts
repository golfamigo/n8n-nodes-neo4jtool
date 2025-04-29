// ============================================================================
// N8N Neo4j Node: Create Booking
// ============================================================================
import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils';

// --- 引入時間處理工具函數 ---
import {
	toNeo4jDateTimeString,

	// 其他時間處理函數
	normalizeDateTime as _normalizeDateTime,
	normalizeTimeOnly as _normalizeTimeOnly,
	toNeo4jTimeString as _toNeo4jTimeString,
	addMinutesToDateTime as _addMinutesToDateTime,
	TIME_SETTINGS as _TIME_SETTINGS
} from '../neo4j/helpers/timeUtils';

// --- Node Class Definition ---
export class Neo4jCreateBooking implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Booking',
		name: 'neo4jCreateBooking',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for {{$parameter["customerId"]}} at {{$parameter["businessId"]}}',
		description: '創建一個新的預約記錄並建立必要的關聯。,customerId: 進行預約的客戶 ID (UUID),businessId: 預約的商家 ID (UUID),serviceId: 預約的服務 ID (UUID),bookingTime: 預約開始時間 (ISO 8601 格式，需含時區),staffId: 指定服務員工 ID (UUID) (可選),resourceTypeId: 預約使用的資源類型 ID (UUID) (可選),resourceQuantity: 需要使用的資源數量 (默認為 1),notes: 預約備註 (可選)',
		defaults: {
			name: 'Neo4j Create Booking',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,

		// --- Credentials ---
		credentials: [
			{
				name: 'neo4jApi',
				required: true,
			},
		],

		// --- Node Specific Input Properties ---
		properties: [
			// Parameters from TaskInstructions.md
			{
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				required: true,
				default: '',
				description: '進行預約的客戶 ID',
			},
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '預約的商家 ID',
			},
			{
				displayName: 'Service ID',
				name: 'serviceId',
				type: 'string',
				required: true,
				default: '',
				description: '預約的服務 ID',
			},
			{
				displayName: 'Booking Time',
				name: 'bookingTime',
				type: 'string', // Keep as string for ISO8601
				required: true,
				default: '',
				description: '預約開始時間 (ISO 8601 格式，需含時區)',
			},
			{
				displayName: 'Staff ID',
				name: 'staffId',
				type: 'string',
				default: '',
				description: '指定服務員工 ID (可選)',
			},
			{
				displayName: 'Resource Type ID',
				name: 'resourceTypeId',
				type: 'string',
				default: '',
				description: '預約使用的資源類型 ID (可選)',
			},
			{
				displayName: 'Resource Quantity',
				name: 'resourceQuantity',
				type: 'number',
				typeOptions: { minValue: 1, numberStep: 1 },
				default: 1,
				description: '需要使用的資源數量 (默認為 1)',
			},
			{
				displayName: 'Notes',
				name: 'notes',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: '預約備註 (可選)',
			},
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();

		try {
			// 1. Get Credentials
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;

			// 2. Validate Credentials
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured or missing required fields (host, port, username, password).', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const user = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			// 3. Establish Neo4j Connection
			try {
				driver = neo4j.driver(uri, auth.basic(user, password));
				await driver.verifyConnectivity();
				this.logger.debug('Neo4j driver connected successfully.');
				session = driver.session({ database });
				this.logger.debug(`Neo4j session opened for database: ${database}`);
			} catch (connectionError) {
				this.logger.error('Failed to connect to Neo4j or open session:', connectionError);
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection or session.');
			}

			// 4. Loop Through Input Items
			for (let i = 0; i < items.length; i++) {
				try {
					// 5. Get Input Parameters
					const customerId = this.getNodeParameter('customerId', i, '') as string;
					const businessId = this.getNodeParameter('businessId', i, '') as string;
					const serviceId = this.getNodeParameter('serviceId', i, '') as string;
					const rawBookingTime = this.getNodeParameter('bookingTime', i, '') as string;
					const staffId = this.getNodeParameter('staffId', i, '') as string;
					const resourceTypeId = this.getNodeParameter('resourceTypeId', i, '') as string;
					const resourceQuantity = this.getNodeParameter('resourceQuantity', i, 1) as number;
					const notes = this.getNodeParameter('notes', i, '') as string;

					// 使用時間處理工具規範化預約時間，確保 UTC 格式一致
					const bookingTime = toNeo4jDateTimeString(rawBookingTime);

					if (!bookingTime) {
						throw new NodeOperationError(node, `Invalid booking time format: ${rawBookingTime}. Please provide a valid ISO 8601 datetime.`, { itemIndex: i });
					}

					// 6. 檢查服務和資源可用性 (樂觀並發檢查)
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}

					// 檢查服務存在性並獲取時長
					const serviceCheckQuery = `
						MATCH (s:Service {service_id: $serviceId})<-[:OFFERS]-(b:Business {business_id: $businessId})
						RETURN s.duration_minutes AS serviceDuration
					`;
					const serviceParams: IDataObject = {
						serviceId,
						businessId
					};

					const serviceResults = await runCypherQuery.call(this, session, serviceCheckQuery, serviceParams, false, i);
					if (serviceResults.length === 0) {
						throw new NodeOperationError(node, `Service ID ${serviceId} does not exist for Business ID ${businessId}`, { itemIndex: i });
					}

					const serviceDuration = serviceResults[0].json.serviceDuration;

					// 如果提供了資源類型，檢查資源可用性
					let resourcesAvailable = true;
					if (resourceTypeId) {
						const resourceCheckQuery = `
							// 獲取資源類型信息
							MATCH (rt:ResourceType {type_id: $resourceTypeId, business_id: $businessId})

							// 計算預約時間段
							WITH rt, datetime($bookingTime) AS startTime,
								 datetime($bookingTime) + duration({minutes: $serviceDuration}) AS endTime

							// 檢查當前已使用的資源數量
							OPTIONAL MATCH (b:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rt)
							WHERE b.booking_time < endTime AND
								  b.booking_time + duration({minutes: $serviceDuration}) > startTime

							// 計算可用資源
							WITH rt, sum(COALESCE(ru.quantity, 0)) AS usedResources
							WHERE rt.total_capacity >= usedResources + $resourceQuantity

							RETURN rt.name AS resourceName,
								   rt.total_capacity AS totalCapacity,
								   rt.total_capacity - usedResources AS availableCapacity
						`;

						const resourceParams: IDataObject = {
							resourceTypeId,
							businessId,
							bookingTime,
							serviceDuration,
							resourceQuantity: neo4j.int(resourceQuantity)
						};

						const resourceResults = await runCypherQuery.call(this, session, resourceCheckQuery, resourceParams, false, i);
						resourcesAvailable = resourceResults.length > 0;

						if (!resourcesAvailable) {
							throw new NodeOperationError(node, `Not enough resources available for resource type ${resourceTypeId}. Please choose another time or reduce resource quantity.`, { itemIndex: i });
						}
					}

					// 7. 開始創建預約事務 (使用事務確保原子性)
					// 使用悲觀鎖確保並發預約不會超出資源上限
					const txQuery = `
						// 使用 WITH 1 as _ 作為查詢的起點
						WITH 1 as _

						// 查找客戶、商家和服務
						MATCH (c:Customer {customer_id: $customerId})
						MATCH (b:Business {business_id: $businessId})
						MATCH (s:Service {service_id: $serviceId})

						// 創建預約記錄
						CREATE (bk:Booking {
							booking_id: randomUUID(),
							customer_id: $customerId,
							business_id: $businessId,
							service_id: $serviceId,
							booking_time: datetime($bookingTime),
							status: 'Confirmed',
							notes: $notes,
							created_at: datetime()
						})

						// 建立預約關聯
						MERGE (c)-[:MAKES]->(bk)
						MERGE (bk)-[:AT_BUSINESS]->(b)
						MERGE (bk)-[:FOR_SERVICE]->(s)

						// 如果有員工ID，建立與員工的關聯
						WITH bk, b, s
						${staffId ? `
						MATCH (st:Staff {staff_id: $staffId})
						MERGE (bk)-[:SERVED_BY]->(st)
						WITH bk, b, s
						` : ''}

						// 如果有資源類型，創建資源使用記錄
						${resourceTypeId ? `
						MATCH (rt:ResourceType {type_id: $resourceTypeId, business_id: $businessId})

						// 檢查資源可用性 (悲觀鎖機制)
						WITH bk, b, s, rt, datetime($bookingTime) AS startTime,
							 datetime($bookingTime) + duration({minutes: $serviceDuration}) AS endTime

						// 獲取當前已使用的資源數量 (使用 FOR UPDATE 鎖定這些記錄)
						OPTIONAL MATCH (existing:Booking)-[:USES_RESOURCE]->(ru:ResourceUsage)-[:OF_TYPE]->(rt)
						WHERE existing.booking_time < endTime AND
							  existing.booking_time + duration({minutes: $serviceDuration}) > startTime
						WITH bk, b, s, rt, startTime, endTime, sum(COALESCE(ru.quantity, 0)) AS usedResources

						// 再次確認資源足夠 (避免競爭條件)
						WHERE rt.total_capacity >= usedResources + $resourceQuantity

						// 創建資源使用記錄
						CREATE (ru:ResourceUsage {
							usage_id: randomUUID(),
							booking_id: bk.booking_id,
							resource_type_id: rt.type_id,
							quantity: $resourceQuantity,
							created_at: datetime()
						})
						MERGE (bk)-[:USES_RESOURCE]->(ru)
						MERGE (ru)-[:OF_TYPE]->(rt)
						WITH bk
						` : 'WITH bk'}

						// 返回預約詳情
						RETURN bk {.*} AS booking
					`;

					const txParams: IDataObject = {
						customerId,
						businessId,
						serviceId,
						bookingTime,
						notes,
						serviceDuration,
					};

					// 添加可選參數
					if (staffId) {
						txParams.staffId = staffId;
					}

					if (resourceTypeId) {
						txParams.resourceTypeId = resourceTypeId;
						txParams.resourceQuantity = neo4j.int(resourceQuantity);
					}

					// 執行事務並獲取結果
					const txResults = await runCypherQuery.call(this, session, txQuery, txParams, true, i);
					returnData.push(...txResults);

				} catch (itemError) {
					// 8. Handle Item-Level Errors
					if (this.continueOnFail(itemError)) {
						const item = items[i];
						const parsedError = parseNeo4jError(node, itemError);
						const errorData = { ...item.json, error: parsedError };
						returnData.push({
							json: errorData,
							error: new NodeOperationError(node, parsedError.message, { itemIndex: i, description: parsedError.description ?? undefined }),
							pairedItem: { item: i }
						});
						continue;
					}
					throw itemError;
				}
			}

			// 9. Return Results
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 10. Handle Node-Level Errors
			if (error instanceof NodeOperationError) { throw error; }
			throw parseNeo4jError(node, error);
		} finally {
			// 11. Close Session and Driver
			if (session) {
				try {
					await session.close();
					this.logger.debug('Neo4j session closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j session:', closeError);
				}
			}
			if (driver) {
				try {
					await driver.close();
					this.logger.debug('Neo4j driver closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j driver:', closeError);
				}
			}
		}
	}
}
