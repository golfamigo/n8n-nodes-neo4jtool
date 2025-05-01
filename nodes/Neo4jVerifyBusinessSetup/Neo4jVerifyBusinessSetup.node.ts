// ============================================================================
// N8N Neo4j Node: Verify Business Setup
// ============================================================================
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- 導入共用工具函數 ---
import {
	parseNeo4jError,
	convertNeo4jValueToJs,
} from '../neo4j/helpers/utils';

// --- Node Class Definition ---
export class Neo4jVerifyBusinessSetup implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: '[DEPRECATED] Neo4j Verify Business Setup', // Mark as deprecated
		name: 'neo4jVerifyBusinessSetup',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['deprecated'], // Move to deprecated group
		version: 1,
		subtitle: 'DEPRECATED - Use Verify Service Setup', // Update subtitle
		description: '[DEPRECATED] This node is deprecated due to the bookingMode being moved to the Service level. Use the "Neo4j Verify Service Setup" node instead to check if a specific service is ready for booking.', // Update description
		defaults: {
			name: '[DEPRECATED] Neo4j Verify Business Setup',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '要檢查設置的商家 ID',
			},
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		let returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();
		const itemIndex = 0; // 假設單一執行

		try {
			// 1. 獲取認證和參數
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;
			const businessId = this.getNodeParameter('businessId', itemIndex, '') as string;

			// 記錄接收到的參數
			this.logger.debug('執行 VerifyBusinessSetup，參數:', {
				businessId,
			});

			// 2. 驗證認證
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j 認證配置不完整。', { itemIndex });
			}

			// 3. 建立 Neo4j 連接
			const uri = `${credentials.host}:${credentials.port}`;
			const neo4jUser = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';
			try {
				driver = neo4j.driver(uri, auth.basic(neo4jUser, password));
				await driver.verifyConnectivity();
				session = driver.session({ database });
				this.logger.debug('已成功建立 Neo4j 連接');
			} catch (connectionError) {
				throw parseNeo4jError(node, connectionError, 'Neo4j 連接失敗。');
			}

			// 4. 檢查商家基本資料
			const businessQuery = `
				MATCH (b:Business {business_id: $businessId})
				RETURN b {.*} AS business
			`;
			const businessQueryParams = { businessId };
			let business: any = null;
			let bookingMode: string = '';

			try {
				const businessResult = await session.run(businessQuery, businessQueryParams);
				if (businessResult.records.length === 0) {
					throw new NodeOperationError(node, `找不到商家 ID: ${businessId}`, { itemIndex });
				}
				business = convertNeo4jValueToJs(businessResult.records[0].get('business'));
				bookingMode = business.booking_mode || 'TimeOnly'; // 默認為 TimeOnly
			} catch (queryError) {
				throw parseNeo4jError(node, queryError, '查詢商家資料失敗。');
			}

			// 5. 驗證結果初始化
			const verificationResult: any = {
				business: {
					id: business.business_id,
					name: business.name,
					bookingMode: bookingMode,
					isComplete: true,
					issues: [],
				},
				businessHours: {
					isComplete: true,
					issues: [],
					details: []
				},
				services: {
					isComplete: true,
					issues: [],
					count: 0,
					details: []
				},
				staff: {
					isComplete: true,
					issues: [],
					count: 0,
					details: []
				},
				resources: {
					isComplete: true,
					issues: [],
					count: 0,
					details: []
				},
				overallStatus: 'ready', // 'ready' or 'incomplete'
				recommendations: []
			};

			// 檢查商家基本資料完整性
			if (!business.name) {
				verificationResult.business.isComplete = false;
				verificationResult.business.issues.push('缺少商家名稱');
			}
			if (!business.phone) {
				verificationResult.business.isComplete = false;
				verificationResult.business.issues.push('缺少聯絡電話');
			}
			if (!business.email) {
				verificationResult.business.isComplete = false;
				verificationResult.business.issues.push('缺少電子郵件');
			}
			if (!business.address) {
				verificationResult.business.isComplete = false;
				verificationResult.business.issues.push('缺少地址');
			}
			if (!business.booking_mode) {
				verificationResult.business.isComplete = false;
				verificationResult.business.issues.push('未設定預約模式');
			}

			// 6. 檢查商家營業時間
			const businessHoursQuery = `
				MATCH (b:Business {business_id: $businessId})-[:HAS_HOURS]->(bh:BusinessHours)
				RETURN bh {
					day_of_week: bh.day_of_week,
					start_time: toString(bh.start_time),
					end_time: toString(bh.end_time)
				} AS businessHour
				ORDER BY bh.day_of_week
			`;
			try {
				const businessHoursResult = await session.run(businessHoursQuery, businessQueryParams);
				const businessHours = businessHoursResult.records.map(record => convertNeo4jValueToJs(record.get('businessHour')));

				verificationResult.businessHours.details = businessHours;

				if (businessHours.length === 0) {
					verificationResult.businessHours.isComplete = false;
					verificationResult.businessHours.issues.push('未設定營業時間');
					verificationResult.recommendations.push('請設定商家的營業時間');
				} else {
					// 檢查是否缺少某些天的營業時間
					const definedDays = new Set(businessHours.map(bh => bh.day_of_week));
					for (let day = 1; day <= 7; day++) {
						if (!definedDays.has(day)) {
							verificationResult.businessHours.issues.push(`未設定星期${day}的營業時間,如果缺失的設定原本就是休息日可忽略警告`);
						}
					}
					if (verificationResult.businessHours.issues.length > 0) {
						verificationResult.businessHours.isComplete = false;
					}
				}
			} catch (queryError) {
				throw parseNeo4jError(node, queryError, '查詢營業時間失敗。');
			}

			// 7. 檢查服務項目
			const servicesQuery = `
				MATCH (b:Business {business_id: $businessId})-[:OFFERS]->(s:Service)
				RETURN s {.*} AS service
			`;
			try {
				const servicesResult = await session.run(servicesQuery, businessQueryParams);
				const services = servicesResult.records.map(record => convertNeo4jValueToJs(record.get('service')));

				verificationResult.services.count = services.length;
				verificationResult.services.details = services;

				if (services.length === 0) {
					verificationResult.services.isComplete = false;
					verificationResult.services.issues.push('未創建任何服務項目');
					verificationResult.recommendations.push('請至少創建一項服務');
				} else {
					// 檢查服務項目的完整性
					for (const service of services) {
						if (!service.duration_minutes) {
							verificationResult.services.isComplete = false;
							verificationResult.services.issues.push(`服務 "${service.name}" 未設定持續時間`);
						}
					}
				}
			} catch (queryError) {
				throw parseNeo4jError(node, queryError, '查詢服務項目失敗。');
			}

			// 8. 根據預約模式檢查額外要求
			if (bookingMode === 'StaffOnly' || bookingMode === 'StaffAndResource') {
				// 檢查員工 (使用修正後的 :WORKS_AT 關係)
				const staffQuery = `
					MATCH (st:Staff)-[:WORKS_AT]->(b:Business {business_id: $businessId}) // Corrected relationship
					OPTIONAL MATCH (st)-[:CAN_PROVIDE]->(s:Service)
					OPTIONAL MATCH (st)-[:HAS_AVAILABILITY]->(sa:StaffAvailability)
					RETURN st {.*} AS staff, count(DISTINCT s) AS serviceCount, count(DISTINCT sa) AS availabilityCount
				`;
				try {
					const staffResult = await session.run(staffQuery, businessQueryParams);
					const staffList = staffResult.records.map(record => ({
						staff: convertNeo4jValueToJs(record.get('staff')),
						serviceCount: convertNeo4jValueToJs(record.get('serviceCount')),
						availabilityCount: convertNeo4jValueToJs(record.get('availabilityCount'))
					}));

					verificationResult.staff.count = staffList.length;
					verificationResult.staff.details = staffList;

					if (staffList.length === 0) {
						verificationResult.staff.isComplete = false;
						verificationResult.staff.issues.push('未創建任何員工');
						verificationResult.recommendations.push('請至少創建一名員工');
					} else {
						// 檢查員工是否有服務關聯和可用時間
						for (const staffInfo of staffList) {
							if (staffInfo.serviceCount === 0) {
								verificationResult.staff.isComplete = false;
								verificationResult.staff.issues.push(`員工 "${staffInfo.staff.name}" 未關聯任何服務項目`);
							}
							if (staffInfo.availabilityCount === 0) {
								verificationResult.staff.isComplete = false;
								verificationResult.staff.issues.push(`員工 "${staffInfo.staff.name}" 未設定可用時間`);
							}
						}
					}
				} catch (queryError) {
					throw parseNeo4jError(node, queryError, '查詢員工資料失敗。');
				}
			}

			if (bookingMode === 'ResourceOnly' || bookingMode === 'StaffAndResource') {
				// 檢查資源類型和資源實例
				const resourceTypeQuery = `
					MATCH (b:Business {business_id: $businessId})<-[:BELONGS_TO]-(rt:ResourceType)
					RETURN count(rt) > 0 AS hasResourceType
				`;
				const resourceInstanceQuery = `
					MATCH (b:Business {business_id: $businessId})-[:HAS_RESOURCE]->(r:Resource)-[:OF_TYPE]->(rt:ResourceType)
					RETURN r {.*, typeId: rt.type_id} AS resource // Include typeId for verification
				`;
				const serviceRequiresResourceQuery = `
					MATCH (b:Business {business_id: $businessId})-[:OFFERS]->(s:Service)-[:REQUIRES_RESOURCE]->(:ResourceType)
					RETURN count(s) > 0 AS serviceRequiresResource
				`;

				try {
					// Check for Resource Types
					const resourceTypeResult = await session.run(resourceTypeQuery, businessQueryParams);
					if (!resourceTypeResult.records[0]?.get('hasResourceType')) {
						verificationResult.resources.isComplete = false;
						verificationResult.resources.issues.push('未創建任何資源類型');
						verificationResult.recommendations.push('請至少創建一種資源類型');
					}

					// Check for Resource Instances and their :OF_TYPE relationship
					const resourcesResult = await session.run(resourceInstanceQuery, businessQueryParams);
					const resources = resourcesResult.records.map(record => convertNeo4jValueToJs(record.get('resource')));

					verificationResult.resources.count = resources.length;
					verificationResult.resources.details = resources; // Store resource details

					if (resources.length === 0) {
						verificationResult.resources.isComplete = false;
						verificationResult.resources.issues.push('未創建任何資源實例，或資源未關聯到資源類型');
						verificationResult.recommendations.push('請至少創建一個資源實例並確保其關聯到資源類型');
					} else {
						// Check resource integrity (capacity)
						for (const resource of resources) {
							// Type check is now implicit via the MATCH query
							if (resource.capacity === undefined || resource.capacity === null) {
								verificationResult.resources.isComplete = false;
								verificationResult.resources.issues.push(`資源 "${resource.name}" (ID: ${resource.resource_id}) 未設定容量`);
							}
						}
					}

					// Check if any service requires a resource type
					const serviceRequiresResult = await session.run(serviceRequiresResourceQuery, businessQueryParams);
					if (!serviceRequiresResult.records[0]?.get('serviceRequiresResource')) {
						// This might be a warning rather than an error depending on business logic
						verificationResult.resources.issues.push('警告：沒有任何服務項目設定需要資源類型');
						verificationResult.recommendations.push('如果服務需要特定資源（如桌子、房間），請使用 Link Service to Resource Type 節點進行關聯');
					}

				} catch (queryError) {
					throw parseNeo4jError(node, queryError, '查詢資源資料失敗。');
				}
			}

			// 9. 確定整體狀態 (Logic remains similar, checks the isComplete flags)
			if (
				!verificationResult.business.isComplete ||
				!verificationResult.businessHours.isComplete ||
				!verificationResult.services.isComplete ||
				(bookingMode === 'StaffOnly' && !verificationResult.staff.isComplete) ||
				(bookingMode === 'ResourceOnly' && !verificationResult.resources.isComplete) ||
				(bookingMode === 'StaffAndResource' && (!verificationResult.staff.isComplete || !verificationResult.resources.isComplete))
			) {
				verificationResult.overallStatus = 'incomplete';
			}

			// 10. 添加最終建議
			if (verificationResult.overallStatus === 'incomplete') {
				if (verificationResult.recommendations.length === 0) {
					verificationResult.recommendations.push('請完成所有必要設置後再開始接受預約');
				}
			} else {
				verificationResult.recommendations.push('所有必要設置已完成，可以開始接受預約');
			}

			// 11. 返回結果
			returnData.push({
				json: verificationResult,
				pairedItem: { item: itemIndex }
			});

			return this.prepareOutputData(returnData);

		} catch (error) {
			// 處理節點級錯誤
			if (error instanceof NodeOperationError) { throw error; }
			(error as any).itemIndex = itemIndex;
			throw parseNeo4jError(node, error);
		} finally {
			// 關閉會話和驅動
			if (session) {
				try {
					await session.close();
					this.logger.debug('成功關閉 Neo4j 會話');
				} catch (e) {
					this.logger.error('關閉 Neo4j 會話時出錯:', e);
				}
			}
			if (driver) {
				try {
					await driver.close();
					this.logger.debug('成功關閉 Neo4j 驅動');
				} catch (e) {
					this.logger.error('關閉 Neo4j 驅動時出錯:', e);
				}
			}
		}
	}
}
