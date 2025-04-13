// @ts-nocheck
/**
 * =============================================================================
 * Match Nodes 操作 (actions/matchNodes.operation.ts)
 * =============================================================================
 *
 * 目的:
 *   - 處理 'Match Nodes' 操作。
 *   - 定義此操作所需的結構化 UI 參數 (匹配的標籤 Labels, 匹配的屬性 Properties, 返回限制 Limit)。
 *   - 實作 `execute` 函式，接收來自 router 的上下文。
 *   - 為每個輸入項目獲取匹配條件。
 *   - 動態生成 `MATCH ... WHERE ... RETURN` Cypher 查詢。
 *   - 調用通用的 Cypher 執行器 (`runCypherQuery`) 來執行查找操作。
 *   - 匯出 `description` (UI 定義) 和 `execute` (執行邏輯)。
 *
 * 實作要點:
 *   - **UI (`description`):**
 *     - `matchLabels`: (string, optional) 用於輸入要匹配的節點標籤 (逗號分隔)。
 *     - `matchProperties`: (string, optional, type: 'json') 用於輸入匹配節點的屬性條件 (e.g., `{"email": "{{ $json.userEmail }}"}`).
 *     - `limit`: (number, optional) 返回的最大節點數量。
 *     - `options`: (collection, optional) 可以包含通用選項，如 `outputData` (返回節點的哪些資訊)。
 *     - `displayOptions`: 確保這些參數只在 `operation` 為 `matchNodes` 時顯示。
 *   - **執行邏輯 (`execute`):**
 *     - 接收 `session`, `runCypherQuery`, `items`, `nodeOptions`。
 *     - 遍歷 `items`。
 *     - 對於每個 item，獲取 `matchLabels`, `matchProperties`, `limit`。
 *     - **處理 Labels:** 將 `matchLabels` 轉換為 Cypher 標籤語法 (e.g., ':Person:User')。如果為空，則匹配任意標籤 (`(n)`).
 *     - **處理 Properties:** 解析 `matchProperties` JSON，並評估其中的 n8n 運算式。
 *     - **生成 Cypher:**
 *       - 基礎 `MATCH (n{Labels})`。
 *       - 如果 `matchProperties` 不為空，動態生成 `WHERE` 子句，例如 `WHERE n.prop1 = $prop1 AND n.prop2 = $prop2`。需要將解析後的屬性物件轉換為 WHERE 條件和參數。可以參考 Postgres 的 `addWhereClauses` 的思路，但語法不同。
 *       - 添加 `RETURN elementId(n) AS elementId, labels(n) AS labels, properties(n) AS properties`。
 *       - 如果 `limit` 有效，添加 `LIMIT $limit` 子句。
 *     - 調用 `runCypherQuery`，傳遞生成的查詢和參數物件，並指定為讀取操作 (`isWriteQuery = false`)。
 *     - 收集 `runCypherQuery` 的結果。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/actions/database/select.operation.ts` (雖然沒看，但邏輯類似)。
 *   - `insert.operation.ts` 的結構化 UI 和 `execute` 流程。
 *   - `utils.ts` 中的 `addWhereClauses` 概念 (用於動態生成 WHERE 子句)。
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
import neo4j from 'neo4j-driver'; // 需要 Integer 類型

// 假設的輔助函式和介面
import type { Neo4jNodeOptions, CypherRunner } from '../helpers/interfaces';
import { evaluateExpression, parseJsonParameter, prepareErrorItem, formatLabels, buildMatchPropertiesClause } from '../helpers/utils'; // 假設 buildMatchPropertiesClause 生成 WHERE 子句和參數

// --- UI 定義 ---
export const description: INodeProperties[] = [
	{
		displayName: 'Match Labels',
		name: 'matchLabels',
		type: 'string',
		default: '',
		placeholder: 'Person, User (optional)',
		description: 'Comma-separated labels to match (optional). If empty, matches nodes with any label.',
		displayOptions: {
			show: {
				operation: ['matchNodes'], // 僅在此操作顯示
			},
		},
	},
	{
		displayName: 'Match Properties',
		name: 'matchProperties',
		type: 'json',
		default: '{}',
		placeholder: '{"email": "{{ $json.email }}", "status": "active"} (optional)',
		description: 'Properties to match (JSON object). Values can be n8n expressions. Leave empty to match based only on labels.',
		displayOptions: {
			show: {
				operation: ['matchNodes'],
			},
		},
	},
	{
		displayName: 'Return Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 10,
		description: 'Maximum number of nodes to return.',
		displayOptions: {
			show: {
				operation: ['matchNodes'],
			},
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['matchNodes'],
			},
		},
		options: [
			// 可以添加 matchNodes 特有的選項
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
			const matchLabelsRaw = this.getNodeParameter('matchLabels', i, '') as string;
			const matchPropertiesRaw = this.getNodeParameter('matchProperties', i, '{}') as string | IDataObject;
			const limitRaw = this.getNodeParameter('limit', i, 10); // Default limit 10

			// 處理 Labels
			const labelsFormatted = formatLabels(matchLabelsRaw); // 返回 ":Label1:Label2" 或 ""

			// 解析並評估 Properties JSON 中的表達式
			const matchProperties = await parseJsonParameter.call(this, matchPropertiesRaw, i);

			// 生成 Cypher 查詢
			let query = `MATCH (n${labelsFormatted})`;
			let parameters: IDataObject = {};

			// 添加 WHERE 子句 (如果需要)
			const [whereClause, whereParams] = buildMatchPropertiesClause(matchProperties, 'n'); // 假設此函式返回 WHERE 子句字串和參數物件
			query += ` ${whereClause}`;
			parameters = { ...parameters, ...whereParams };

			// 添加 RETURN 子句
			query += ' RETURN elementId(n) AS elementId, labels(n) AS labels, properties(n) AS properties';

			// 添加 LIMIT 子句
			const limit = neo4j.int(limitRaw); // 使用 neo4j.int 處理可能的整數溢出
			query += ' LIMIT $limit';
			parameters.limit = limit;


			// 調用通用執行器 (匹配操作總是讀取)
			const resultData = await runCypherQuery.call(this, session, query, parameters, false, i);

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
