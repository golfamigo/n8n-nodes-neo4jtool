// @ts-nocheck
/**
 * =============================================================================
 * Neo4j 主節點定義 (Neo4j.node.ts)
 * =============================================================================
 *
 * 目的:
 *   - 定義 Neo4j 節點的核心屬性 (名稱, 圖示, 分類, 描述, 版本等)。
 *   - 作為節點執行的入口點 (`execute` 方法)。
 *   - 聚合節點的描述 (UI 定義) 和輔助方法。
 *   - 將實際的執行邏輯委派給路由器 (`actions/router.ts`)。
 *
 * 實作要點:
 *   - 繼承 `INodeType` 介面。
 *   - 在 `constructor` 中合併基礎描述和版本/操作特定的描述 (從 `actions/operations.ts` 匯入)。
 *   - 定義 `methods` 屬性，註冊需要從 UI 調用的輔助方法 (如 `credentialTest`, `loadOptions`)。
 *   - `execute` 方法應保持簡潔，直接調用 `router.call(this)`。
 *   - 指定使用的憑證類型 (`credentials` 屬性)。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/PostgresV2.node.ts` 的整體結構和委派模式。
 *   - 如何合併描述 (`versionDescription`) 和註冊方法 (`methods`)。
 *
 */
import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';

// 匯入路由器、操作描述和輔助方法
import { router } from './actions/router';
import { description as operationsDescription } from './actions/operations'; // 操作和 UI 參數定義
import { credentialTest, loadOptions } from './methods'; // 輔助方法

export class Neo4j implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		// 合併基礎描述和來自 operations.ts 的 UI 定義
		this.description = {
			...baseDescription,
			displayName: 'Neo4j',
			name: 'neo4j', // 節點內部名稱
			icon: 'file:neo4j.svg', // 指向圖示檔案
			group: ['database'], // 節點分類
			version: 1,
			subtitle: '={{$parameter["operation"]}}', // UI 上顯示當前操作
			description: 'Interact with a Neo4j graph database', // 節點描述
			defaults: {
				name: 'Neo4j',
			},
			inputs: ['main'], // 輸入錨點
			outputs: ['main'], // 輸出錨點
			credentials: [
				{
					name: 'neo4jApi', // 使用 Neo4j.credentials.ts 中定義的憑證名稱
					required: true,
				},
			],
			properties: [
				// 這裡只放最頂層的資源/操作選項，具體參數由 operationsDescription 提供
				...operationsDescription,
			],
		};
	}

	// 註冊需要從 UI 調用的方法
	methods = {
		credentialTest, // 用於測試連線
		loadOptions, // 用於動態載入選項 (例如標籤、關係類型)
		// resourceMapping: {}, // 如果需要類似 Postgres 的 Resource Mapper
	};

	// 執行入口，直接委派給 router
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
