// @ts-nocheck
/**
 * =============================================================================
 * 操作定義聚合檔案 (actions/operations.ts)
 * =============================================================================
 *
 * 目的:
 *   - 定義節點 UI 上最頂層的 'Operation' 下拉選單，列出所有支援的 Neo4j 操作。
 *   - 從各個具體的 `*.operation.ts` 檔案中匯入它們各自的 UI 參數定義 (`description`)。
 *   - 將所有操作的 UI 參數定義聚合到一個 `description` 陣列中。
 *   - 匯出聚合後的 `description` 供 `Neo4j.node.ts` 使用。
 *   - (可選) 匯出所有操作的 `execute` 方法，供 `router.ts` 使用 (另一種路由方式)。
 *
 * 實作要點:
 *   - 定義一個 `INodeProperties` 陣列 `description`。
 *   - 第一個元素是 'Operation' 下拉選單 (`type: 'options'`)，包含所有操作的 `name` (顯示名稱) 和 `value` (內部值，應與操作檔名或 key 對應)。
 *   - `import * as operationName from './operationName.operation';` 匯入每個操作模組。
 *   - 使用展開運算符 (`...`) 將每個操作模組的 `description` 合併到聚合的 `description` 陣列中。
 *   - 確保每個操作模組都匯出了一個 `description: INodeProperties[]`。
 *   - (可選) 匯出一個包含所有操作 `execute` 方法的物件，例如 `export const operations = { executeQuery: executeQuery.execute, createNode: createNode.execute, ... };`
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/actions/database/Database.resource.ts` 的結構。
 *   - 如何定義頂層 'Operation' 選單。
 *   - 如何使用 `import * as ...` 和展開運算符 (`...`) 來聚合各個操作的 `description`。
 *
 */
import type { INodeProperties } from 'n8n-workflow';

// 匯入各個操作的定義 (包含 description 和 execute)
import * as executeQuery from './executeQuery.operation';
import * as createNode from './createNode.operation';
import * as matchNodes from './matchNodes.operation';
import * as updateNode from './updateNode.operation';
import * as deleteNode from './deleteNode.operation';
import * as createRelationship from './createRelationship.operation';
// ... 可以繼續添加其他操作，例如 matchRelationship, updateRelationship, deleteRelationship

// 匯出所有操作的 execute 方法，供 router 使用
export const executeQueryExecute = executeQuery.execute;
export const createNodeExecute = createNode.execute;
export const matchNodesExecute = matchNodes.execute;
export const updateNodeExecute = updateNode.execute;
export const deleteNodeExecute = deleteNode.execute;
export const createRelationshipExecute = createRelationship.execute;
// ... 其他操作的 execute

// 聚合所有 UI 參數定義
export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Execute Cypher Query',
				value: 'executeQuery',
				description: 'Execute a raw Cypher query',
				action: 'Execute a Cypher query',
			},
			{
				name: 'Create Node',
				value: 'createNode',
				description: 'Create a new node with labels and properties',
				action: 'Create a node',
			},
			{
				name: 'Match Nodes',
				value: 'matchNodes',
				description: 'Find nodes based on labels and properties',
				action: 'Match nodes',
			},
			{
				name: 'Update Node',
				value: 'updateNode',
				description: 'Update properties of existing nodes',
				action: 'Update a node',
			},
			{
				name: 'Delete Node',
				value: 'deleteNode',
				description: 'Delete nodes (optionally detaching relationships)',
				action: 'Delete a node',
			},
			{
				name: 'Create Relationship',
				value: 'createRelationship',
				description: 'Create a relationship between two nodes',
				action: 'Create a relationship',
			},
			// ... 其他操作選項 ...
		],
		default: 'executeQuery', // 預設選擇的操作
	},

	// 使用展開運算符合併各個操作的 UI 參數
	...executeQuery.description,
	...createNode.description,
	...matchNodes.description,
	...updateNode.description,
	...deleteNode.description,
	...createRelationship.description,
	// ... 其他操作的 description ...
];
