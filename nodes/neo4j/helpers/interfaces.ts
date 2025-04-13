import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import type { Session } from 'neo4j-driver';

// Neo4j 憑證介面
// 注意：這裡不繼承 ICredentialDataDecryptedObject，因為 getCredentials 返回的類型不直接匹配
export interface Neo4jApiCredentials {
	host: string; // Changed from uri to separate host/port
	port: number;
	database?: string;
	username: string;
	password: string; // Password should generally be required for basic auth
}

// Neo4j 節點通用選項介面
export interface Neo4jNodeOptions extends IDataObject {
	nodeVersion?: number; // 節點版本，用於處理兼容性
	operation?: string; // 當前操作
	continueOnFail?: boolean; // 是否在失敗時繼續
	// 可以添加其他所有操作共享的選項
}

/**
 * 通用 Cypher 查詢執行器的函式簽名 (待 utils.ts 實作)
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

// 可以根據需要添加更多共享介面
