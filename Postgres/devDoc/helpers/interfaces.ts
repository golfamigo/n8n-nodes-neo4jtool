// @ts-nocheck
/**
 * =============================================================================
 * 共享介面與類型定義 (helpers/interfaces.ts)
 * =============================================================================
 *
 * 目的:
 *   - 定義 Neo4j 節點中重複使用的 TypeScript 介面和類型。
 *   - 提高程式碼的可讀性、可維護性和類型安全性。
 *
 * 實作要點:
 *   - `Neo4jApiCredentials`: 擴展 n8n 的 `ICredentialDataDecryptedObject`，定義憑證物件的結構 (uri, database, username, password)。
 *   - `Neo4jNodeOptions`: 定義節點通用選項的結構 (e.g., continueOnFail, nodeVersion)。
 *   - `CypherRunner`: 定義通用 Cypher 查詢執行器的函式簽名。它應該接收 Session、Cypher 字串、參數物件、讀寫提示和項目索引，並返回 `Promise<INodeExecutionData[]>`。
 *   - (可選) 定義其他共享的類型，例如用於匹配條件、排序規則等的結構。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/helpers/interfaces.ts` 的結構和定義的類型 (如 `PostgresNodeCredentials`, `PostgresNodeOptions`, `QueriesRunner`)。
 *
 */
import type {
	ICredentialDataDecryptedObject,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import type { Session } from 'neo4j-driver';

// Neo4j 憑證介面
export interface Neo4jApiCredentials extends ICredentialDataDecryptedObject {
	uri: string;
	database?: string;
	username: string;
	password?: string; // 密碼可能是可選的，如果驅動支援其他驗證方式
}

// Neo4j 節點通用選項介面
export interface Neo4jNodeOptions extends IDataObject {
	nodeVersion?: number; // 節點版本，用於處理兼容性
	operation?: string; // 當前操作
	continueOnFail?: boolean; // 是否在失敗時繼續
	// 可以添加其他所有操作共享的選項
}

/**
 * 通用 Cypher 查詢執行器的函式簽名
 * @param this n8n 的 IExecuteFunctions 上下文
 * @param session 當前的 Neo4j Session
 * @param query 要執行的 Cypher 查詢字串
 * @param parameters 傳遞給查詢的參數物件
 * @param isWriteQuery 指示是否應使用寫入交易 (true) 或讀取交易 (false)
 * @param itemIndex 當前處理的項目索引 (用於錯誤報告)
 * @returns Promise<INodeExecutionData[]> 格式化後的 n8n 輸出資料
 */
export type CypherRunner = (
	this: IExecuteFunctions,
	session: Session,
	query: string,
	parameters: IDataObject,
	isWriteQuery: boolean,
	itemIndex: number,
) => Promise<INodeExecutionData[]>;

// 可以根據需要添加更多共享介面，例如：
// export interface MatchClause {
//   property: string;
//   operator: string; // e.g., '=', '<>', 'STARTS WITH'
//   value: any;
// }
