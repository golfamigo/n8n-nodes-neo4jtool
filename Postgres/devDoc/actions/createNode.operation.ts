// @ts-nocheck
/**
 * =============================================================================
 * Create Node 操作 (actions/createNode.operation.ts)
 * =============================================================================
 *
 * 目的:
 *   - 處理 'Create Node' 操作。
 *   - 定義此操作所需的結構化 UI 參數 (節點標籤 Labels, 節點屬性 Properties)。
 *   - 實作 `execute` 函式，接收來自 router 的上下文。
 *   - 為每個輸入項目獲取標籤和屬性。
 *   - 動態生成 `CREATE` Cypher 查詢。
 *   - 調用通用的 Cypher 執行器 (`runCypherQuery`) 來執行創建操作。
 *   - 匯出 `description` (UI 定義) 和 `execute` (執行邏輯)。
 *
 * 實作要點:
 *   - **UI (`description`):**
 *     - `labels`: (string, required) 用於輸入節點標籤，建議使用逗號分隔 (e.g., 'Person,User') 或多選。
 *     - `properties`: (string, required, type: 'json') 用於輸入節點的屬性物件 (e.g., `{"name": "{{ $json.userName }}", "email": "{{ $json.email }}"}`).
 *     - `options`: (collection, optional) 可以包含通用選項，如 `outputData` (返回創建的節點資訊)。
 *     - `displayOptions`: 確保這些參數只在 `operation` 為 `createNode` 時顯示。
 *   - **執行邏輯 (`execute`):**
 *     - 接收 `session`, `runCypherQuery`, `items`, `nodeOptions`。
 *     - 遍歷 `items`。
 *     - 對於每個 item，使用 `getNodeParameter` 獲取 `labels` 和 `properties`。
 *     - **處理 Labels:** 將逗號分隔的 `labels` 字串轉換為 Cypher 標籤語法 (e.g., ':Person:User')。需要處理空格和空標籤。
 *     - **處理 Properties:** 解析 `properties` JSON 字串為物件，並遍歷其值，使用 `evaluateExpression` 處理 n8n 運算式。
 *     - **生成 Cypher:** 動態構建 `CREATE (n{Labels} $props) RETURN elementId(n) AS elementId, properties(n) AS properties` 查詢。`{Labels}` 部分需要動態插入處理好的標籤字串，屬性物件作為 `$props` 參數傳遞。
 *     - 調用 `runCypherQuery`，傳遞生成的查詢、屬性參數物件，並明確指定為寫入操作 (`isWriteQuery = true`)。
 *     - 收集 `runCypherQuery` 的結果 (應包含新節點的 elementId 和 properties)。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/actions/database/insert.operation.ts` 的結構。
 *   - 如何為結構化操作定義 UI (`description`)。
 *   - `execute` 函式處理輸入、準備資料、動態生成查詢、調用執行器的流程。
 *   - 資料準備的輔助函式概念 (雖然 Neo4j 的 schema 檢查不同，但處理輸入字串/JSON 的思路類似)。
 *   - 使用 `RETURNING` 子句獲取結果的概念 (對應 Cypher 的 `RETURN`)。
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
import { evaluateExpression, parseJsonParameter, prepareErrorItem, formatLabels } from '../helpers/utils'; // 假設 formatLabels 處理標籤字串

// --- UI 定義 ---
export const description: INodeProperties[] = [
	{
		displayName: 'Labels',
		name: 'labels',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'Person, User',
		description: 'Comma-separated labels for the new node (e.g., Person, Customer).',
		displayOptions: {
			show: {
				operation: ['createNode'], // 僅在此操作顯示
			},
		},
	},
	{
		displayName: 'Properties',
		name: 'properties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"name": "{{ $json.name }}", "email": "{{ $json.email }}", "createdAt": "{{ $now.toISO() }}"}',
		description: 'Properties for the new node (JSON object). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['createNode'],
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
				operation: ['createNode'],
			},
		},
		options: [
			// 可以添加 createNode 特有的選項，例如是否返回創建的節點
			{
				displayName: 'Return Data',
				name: 'returnData',
				type: 'boolean',
				default: true,
				description: 'Whether to return the created node\'s element ID and properties',
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
			const labelsRaw = this.getNodeParameter('labels', i, '') as string;
			const propertiesRaw = this.getNodeParameter('properties', i, '{}') as string | IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const shouldReturnData = options.returnData !== false; // 預設返回

			if (!labelsRaw) {
				throw new NodeOperationError(this.getNode(), 'Labels cannot be empty.', { itemIndex: i });
			}

			// 處理 Labels
			const labelsFormatted = formatLabels(labelsRaw); // 假設 formatLabels 返回 ":Label1:Label2"
			if (!labelsFormatted) {
				throw new NodeOperationError(this.getNode(), 'Invalid labels provided.', { itemIndex: i });
			}

			// 解析並評估 Properties JSON 中的表達式
			const properties = await parseJsonParameter.call(this, propertiesRaw, i);

			// 生成 Cypher 查詢
			const returnClause = shouldReturnData ? 'RETURN elementId(n) AS elementId, properties(n) AS properties' : '';
			const query = `CREATE (n${labelsFormatted} $props) ${returnClause}`;

			// 調用通用執行器 (創建操作總是寫入)
			const resultData = await runCypherQuery.call(this, session, query, { props: properties }, true, i); // 將屬性包在 props 參數中

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
