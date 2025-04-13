// @ts-nocheck
/**
 * =============================================================================
 * Create Relationship 操作 (actions/createRelationship.operation.ts)
 * =============================================================================
 *
 * 目的:
 *   - 處理 'Create Relationship' 操作。
 *   - 定義此操作所需的結構化 UI 參數 (匹配起始節點的條件, 匹配結束節點的條件, 關係類型, 關係屬性)。
 *   - 實作 `execute` 函式，接收來自 router 的上下文。
 *   - 為每個輸入項目獲取匹配條件和關係資料。
 *   - 動態生成 `MATCH (a), (b) WHERE ... CREATE (a)-[r:TYPE $props]->(b)` Cypher 查詢。
 *   - 調用通用的 Cypher 執行器 (`runCypherQuery`) 來執行創建關係操作。
 *   - 匯出 `description` (UI 定義) 和 `execute` (執行邏輯)。
 *
 * 實作要點:
 *   - **UI (`description`):**
 *     - **Start Node Matching:**
 *       - `startNodeMatchLabels`: (string, optional) 起始節點標籤。
 *       - `startNodeMatchProperties`: (string, required, type: 'json') 匹配起始節點的屬性 (必須提供)。
 *     - **End Node Matching:**
 *       - `endNodeMatchLabels`: (string, optional) 結束節點標籤。
 *       - `endNodeMatchProperties`: (string, required, type: 'json') 匹配結束節點的屬性 (必須提供)。
 *     - **Relationship Details:**
 *       - `relationshipType`: (string, required) 關係的類型 (e.g., 'KNOWS', 'WORKS_AT')。
 *       - `relationshipProperties`: (string, optional, type: 'json') 關係的屬性。
 *     - `options`: (collection, optional) 如 `returnData` (返回創建的關係資訊)。
 *     - `displayOptions`: 確保只在 `operation` 為 `createRelationship` 時顯示。
 *   - **執行邏輯 (`execute`):**
 *     - 接收 `session`, `runCypherQuery`, `items`, `nodeOptions`。
 *     - 遍歷 `items`。
 *     - 對於每個 item，獲取所有匹配和關係參數。
 *     - **處理匹配條件:**
 *       - 分別處理起始和結束節點的 Labels 和 Properties。
 *       - 解析並評估 Properties JSON，確保不為空。
 *       - 使用 `buildMatchPropertiesClause` (或類似輔助函式) 分別生成起始節點 (用 `a` 作為別名) 和結束節點 (用 `b` 作為別名) 的 `WHERE` 子句和參數 (注意參數命名空間，如 `start_prop1`, `end_prop1`)。
 *     - **處理關係資料:**
 *       - 獲取 `relationshipType`，確保不為空。
 *       - 解析並評估 `relationshipProperties` JSON。
 *     - **生成 Cypher:**
 *       - 基礎 `MATCH (a{StartLabels}), (b{EndLabels})`。
 *       - 添加 `WHERE` 子句 (包含起始和結束節點的匹配條件，用 `AND` 連接)。
 *       - 添加 `CREATE (a)-[r:{RelType} $relProps]->(b)`。注意 `{RelType}` 需要動態插入，不能作為參數。
 *       - 添加 `RETURN elementId(r) AS elementId, type(r) AS type, properties(r) AS properties` (如果需要)。
 *     - 準備參數物件，包含所有匹配參數和關係屬性參數。
 *     - 調用 `runCypherQuery`，傳遞查詢和參數，並指定為寫入操作 (`isWriteQuery = true`)。
 *     - 收集結果。
 *
 * 參考 Postgres V2:
 *   - 雖然沒有直接對應的操作，但可以參考 `insert` 和 `update` 如何處理多組輸入參數和動態生成查詢。
 *   - `matchNodes` 的匹配邏輯。
 *
 */
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { Session } from 'neo4j-driver';

// 假設的輔助函式和介面
import type { Neo4jNodeOptions, CypherRunner } from '../helpers/interfaces';
import { evaluateExpression, parseJsonParameter, prepareErrorItem, formatLabels, buildMatchPropertiesClause } from '../helpers/utils';

