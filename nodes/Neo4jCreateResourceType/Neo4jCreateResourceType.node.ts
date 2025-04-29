// ============================================================================
// N8N Neo4j Node: Create Resource Type
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

// --- Node Class Definition ---
export class Neo4jCreateResourceType implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Create Resource Type',
		name: 'neo4jCreateResourceType',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for Business {{$parameter["businessId"]}}',
		description: '定義一個資源分類，用於管理具有相同特性或預約限制的共享資源。例如，將所有「4人桌」歸為一類。 businessId: 資源類型所屬的商家 ID (UUID)。 typeName: 資源分類的名稱 (例如：「4人桌」、「2人桌」、「理髮椅」)。 totalCapacity: 此特定分類下總共有多少個資源實例 (例如，若有 2 張 4 人桌，則「4人桌」類型的 totalCapacity 為 2)，要注意的是，當你建立了一個新的resourceType後，應該接著提醒用戶建立相應的resource。',
		defaults: {
			name: 'Neo4j Create Resource Type',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [{ name: 'neo4jApi', required: true }],
		properties: [
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '資源類型所屬的商家 ID',
			},
			{
				displayName: 'Type Name',
				name: 'typeName',
				type: 'string',
				required: true,
				default: '',
				description: '資源類型名稱 (例如: 理髮椅、美甲桌)',
			},
			{
				displayName: 'Total Capacity',
				name: 'totalCapacity',
				type: 'number',
				typeOptions: { minValue: 1, numberStep: 1 },
				required: true,
				default: 1,
				description: '此類型資源的總數量',
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				required: true,
				default: '',
				description: '資源類型描述',
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
				throw new NodeOperationError(node, 'Neo4j 認證配置不完整。', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const user = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			// 3. Establish Neo4j Connection
			try {
				driver = neo4j.driver(uri, auth.basic(user, password));
				await driver.verifyConnectivity();
				session = driver.session({ database });
			} catch (connectionError) {
				throw parseNeo4jError(node, connectionError, 'Neo4j 連接失敗。');
			}

			// 4. Loop Through Input Items
			for (let i = 0; i < items.length; i++) {
				try {
					// 5. Get Input Parameters
					const businessId = this.getNodeParameter('businessId', i, '') as string;
					const typeName = this.getNodeParameter('typeName', i, '') as string;
					const totalCapacity = this.getNodeParameter('totalCapacity', i, 1) as number;
					const description = this.getNodeParameter('description', i, '') as string;

					// 驗證必填參數
					if (!businessId || !typeName) {
						throw new NodeOperationError(node, '商家 ID 和類型名稱為必填項。', { itemIndex: i });
					}

					// 6. 檢查商家是否存在
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j 會話未初始化', { itemIndex: i });
					}

					const checkQuery = `
						MATCH (b:Business {business_id: $businessId})
						RETURN b
					`;
					const checkParams: IDataObject = { businessId };

					const checkResults = await runCypherQuery.call(this, session, checkQuery, checkParams, false, i);
					if (checkResults.length === 0) {
						throw new NodeOperationError(node, `商家 ID ${businessId} 不存在`, { itemIndex: i });
					}

					// 7. 創建資源類型
					const createQuery = `
						MATCH (b:Business {business_id: $businessId})
						MERGE (rt:ResourceType {
							type_id: randomUUID(),
							business_id: $businessId,
							name: $typeName,
							total_capacity: $totalCapacity,
							description: $description,
							created_at: datetime()
						})
						// 建立向後兼容的關聯
						MERGE (rt)-[:BELONGS_TO]->(b)
						// 建立向前兼容的關聯
						MERGE (b)-[:HAS_RESOURCE_TYPE]->(rt)
						RETURN rt {
							.type_id,
							.business_id,
							.name,
							.total_capacity,
							.description,
							.created_at
						} AS resourceType
					`;

					const createParams: IDataObject = {
						businessId,
						typeName,
						totalCapacity: neo4j.int(totalCapacity),
						description,
					};

					const createResults = await runCypherQuery.call(this, session, createQuery, createParams, true, i);
					returnData.push(...createResults);

				} catch (itemError) {
					// 8. Handle Item-Level Errors
					if (this.continueOnFail(itemError)) {
						const parsedError = parseNeo4jError(node, itemError);
						this.logger.warn(`Failed to process item ${i}: ${parsedError.message}`, {
							error: parsedError
						});
						const errorData = {
							...items[i].json,
							error: {
								message: parsedError.message,
								description: parsedError.description
							}
						};

						returnData.push({
							json: errorData,
							error: new NodeOperationError(node, parsedError.message, {
								itemIndex: i,
								description: parsedError.description ?? undefined
							}),
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
			if (items.length === 1) (error as any).itemIndex = 0;
			throw parseNeo4jError(node, error);
		} finally {
			// 11. Close Session and Driver
			if (session) {
				try { await session.close(); } catch (e) { this.logger.error('關閉 Neo4j 會話時出錯:', e); }
			}
			if (driver) {
				try { await driver.close(); } catch (e) { this.logger.error('關閉 Neo4j 驅動時出錯:', e); }
			}
		}
	}
}
