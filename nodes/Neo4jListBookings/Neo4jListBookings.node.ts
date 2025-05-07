// Neo4jListBookings.node.ts
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { type Session, type Driver, auth } from 'neo4j-driver';
import {
	runCypherQuery,
	parseNeo4jError,
	convertNeo4jValueToJs,
} from '../neo4j/helpers/utils';
import { DateTime } from 'luxon';

export class Neo4jListBookings implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Neo4j List Bookings',
		name: 'neo4jListBookings',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['transform'],
		version: 1,
		subtitle: 'List and filter booking records',
		description: '查詢/列出預約記錄 (可選過濾條件)。\n\n**可選過濾條件**:\n- businessId: 商家ID\n- customerId: 客戶ID\n- staffId: 員工ID\n- startDate: 起始日期 (格式: YYYY-MM-DD 或 YYYY-MM-DDThh:mm:ss)\n- endDate: 結束日期 (格式: YYYY-MM-DD 或 YYYY-MM-DDThh:mm:ss)\n- status: 預約狀態 (如: Confirmed, Cancelled, Completed)\n- limit: 返回最大結果數 (默認: 100)\n\n**注意**: 日期參數如不包含時間部分，請使用標準格式如 2025-05-01。查詢結果將按預約時間降序排列。',
		defaults: {
			name: 'Neo4j List Bookings',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [
			{
				name: 'neo4jApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				default: '',
				description: '要查詢的商家 ID',
				required: true,
			},
			{
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				default: '',
				description: '要查詢的客戶 ID',
			},
			{
				displayName: 'Staff ID',
				name: 'staffId',
				type: 'string',
				default: '',
				description: '要查詢的員工 ID',
			},
			{
				displayName: 'Start Date',
				name: 'startDate',
				type: 'dateTime',
				default: '',
				description: '查詢的起始日期',
			},
			{
				displayName: 'End Date',
				name: 'endDate',
				type: 'dateTime',
				default: '',
				description: '查詢的結束日期',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'string',
				default: '',
				description: '預約狀態（如 Confirmed, Cancelled, Completed）',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				description: 'Max number of results to return',
				typeOptions: {
					minValue: 1,
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();

		try {
			// 獲取認證資料
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j 認證不完整 (缺少主機、端口、用戶名或密碼)。', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const username = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			// 建立連接
			try {
				driver = neo4j.driver(uri, auth.basic(username, password));
				await driver.verifyConnectivity();
				this.logger.debug('Neo4j 驅動連接成功。');
				session = driver.session({ database });
				this.logger.debug(`Neo4j 會話已開啟，資料庫: ${database}`);
			} catch (connectionError) {
				this.logger.error('無法連接到 Neo4j 或開啟會話:', connectionError);
				throw parseNeo4jError(node, connectionError, '建立 Neo4j 連接或會話失敗。');
			}

			// 處理每個輸入項
			for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
				if (!session) {
					throw new NodeOperationError(node, 'Neo4j 會話不可用。', { itemIndex });
				}

				try {
					// 獲取過濾參數
					const businessId = this.getNodeParameter('businessId', itemIndex, '') as string;
					const customerId = this.getNodeParameter('customerId', itemIndex, '') as string;
					const staffId = this.getNodeParameter('staffId', itemIndex, '') as string;
					const startDateInput = this.getNodeParameter('startDate', itemIndex, '') as string;
					const endDateInput = this.getNodeParameter('endDate', itemIndex, '') as string;
					const status = this.getNodeParameter('status', itemIndex, '') as string;
					const limit = this.getNodeParameter('limit', itemIndex, 100) as number;

					// 構建查詢參數
					const queryParams: IDataObject = {};

					// 構建查詢條件
					let whereConditions: string[] = [];

					// 添加 businessId 條件（如果提供）
					if (businessId) {
						whereConditions.push('bk.business_id = $businessId');
						queryParams.businessId = businessId;
					}

					// 添加 customerId 條件（如果提供）
					if (customerId) {
						whereConditions.push('bk.customer_id = $customerId');
						queryParams.customerId = customerId;
					}

					// 添加 staffId 條件（如果提供）
					if (staffId) {
						whereConditions.push('EXISTS { MATCH (bk)-[:SERVED_BY]->(:Staff {staff_id: $staffId}) }');
						queryParams.staffId = staffId;
					}

					// 添加 startDate 條件（如果提供）
					if (startDateInput) {
						try {
							// 嘗試解析日期
							const startDate = DateTime.fromISO(startDateInput).toISO();
							if (startDate) {
								whereConditions.push('bk.booking_time >= datetime($startDate)');
								queryParams.startDate = startDate;
							}
						} catch (dateError) {
							this.logger.warn(`無效的起始日期格式: ${startDateInput}, 已忽略此條件`);
						}
					}

					// 添加 endDate 條件（如果提供）
					if (endDateInput) {
						try {
							// 嘗試解析日期
							const endDate = DateTime.fromISO(endDateInput).toISO();
							if (endDate) {
								whereConditions.push('bk.booking_time <= datetime($endDate)');
								queryParams.endDate = endDate;
							}
						} catch (dateError) {
							this.logger.warn(`無效的結束日期格式: ${endDateInput}, 已忽略此條件`);
						}
					}

					// 添加 status 條件（如果提供）
					if (status) {
						whereConditions.push('bk.status = $status');
						queryParams.status = status;
					}

					// 構建完整的 WHERE 子句
					const whereClause = whereConditions.length > 0
						? `WHERE ${whereConditions.join(' AND ')}`
						: '';

					// 構建完整的查詢
					const query = `
						MATCH (bk:Booking)
						${whereClause}
						OPTIONAL MATCH (c:Customer {customer_id: bk.customer_id})
						OPTIONAL MATCH (bk)-[:SERVED_BY]->(st:Staff)
						OPTIONAL MATCH (s:Service {service_id: bk.service_id})
						OPTIONAL MATCH (b:Business {business_id: bk.business_id})
						RETURN
							bk.booking_id AS bookingId,
							toString(bk.booking_time) AS bookingTime,
							bk.status AS status,
							bk.notes AS notes,
							c.name AS customerName,
							st.name AS staffName,
							s.name AS serviceName,
							b.name AS businessName
						ORDER BY bk.booking_time DESC
						LIMIT $limit
					`;

					// 添加 limit 參數
					queryParams.limit = neo4j.int(limit);

					this.logger.debug('執行 Neo4j 查詢:', { query, params: queryParams });

					// 執行查詢
					const results = await runCypherQuery.call(this, session, query, queryParams, false, itemIndex);
					this.logger.debug(`查詢返回 ${results.length} 條記錄`);

					// 處理結果
					const bookings = results.map(record => convertNeo4jValueToJs(record.json));

					if (bookings.length === 0) {
						this.logger.debug('沒有找到匹配的預約記錄');
					}

					// 將結果添加到輸出
					for (const booking of bookings) {
						returnData.push({
							json: booking,
							pairedItem: { item: itemIndex }
						});
					}

				} catch (itemError) {
					// 處理項目級別錯誤
					if (this.continueOnFail()) {
						const message = itemError instanceof Error ? itemError.message : String(itemError);
						returnData.push({ json: { error: message }, pairedItem: { item: itemIndex } });
						continue;
					}

					// 如果不繼續執行，則拋出錯誤
					if (itemError instanceof NodeOperationError) {
						throw itemError;
					}

					(itemError as any).itemIndex = itemIndex;
					throw parseNeo4jError(node, itemError);
				}
			}

		} catch (error) {
			// 處理節點級別錯誤
			if (this.continueOnFail()) {
				const message = error instanceof Error ? error.message : String(error);
				returnData.push({ json: { error: message } });
				return this.prepareOutputData(returnData);
			}

			if (error instanceof NodeOperationError) {
				throw error;
			}

			throw parseNeo4jError(node, error);
		} finally {
			// 關閉會話和驅動
			if (session) {
				try {
					await session.close();
					this.logger.debug('Neo4j 會話已成功關閉');
				} catch (closeError) {
					this.logger.error('關閉 Neo4j 會話時出錯:', closeError);
				}
			}

			if (driver) {
				try {
					await driver.close();
					this.logger.debug('Neo4j 驅動已成功關閉');
				} catch (closeError) {
					this.logger.error('關閉 Neo4j 驅動時出錯:', closeError);
				}
			}
		}

		return [returnData];
	}
}
