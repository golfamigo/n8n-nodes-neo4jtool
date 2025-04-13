// @ts-nocheck
/**
 * =============================================================================
 * Update Node 操作 (actions/updateNode.operation.ts)
 * =============================================================================
 *
 * 目的:
 *   - 處理 'Update Node' 操作。
 *   - 定義此操作所需的結構化 UI 參數 (匹配節點的條件 Labels/Properties, 要更新的屬性 Update Properties)。
 *   - 實作 `execute` 函式，接收來自 router 的上下文。
 *   - 為每個輸入項目獲取匹配條件和更新資料。
 *   - 動態生成 `MATCH ... WHERE ... SET ... RETURN` Cypher 查詢。
 *   - 調用通用的 Cypher 執行器 (`runCypherQuery`) 來執行更新操作。
 *   - 匯出 `description` (UI 定義) 和 `execute` (執行邏輯)。
 *
 * 實作要點:
 *   - **UI (`description`):**
 *     - `matchLabels`: (string, optional) 用於輸入要匹配的節點標籤。
 *     - `matchProperties`: (string, required, type: 'json') 用於輸入匹配節點的屬性條件 (必須提供至少一個條件以避免更新過多節點)。
 *     - `updateMode`: (options, 'Set'/'Merge') 決定是完全替換屬性 (`SET n = $props`) 還是合併屬性 (`SET n += $props`)。
 *     - `updateProperties`: (string, required, type: 'json') 用於輸入要更新或添加的屬性物件。
 *     - `options`: (collection, optional) 如 `returnData`。
 *     - `displayOptions`: 確保只在 `operation` 為 `updateNode` 時顯示。
 *   - **執行邏輯 (`execute`):**
 *     - 接收 `session`, `runCypherQuery`, `items`, `nodeOptions`。
 *     - 遍歷 `items`。
 *     - 對於每個 item，獲取 `matchLabels`, `matchProperties`, `updateMode`, `updateProperties`。
 *     - **處理匹配條件:**
 *       - 處理 `matchLabels`。
 *       - 解析並評估 `matchProperties` JSON，確保不為空。
 *       - 使用 `buildMatchPropertiesClause` (或類似輔助函式) 生成 `WHERE` 子句和參數。
 *     - **處理更新資料:** 解析並評估 `updateProperties` JSON。
 *     - **生成 Cypher:**
 *       - 基礎 `MATCH (n{Labels})`。
 *       - 添加 `WHERE` 子句。
 *       - 根據 `updateMode` 添加 `SET n = $updateProps` 或 `SET n += $updateProps`。
 *       - 添加 `RETURN elementId(n) AS elementId, properties(n) AS properties` (如果需要)。
 *     - 準備參數物件，包含匹配參數和更新參數 (注意命名空間，例如 `$match_prop1`, `$update_prop1`)。
 *     - 調用 `runCypherQuery`，傳遞查詢和參數，並指定為寫入操作 (`isWriteQuery = true`)。
 *     - 收集結果。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/actions/database/update.operation.ts` (推測)。
 *   - `insert.operation.ts` 和 `matchNodes.operation.ts` 的結構。
 *   - 動態生成 WHERE 和 SET 子句的概念。
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
		description: 'Labels of the nodes to update (optional).',
		displayOptions: {
			show: {
				operation: ['updateNode'], // 僅在此操作顯示
			},
		},
	},
	{
		displayName: 'Match Properties',
		name: 'matchProperties',
		type: 'json',
		required: true, // 強制要求匹配屬性以防意外更新
		default: '{}',
		placeholder: '{"uuid": "{{ $json.id }}"}',
		description: 'Properties to find the nodes to update (JSON object, required). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['updateNode'],
			},
		},
	},
	{
		displayName: 'Update Mode',
		name: 'updateMode',
		type: 'options',
		options: [
			{
				name: 'Merge',
				value: 'merge',
				description: 'Add new properties and update existing ones (SET n += $props)',
			},
			{
				name: 'Set (Replace)',
				value: 'set',
				description: 'Replace all existing properties with the new ones (SET n = $props)',
			},
		],
		default: 'merge',
		description: 'How to apply the new properties',
		displayOptions: {
			show: {
				operation: ['updateNode'],
			},
		},
	},
	{
		displayName: 'Update Properties',
		name: 'updateProperties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"status": "updated", "lastModified": "{{ $now.toISO() }}"}',
		description: 'Properties to set or merge onto the matched nodes (JSON object). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['updateNode'],
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
				operation: ['updateNode'],
			},
		},
		options: [
			{
				displayName: 'Return Data',
				name: 'returnData',
				type: 'boolean',
				default: true,
				description: 'Whether to return the updated node\'s element ID and properties',
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
			const updateMode = this.getNodeParameter('updateMode', i, 'merge') as 'merge' | 'set';
			const updatePropertiesRaw = this.getNodeParameter('updateProperties', i, '{}') as string | IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const shouldReturnData = options.returnData !== false;

			// 解析並評估匹配屬性
			const matchProperties = await parseJsonParameter.call(this, matchPropertiesRaw, i);
			if (Object.keys(matchProperties).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Match Properties cannot be empty for update operation to prevent accidental mass updates.', { itemIndex: i });
			}

			// 解析並評估更新屬性
			const updateProperties = await parseJsonParameter.call(this, updatePropertiesRaw, i);
			if (Object.keys(updateProperties).length === 0) {
				// 如果沒有要更新的屬性，可以選擇跳過或報錯
				// console.warn(`Item ${i}: No properties provided to update.`);
				// continue;
				throw new NodeOperationError(this.getNode(), 'Update Properties cannot be empty.', { itemIndex: i });
			}


			// 處理 Labels
			const labelsFormatted = formatLabels(matchLabelsRaw); // 返回 ":Label1:Label2" 或 ""

			// 生成 Cypher 查詢
			let query = `MATCH (n${labelsFormatted})`;
			let parameters: IDataObject = {};

			// 添加 WHERE 子句
			const [whereClause, whereParams] = buildMatchPropertiesClause(matchProperties, 'n', 'match_'); // 使用 'match_' 前綴避免參數衝突
			query += ` ${whereClause}`;
			parameters = { ...parameters, ...whereParams };

			// 添加 SET 子句
			const setOperator = updateMode === 'merge' ? '+=' : '=';
			query += ` SET n ${setOperator} $updateProps`;
			parameters.updateProps = updateProperties; // 將更新屬性作為參數

			// 添加 RETURN 子句
			if (shouldReturnData) {
				query += ' RETURN elementId(n) AS elementId, labels(n) AS labels, properties(n) AS properties';
			}

			// 調用通用執行器 (更新操作總是寫入)
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
