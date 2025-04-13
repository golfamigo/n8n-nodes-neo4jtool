// @ts-nocheck
/**
 * =============================================================================
 * Execute Query 操作 (actions/executeQuery.operation.ts)
 * =============================================================================
 *
 * 目的:
 *   - 處理 'Execute Cypher Query' 操作。
 *   - 定義此操作所需的 UI 參數 (Cypher 查詢輸入框, 參數輸入框)。
 *   - 實作 `execute` 函式，接收來自 router 的上下文。
 *   - 為每個輸入項目準備 Cypher 查詢和參數。
 *   - 調用通用的 Cypher 執行器 (`runCypherQuery`) 來執行查詢。
 *   - 匯出 `description` (UI 定義) 和 `execute` (執行邏輯)。
 *
 * 實作要點:
 *   - **UI (`description`):**
 *     - `query`: (string, required, type: 'string', typeOptions: { editor: 'codeEditor', language: 'cypher' }) 用於輸入 Cypher 語句。
 *     - `parameters`: (string, optional, type: 'json') 用於輸入傳遞給 Cypher 的參數物件 (e.g., `{"name": "Alice", "limit": 10}`).
 *     - `options`: (collection, optional) 可以包含通用選項，如 `readOrWrite` (提示執行器使用讀取或寫入交易)。
 *     - `displayOptions`: 確保這些參數只在 `operation` 為 `executeQuery` 時顯示。
 *   - **執行邏輯 (`execute`):**
 *     - 接收 `session`, `runCypherQuery`, `items`, `nodeOptions`。
 *     - 遍歷 `items`。
 *     - 對於每個 item，使用 `getNodeParameter` 獲取 `query` 和 `parameters`。
 *     - 解析 `parameters` JSON 字串為物件。
 *     - (重要) 遍歷參數物件的值，使用 `evaluateExpression` (來自 helpers/utils) 處理 n8n 運算式。
 *     - 決定是使用讀取交易 (`session.executeRead`) 還是寫入交易 (`session.executeWrite`)。可以根據查詢關鍵字 (CREATE, MERGE, SET, DELETE) 或提供一個明確的選項。
 *     - 調用 `runCypherQuery`，傳遞查詢字串、處理好的參數物件以及交易類型提示。
 *     - 收集 `runCypherQuery` 的結果。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/actions/database/executeQuery.operation.ts` 的結構。
 *   - 如何定義操作特定的 UI 參數 (`description`) 及其 `displayOptions`。
 *   - `execute` 函式的基本流程：遍歷 items -> 獲取參數 -> 準備查詢/值 -> 調用執行器。
 *   - 參數處理邏輯 (雖然 Cypher 的命名參數比 Postgres 的位置參數簡單)。
 *
 */
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { Session } from 'neo4j-driver'; // 引入 Neo4j 類型

// 假設的輔助函式和介面
import type { Neo4jNodeOptions, CypherRunner } from '../helpers/interfaces';
import { evaluateExpression, parseJsonParameter } from '../helpers/utils'; // 假設 parseJsonParameter 用於解析和評估參數 JSON

// --- UI 定義 ---
export const description: INodeProperties[] = [
	{
		displayName: 'Cypher Query',
		name: 'query',
		type: 'string',
		typeOptions: {
			editor: 'codeEditor',
			editorLanguage: 'cypher', // 指定 Cypher 語法高亮
		},
		required: true,
		default: '',
		placeholder: 'MATCH (n) RETURN n LIMIT 10',
		description: 'The Cypher query to execute. Use $parameterName syntax for parameters defined below.',
		displayOptions: {
			show: {
				operation: ['executeQuery'], // 僅在此操作顯示
			},
		},
		noDataExpression: true, // 查詢本身通常不應是表達式
	},
	{
		displayName: 'Parameters',
		name: 'parameters',
		type: 'json',
		default: '{}',
		placeholder: '{"name": "Alice", "limit": {{ $json.maxResults || 10 }} }',
		description: 'Parameters to pass to the Cypher query (JSON object). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['executeQuery'],
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
				operation: ['executeQuery'],
			},
		},
		options: [
			{
				displayName: 'Transaction Type',
				name: 'transactionType',
				type: 'options',
				options: [
					{
						name: 'Auto-Detect (Read/Write)',
						value: 'auto',
						description: 'Detect based on keywords (CREATE, MERGE, SET, DELETE) if it\'s a write query',
					},
					{
						name: 'Read',
						value: 'read',
						description: 'Force using a read transaction',
					},
					{
						name: 'Write',
						value: 'write',
						description: 'Force using a write transaction',
					},
				],
				default: 'auto',
				description: 'Choose the type of transaction to use',
			},
			// 可以添加其他 executeQuery 特有的選項
		],
	},
];

// --- 執行邏輯 ---
export async function execute(
	this: IExecuteFunctions,
	session: Session, // 從 router 傳入
	runCypherQuery: CypherRunner, // 從 router 傳入
	items: INodeExecutionData[],
	_nodeOptions: Neo4jNodeOptions, // 通用節點選項 (例如 continueOnFail)
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			// 獲取參數
			const query = this.getNodeParameter('query', i, '') as string;
			const parametersRaw = this.getNodeParameter('parameters', i, '{}') as string | IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const transactionTypeHint = options.transactionType as 'auto' | 'read' | 'write' | undefined ?? 'auto';

			if (!query) {
				throw new NodeOperationError(this.getNode(), 'Cypher Query cannot be empty.', { itemIndex: i });
			}

			// 解析並評估參數 JSON 中的表達式
			const parameters = await parseJsonParameter.call(this, parametersRaw, i);

			// 判斷讀寫類型 (簡易判斷)
			let isWriteQuery = false;
			if (transactionTypeHint === 'write') {
				isWriteQuery = true;
			} else if (transactionTypeHint === 'auto') {
				const upperQuery = query.toUpperCase();
				if (upperQuery.includes('CREATE') || upperQuery.includes('MERGE') || upperQuery.includes('SET') || upperQuery.includes('DELETE') || upperQuery.includes('REMOVE')) {
					isWriteQuery = true;
				}
			}

			// 調用通用執行器
			const resultData = await runCypherQuery.call(this, session, query, parameters, isWriteQuery, i);

			// 合併結果 (runCypherQuery 應該返回 INodeExecutionData[])
			allResults.push(...resultData);

		} catch (error) {
			// 處理 continueOnFail
			if (this.continueOnFail(error)) {
				allResults.push(prepareErrorItem(items, error, i)); // 假設 prepareErrorItem 存在
				continue;
			}
			// 如果不 continueOnFail，則向上拋出錯誤 (會被 router 捕獲)
			throw error;
		}
	}

	return allResults;
}
