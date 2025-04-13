// @ts-nocheck
/**
 * =============================================================================
 * 操作路由器 (actions/router.ts)
 * =============================================================================
 *
 * 目的:
 *   - 作為節點執行的實際入口 (由 Neo4j.node.ts 的 execute 方法調用)。
 *   - 獲取節點參數、憑證和輸入資料。
 *   - 建立 Neo4j Driver 和 Session。
 *   - (推薦) 建立一個封裝了查詢執行、結果處理和錯誤處理的 Cypher 執行器。
 *   - 根據使用者選擇的 'operation'，將執行委派給對應的 `*.operation.ts` 檔案。
 *   - 將必要的上下文 (如 Cypher 執行器、Session、輸入資料) 傳遞給操作檔案。
 *   - 處理最終的結果回傳和 Session/Driver 的關閉。
 *
 * 實作要點:
 *   - 獲取 `operation` 參數。
 *   - 獲取 `neo4jApi` 憑證。
 *   - 使用 `neo4j-driver` 建立 `driver` 和 `session`。**注意:** 需要妥善處理連線錯誤。
 *   - (推薦) 實作 `runCypherQuery` 函式 (可能放在 helpers/utils.ts)，用於執行 Cypher、處理參數、轉換 Neo4j 結果為 JSON、處理錯誤、管理交易 (read/write)。
 *   - 使用 `switch` 或物件映射，根據 `operation` 的值，動態地 `import` 或調用對應操作模組的 `execute` 方法。
 *   - 使用 `try...finally` 確保 Session 和 Driver 在執行結束或出錯時被關閉。
 *   - 處理 `continueOnFail` 選項，如果啟用，則捕獲單個項目的錯誤並使用 `prepareErrorItem` 格式化輸出。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/actions/router.ts` 的整體流程：獲取參數 -> 建立連線/執行器 -> 分發操作 -> 回傳結果。
 *   - `configurePostgres` 和 `configureQueryRunner` 的概念，應用於建立 Neo4j Driver/Session 和 `runCypherQuery` 執行器。
 *   - `switch` 語句分發操作的模式。
 *   - 錯誤處理和 `continueOnFail` 的處理方式。
 *
 */
import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j from 'neo4j-driver'; // 引入 neo4j-driver

// 匯入操作模組 (這裡先用註解代替，實際應根據 operation 動態載入或使用映射)
// import * as executeQuery from './executeQuery.operation';
// import * as createNode from './createNode.operation';
// ... 其他操作 ...

// 匯入輔助函式和介面
import type { Neo4jApiCredentials, Neo4jNodeOptions } from '../helpers/interfaces';
import { runCypherQuery, parseNeo4jError, prepareErrorItem } from '../helpers/utils'; // 假設這些函式存在於 utils.ts

// 匯入所有操作的 execute 方法 (另一種分發方式)
import * as operations from './operations';

export async function router(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	let returnData: INodeExecutionData[] = [];

	// 獲取操作和通用選項
	const operation = this.getNodeParameter('operation', 0) as string;
	const nodeOptions = this.getNodeParameter('options', 0, {}) as Neo4jNodeOptions; // 通用選項，例如 continueOnFail
	const node = this.getNode();
	nodeOptions.nodeVersion = node.typeVersion; // 添加節點版本資訊

	// 獲取憑證
	const credentials = await this.getCredentials<Neo4jApiCredentials>('neo4jApi');
	if (!credentials) {
		throw new NodeOperationError(node, 'Neo4j credentials are not configured!', { itemIndex: 0 });
	}

	// 建立 Neo4j Driver 和 Session
	let driver: neo4j.Driver | undefined;
	let session: neo4j.Session | undefined;

	try {
		driver = neo4j.driver(
			credentials.uri,
			neo4j.auth.basic(credentials.username, credentials.password),
			// 可以添加更多 driver 配置, e.g., { encrypted: 'ENCRYPTION_ON', trust: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES' }
		);
		// 可以選擇性地驗證連線
		await driver.verifyConnectivity();

		session = driver.session({ database: credentials.database || 'neo4j' }); // 使用指定的 database

		// ---------------------------------------------------------------------
		// 根據 operation 分發任務
		// ---------------------------------------------------------------------
		const operationExecutor = operations[operation]?.execute; // 從 operations 模組獲取對應的 execute 方法

		if (!operationExecutor) {
			throw new NodeOperationError(node, `The operation "${operation}" is not supported!`, {
				itemIndex: 0,
			});
		}

		// 執行操作邏輯 (將 session 和 runCypherQuery 傳遞下去)
		// 注意：這裡假設 runCypherQuery 處理了 continueOnFail 的邏輯
		returnData = await operationExecutor.call(this, session, runCypherQuery, items, nodeOptions);

		// ---------------------------------------------------------------------

	} catch (error) {
		// 解析並拋出 Neo4j 錯誤
		throw parseNeo4jError(node, error, operation); // 假設 parseNeo4jError 存在
	} finally {
		// 確保關閉 Session 和 Driver
		if (session) {
			await session.close();
		}
		if (driver) {
			await driver.close();
		}
	}

	// 返回 n8n 格式的結果
	return this.prepareOutputData(returnData);
}