// --- UI 定義 ---
export const description: INodeProperties[] = [
	// --- Start Node ---
	{
		displayName: 'Start Node Match Labels',
		name: 'startNodeMatchLabels',
		type: 'string',
		default: '',
		placeholder: 'Person (optional)',
		description: 'Labels of the starting node for the relationship (optional).',
		displayOptions: {
			show: {
				operation: ['createRelationship'], // 僅在此操作顯示
			},
		},
	},
	{
		displayName: 'Start Node Match Properties',
		name: 'startNodeMatchProperties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"uuid": "{{ $json.startNodeId }}"}',
		description: 'Properties to uniquely identify the starting node (JSON object, required). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	// --- End Node ---
	{
		displayName: 'End Node Match Labels',
		name: 'endNodeMatchLabels',
		type: 'string',
		default: '',
		placeholder: 'Company (optional)',
		description: 'Labels of the ending node for the relationship (optional).',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	{
		displayName: 'End Node Match Properties',
		name: 'endNodeMatchProperties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"uuid": "{{ $json.endNodeId }}"}',
		description: 'Properties to uniquely identify the ending node (JSON object, required). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	// --- Relationship ---
	{
		displayName: 'Relationship Type',
		name: 'relationshipType',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'WORKS_AT',
		description: 'The type of the relationship (e.g., KNOWS, WORKS_AT). Cannot contain spaces or special characters.',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	{
		displayName: 'Relationship Properties',
		name: 'relationshipProperties',
		type: 'json',
		default: '{}',
		placeholder: '{"since": "{{ $now.year }}", "role": "Developer"} (optional)',
		description: 'Properties for the relationship (JSON object, optional). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	// --- Options ---
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
		options: [
			{
				displayName: 'Return Data',
				name: 'returnData',
				type: 'boolean',
				default: true,
				description: 'Whether to return the created relationship\'s element ID, type, and properties',
			},
		],
	},
];

// --- 執行邏輯 ---
export async function execute(
	this: IExecuteFunctions,
	session: Session, // 從 router 傳入
	runCypherQuery: CypherRunner, // 從 router 傳入
	items: INodeExecutionData[],
	_nodeOptions: Neo4jNodeOptions, // 通用節點選項
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			// 獲取參數
			const startLabelsRaw = this.getNodeParameter('startNodeMatchLabels', i, '') as string;
			const startPropsRaw = this.getNodeParameter('startNodeMatchProperties', i, '{}') as string | IDataObject;
			const endLabelsRaw = this.getNodeParameter('endNodeMatchLabels', i, '') as string;
			const endPropsRaw = this.getNodeParameter('endNodeMatchProperties', i, '{}') as string | IDataObject;
			const relType = this.getNodeParameter('relationshipType', i, '') as string;
			const relPropsRaw = this.getNodeParameter('relationshipProperties', i, '{}') as string | IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const shouldReturnData = options.returnData !== false;

			// 驗證必要參數
			if (!relType) {
				throw new NodeOperationError(this.getNode(), 'Relationship Type cannot be empty.', { itemIndex: i });
			}
			// 驗證關係類型格式 (簡單示例)
			if (!/^[A-Z_][A-Z0-9_]*$/i.test(relType)) {
				throw new NodeOperationError(this.getNode(), `Invalid Relationship Type: "${relType}". Use only letters, numbers, and underscores, starting with a letter or underscore.`, { itemIndex: i });
			}

			// 解析並評估匹配屬性
			const startProps = await parseJsonParameter.call(this, startPropsRaw, i);
			const endProps = await parseJsonParameter.call(this, endPropsRaw, i);
			if (Object.keys(startProps).length === 0 || Object.keys(endProps).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Start Node and End Node Match Properties cannot be empty.', { itemIndex: i });
			}

			// 解析並評估關係屬性
			const relProps = await parseJsonParameter.call(this, relPropsRaw, i);

			// 處理 Labels
			const startLabelsFormatted = formatLabels(startLabelsRaw); // :StartLabel
			const endLabelsFormatted = formatLabels(endLabelsRaw);   // :EndLabel

			// 生成 Cypher 查詢
			let parameters: IDataObject = {};

			// MATCH 子句
			let query = `MATCH (a${startLabelsFormatted}), (b${endLabelsFormatted})`;

			// WHERE 子句
			const [startWhereClause, startWhereParams] = buildMatchPropertiesClause(startProps, 'a', 'start_');
			const [endWhereClause, endWhereParams] = buildMatchPropertiesClause(endProps, 'b', 'end_');
			query += ` WHERE ${startWhereClause} AND ${endWhereClause}`; // 合併 WHERE
			parameters = { ...parameters, ...startWhereParams, ...endWhereParams };

			// CREATE 子句
			query += ` CREATE (a)-[r:\`${relType}\` $relProps]->(b)`; // 使用反引號處理類型，屬性作為參數
			parameters.relProps = relProps;

			// RETURN 子句
			if (shouldReturnData) {
				query += ' RETURN elementId(r) AS elementId, type(r) AS type, properties(r) AS properties';
			}

			// 調用通用執行器 (創建關係總是寫入)
			const resultData = await runCypherQuery.call(this, session, query, parameters, true, i);

			// 合併結果
			allResults.push(...resultData);

		} catch (error) {
			// 處理 continueOnFail
			if (this.continueOnFail(error)) {
				allResults.push(prepareErrorItem(items, error, i));
				continue;
			}
			throw error;
		}
	}

	return allResults;
}
