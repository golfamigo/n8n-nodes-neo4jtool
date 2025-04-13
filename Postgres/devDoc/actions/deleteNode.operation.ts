// @ts-nocheck
/**
 * =============================================================================
 * Delete Node 操作 (actions/deleteNode.operation.ts)
 * =============================================================================
 *
 * 目的:
 *   - 處理 'Delete Node' 操作。
 *   - 定義此操作所需的結構化 UI 參數 (匹配節點的條件 Labels/Properties, 是否分離關係 Detach)。
 *   - 實作 `execute` 函式，接收來自 router 的上下文。
 *   - 為每個輸入項目獲取匹配條件。
 *   - 動態生成 `MATCH ... WHERE ... [DETACH] DELETE` Cypher 查詢。
 *   - 調用通用的 Cypher 執行器 (`runCypherQuery`) 來執行刪除操作。
 *   - 匯出 `description` (UI 定義) 和 `execute` (執行邏輯)。
 *
 * 實作要點:
 *   - **UI (`description`):**
 *     - `matchLabels`: (string, optional) 用於輸入要匹配的節點標籤。
 *     - `matchProperties`: (string, required, type: 'json') 用於輸入匹配節點的屬性條件 (必須提供至少一個條件以避免誤刪)。
 *     - `detach`: (boolean, default: true) 是否在刪除節點前先刪除其所有關係 (`DETACH DELETE`)。
 *     - `options`: (collection, optional) 如 `returnData` (可能返回被刪除節點的 ID 或計數)。
 *     - `displayOptions`: 確保只在 `operation` 為 `deleteNode` 時顯示。
 *   - **執行邏輯 (`execute`):**
 *     - 接收 `session`, `runCypherQuery`, `items`, `nodeOptions`。
 *     - 遍歷 `items`。
 *     - 對於每個 item，獲取 `matchLabels`, `matchProperties`, `detach`。
 *     - **處理匹配條件:**
 *       - 處理 `matchLabels`。
 *       - 解析並評估 `matchProperties` JSON，確保不為空。
 *       - 使用 `buildMatchPropertiesClause` 生成 `WHERE` 子句和參數。
 *     - **生成 Cypher:**
 *       - 基礎 `MATCH (n{Labels})`。
 *       - 添加 `WHERE` 子句。
 *       - 根據 `detach` 選項決定是 `DETACH DELETE n` 還是 `DELETE n`。
 *       - (可選) 添加 `RETURN count(n) AS deletedCount` 來返回刪除的節點數量。
 *     - 調用 `runCypherQuery`，傳遞查詢和參數，並指定為寫入操作 (`isWriteQuery = true`)。
 *     - 收集結果 (例如刪除計數)。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/actions/database/deleteTable.operation.ts` (推測，雖然操作目標不同，但結構化刪除的思路可參考)。
 *   - `matchNodes.operation.ts` 的匹配邏輯。
 *   - 動態生成 WHERE 和 DELETE 子句的概念。
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
	{
		displayName: 'Match Labels',
		name: 'matchLabels',
		type: 'string',
		default: '',
		placeholder: 'Person, User (optional)',
		description: 'Labels of the nodes to delete (optional).',
		displayOptions: {
			show: {
				operation: ['deleteNode'], // 僅在此操作顯示
			},
		},
	},
	{
		displayName: 'Match Properties',
		name: 'matchProperties',
		type: 'json',
		required: true, // 強制要求匹配屬性以防意外刪除
		default: '{}',
		placeholder: '{"uuid": "{{ $json.id }}"}',
		description: 'Properties to find the nodes to delete (JSON object, required). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['deleteNode'],
			},
		},
	},
	{
		displayName: 'Detach Relationships',
		name: 'detach',
		type: 'boolean',
		default: true,
		description: 'Whether to delete all relationships connected to the node before deleting the node itself (DETACH DELETE). If false, deleting a node with relationships will cause an error.',
		displayOptions: {
			show: {
				operation: ['deleteNode'],
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
				operation: ['deleteNode'],
			},
		},
		options: [
			{
				displayName: 'Return Delete Count',
				name: 'returnCount',
				type: 'boolean',
				default: false, // 預設不返回計數，因為可能影響效能
				description: 'Whether to return the count of deleted nodes',
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
			const matchLabelsRaw = this.getNodeParameter('matchLabels', i, '') as string;
			const matchPropertiesRaw = this.getNodeParameter('matchProperties', i, '{}') as string | IDataObject;
			const detach = this.getNodeParameter('detach', i, true) as boolean;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const shouldReturnCount = options.returnCount === true;


			// 解析並評估匹配屬性
			const matchProperties = await parseJsonParameter.call(this, matchPropertiesRaw, i);
			if (Object.keys(matchProperties).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Match Properties cannot be empty for delete operation to prevent accidental mass deletes.', { itemIndex: i });
			}

			// 處理 Labels
			const labelsFormatted = formatLabels(matchLabelsRaw); // 返回 ":Label1:Label2" 或 ""

			// 生成 Cypher 查詢
			let query = `MATCH (n${labelsFormatted})`;
			let parameters: IDataObject = {};

			// 添加 WHERE 子句
			const [whereClause, whereParams] = buildMatchPropertiesClause(matchProperties, 'n', 'match_');
			query += ` ${whereClause}`;
			parameters = { ...parameters, ...whereParams };

			// 添加 DELETE 子句
			const deletePrefix = detach ? 'DETACH ' : '';
			query += ` ${deletePrefix}DELETE n`;

			// 添加 RETURN 子句 (如果需要)
			if (shouldReturnCount) {
				query += ' RETURN count(n) AS deletedCount';
			}

			// 調用通用執行器 (刪除操作總是寫入)
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
