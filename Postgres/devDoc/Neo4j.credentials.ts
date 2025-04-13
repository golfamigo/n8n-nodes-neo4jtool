// @ts-nocheck
/**
 * =============================================================================
 * Neo4j 憑證定義 (Neo4j.credentials.ts)
 * =============================================================================
 *
 * 目的:
 *   - 定義連接 Neo4j 資料庫所需的憑證類型和欄位。
 *   - 讓使用者可以在 n8n 的 Credentials 管理介面中安全地儲存連線資訊。
 *
 * 實作要點:
 *   - 繼承 `ICredentialType` 介面。
 *   - 定義 `name` 為 'neo4jApi' (或其他合適的唯一名稱)。
 *   - 定義 `displayName` 為 'Neo4j API'。
 *   - 定義 `properties` 陣列，包含以下欄位：
 *     - `uri`: (string, required) Neo4j Bolt 或 HTTP URI (e.g., 'neo4j://localhost:7687', 'bolt://xxx.databases.neo4j.io')。
 *     - `database`: (string, optional) 資料庫名稱，預設通常是 'neo4j' 或 'system'。
 *     - `username`: (string, required) 使用者名稱。
 *     - `password`: (string, required, type: 'password') 密碼。
 *   - (可選) 添加 `documentationUrl` 指向相關文件。
 *   - (可選) 實作 `test` 方法，用於在 n8n UI 上測試連線是否成功 (參考 Postgres 的 credentialTest)。
 *
 * 參考 Postgres V2:
 *   - Postgres 節點的憑證定義方式 (雖然我們沒有直接看檔案，但這是 n8n 標準做法)。
 *   - 測試連線邏輯可參考 `packages/n8n/nodes/neo4j/Postgres/v2/methods/credentialTest.ts`。
 *
 */

import type { ICredentialType, INodeProperties } from 'n8n-workflow';

// TODO: 實作 Neo4j 憑證類型
export class Neo4jApi implements ICredentialType {
	name = 'neo4jApi'; // 唯一的憑證類型名稱
	displayName = 'Neo4j API'; // 顯示在 UI 上的名稱
	// documentationUrl = 'https://docs.example.com/neo4j-credentials'; // (可選) 文件連結
	properties: INodeProperties[] = [
		{
			displayName: 'Neo4j URI',
			name: 'uri',
			type: 'string',
			required: true,
			default: 'neo4j://localhost:7687',
			placeholder: 'neo4j://<host>:<port> or bolt://<host>:<port>',
			description: 'The connection URI for the Neo4j database (e.g., neo4j://localhost:7687)',
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string',
			default: 'neo4j',
			placeholder: 'neo4j',
			description: 'The name of the database to connect to (optional, defaults to neo4j)',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			required: true,
			default: 'neo4j',
			description: 'The username for authentication',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
			description: 'The password for authentication',
		},
	];

	// TODO: (可選) 實作測試連線方法
	// test = async function (this: ICredentialTestFunctions): Promise<[boolean, JsonObject | string]> {
	//   // ... 參考 credentialTest.ts 的邏輯 ...
	//   return [true, 'Connection tested successfully!'];
	// };
}
