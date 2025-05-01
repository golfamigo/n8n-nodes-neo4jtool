// ============================================================================
// N8N Neo4j Node: Create Service
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
import neo4j, { Driver, Session, auth } from 'neo4j-driver'; // Import Integer

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils'; // Adjusted path relative to new location

// --- Node Class Definition ---
export class Neo4jCreateService implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
			displayName: 'Neo4j Create Service', // From TaskInstructions.md
			name: 'neo4jCreateService', // From TaskInstructions.md
			icon: 'file:../neo4j/neo4j.svg', // Point to the icon in the shared neo4j folder
			group: ['database'],
			version: 1,
			subtitle: '={{$parameter["name"]}} for {{$parameter["businessId"]}}', // Show service and business ID
			description: '為指定商家創建一個新的服務項目。,businessId: 提供此服務的商家 ID (UUID),name: 服務名稱,duration_minutes: 服務持續時間（分鐘）,description: 服務描述,price: 服務價格（整數，例如分）(可選),bookingMode: 該服務的預約檢查模式。', // Added bookingMode description
			defaults: {
					name: 'Neo4j Create Service',
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
							displayName: 'Business ID',
							name: 'businessId',
							type: 'string',
							required: true,
							default: '',
							description: '提供此服務的商家 ID',
							typeOptions: {
									buttonConfig: {
											action: {
													type: 'askAiCodeGeneration',
													target: 'businessId'
											},
											hasInputField: true,
											label: '智能生成'
									}
							}
					},
					{
							displayName: 'Name',
							name: 'name',
							type: 'string',
							required: true,
							default: '',
							description: '服務名稱',
							typeOptions: {
									buttonConfig: {
											action: {
													type: 'askAiCodeGeneration',
													target: 'name'
											},
											hasInputField: true,
											label: '智能生成'
									}
							}
					},
					{
							displayName: 'Duration (Minutes)',
							name: 'duration_minutes',
							type: 'number',
							typeOptions: {
									numberStep: 1, // Ensure integer input
									buttonConfig: {
											action: {
													type: 'askAiCodeGeneration',
													target: 'duration_minutes'
											},
											hasInputField: true,
											label: '智能推薦'
									}
							},
							required: true,
							default: 30, // Default duration
							description: '服務持續時間（分鐘）',
					},
					{
							displayName: 'Description',
							name: 'description',
							type: 'string',
							required: true, // Added back as requested
							default: '',
							description: '服務描述',
							typeOptions: {
									buttonConfig: {
											action: {
													type: 'askAiCodeGeneration',
													target: 'description'
											},
											hasInputField: true,
											label: '智能生成描述'
									}
							}
					},
					{
							displayName: 'Price (Integer)',
							name: 'price',
							type: 'number',
							typeOptions: {
									numberStep: 1, // Ensure integer input if price is used
									buttonConfig: {
											action: {
													type: 'askAiCodeGeneration',
													target: 'price'
											},
											hasInputField: true,
											label: '智能建議價格'
									}
							},
							default: 0,
							description: '服務價格（整數，例如分）(可選)',
					},
					// Use collection for booking mode to allow override from input
					{
							displayName: 'Options',
							name: 'options',
							type: 'collection',
							placeholder: 'Add Option',
							default: {
									booking_mode: 'TimeOnly'
							},
							options: [
									{
											displayName: 'Booking Mode (UI Setting)',
											name: 'booking_mode', // Use a distinct name for UI setting
											type: 'options',
											options: [
													{ name: 'Time Only', value: 'TimeOnly' },
													{ name: 'Staff Only', value: 'StaffOnly' },
													{ name: 'Resource Only', value: 'ResourceOnly' },
													{ name: 'Staff And Resource', value: 'StaffAndResource' },
											],
											typeOptions: {
													buttonConfig: {
															action: {
																	type: 'askAiCodeGeneration',
																	target: 'options.booking_mode'
															},
															hasInputField: true,
															label: '智能推薦模式'
													}
											},
											default: 'TimeOnly',
											description: '服務的預約檢查模式 (UI 設定)。如果輸入資料中包含 `query.Booking_Mode`，將優先使用輸入資料的值。',
									}
							]
					},
					// 隐藏字段用于存储AI生成的提示词记录
					{
							displayName: 'AI Generated For Prompt',
							name: 'codeGeneratedForPrompt',
							type: 'hidden',
							default: '',
					}
			],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
			const items = this.getInputData();
			const returnData: INodeExecutionData[] = [];
			let driver: Driver | undefined;
			let session: Session | undefined;
			const node = this.getNode();
			const validBookingModes = ['TimeOnly', 'StaffOnly', 'ResourceOnly', 'StaffAndResource']; // 定義有效模式

			try {
					// 1. 獲取憑證
					const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;

					// 2. 驗證憑證
					if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
							throw new NodeOperationError(node, 'Neo4j credentials are not fully configured or missing required fields (host, port, username, password).', { itemIndex: 0 });
					}

					const uri = `${credentials.host}:${credentials.port}`;
					const user = credentials.username as string;
					const password = credentials.password as string;
					const database = credentials.database as string || 'neo4j';

					// 3. 建立 Neo4j 連接
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

					// 4. 循環處理輸入項目
					for (let i = 0; i < items.length; i++) {
							try {
									// 5. 獲取輸入參數
									const businessId = this.getNodeParameter('businessId', i, '') as string;
									const name = this.getNodeParameter('name', i, '') as string;
									const duration_minutes = this.getNodeParameter('duration_minutes', i, 30) as number;
									const description = this.getNodeParameter('description', i, '') as string;
									const price = this.getNodeParameter('price', i, undefined) as number | undefined; // Handle optional price

									// 決定使用的 booking_mode 值
									let bookingModeToUse: string | undefined;
									const itemData = items[i].json as IDataObject;
									const queryData = itemData.query as IDataObject | undefined;
									const bookingModeFromInput = queryData?.Booking_Mode as string | undefined;

									this.logger.debug(`Input query data for service creation: ${JSON.stringify(queryData)}`);
									this.logger.debug(`Read booking_mode from input query.Booking_Mode: ${bookingModeFromInput}`);

									// 優先使用輸入數據中的值（如果有效）
									if (bookingModeFromInput && validBookingModes.includes(bookingModeFromInput)) {
											bookingModeToUse = bookingModeFromInput;
											this.logger.debug(`Using booking_mode from input query: ${bookingModeToUse}`);
									} else {
											// 如果輸入無效或不存在，嘗試從 UI 參數獲取
											try {
													bookingModeToUse = this.getNodeParameter('options.booking_mode', i, 'TimeOnly') as string;
													this.logger.debug(`Using booking_mode from UI parameter: ${bookingModeToUse}`);
											} catch (paramError) {
													// 如果參數獲取失敗，使用默認值
													bookingModeToUse = 'TimeOnly';
													this.logger.debug(`Error getting booking_mode parameter, using default: ${bookingModeToUse}`);
											}

											// 再次確認獲取的值是否有效
											if (!validBookingModes.includes(bookingModeToUse)) {
													bookingModeToUse = 'TimeOnly'; // 兜底默認值
													this.logger.debug(`Invalid booking_mode from UI, using default: ${bookingModeToUse}`);
											}
									}

									// 6. 定義 Cypher 查詢和參數
									const matchClauses = ['MATCH (b:Business {business_id: $businessId})'];
									const createServiceClause = `
											CREATE (s:Service {
													service_id: randomUUID(),
													name: $name,
													duration_minutes: $duration_minutes,
													description: $description,
													price: $price,
													booking_mode: $booking_mode_param,
													created_at: datetime()
											})
									`;
									const mergeRelationClauses = ['MERGE (b)-[:OFFERS]->(s)'];
									const returnClause = 'RETURN s {.*} AS service';

									const parameters: IDataObject = {
											businessId,
											name,
											duration_minutes: neo4j.int(duration_minutes),
											description,
											price: (price !== undefined) ? neo4j.int(price) : null,
											booking_mode_param: bookingModeToUse,
									};

									// 組合查詢部分
									const query = [
											...matchClauses,
											createServiceClause,
											...mergeRelationClauses,
											returnClause,
									].join('\n');

									const isWrite = true; // 這是一個寫操作 (CREATE)

									// 7. 執行查詢
									if (!session) {
											throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
									}
									const results = await runCypherQuery.call(this, session, query, parameters, isWrite, i);
									returnData.push(...results);

							} catch (itemError) {
									// 8. 處理項目級別錯誤
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

					// 9. 返回結果
					return this.prepareOutputData(returnData);

			} catch (error) {
					// 10. 處理節點級別錯誤
					if (error instanceof NodeOperationError) { throw error; }
					throw parseNeo4jError(node, error);
			} finally {
					// 11. 關閉會話和驅動
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
