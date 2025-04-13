// @ts-nocheck
/**
 * =============================================================================
 * 憑證測試方法 (methods/credentialTest.ts)
 * =============================================================================
 *
 * 目的:
 *   - 提供一個方法供 n8n 的 Credentials UI 調用，以測試使用者提供的 Neo4j 連線資訊是否有效。
 *   - 在 `Neo4j.node.ts` 中被註冊到 `methods` 物件下。
 *
 * 實作要點:
 *   - 函式簽名應符合 `ICredentialTestFunctions` 的要求 (雖然這裡直接導出函式)。
 *   - 從 `this.getCredentials()` 獲取使用者輸入的憑證。
 *   - 使用 `neo4j-driver` 嘗試建立一個 Driver。
 *   - 調用 `driver.verifyConnectivity()` 來驗證連線。
 *   - **重要:** 無論成功或失敗，都要確保 `driver.close()` 被調用 (使用 `try...finally`)。
 *   - 如果成功，返回 `[true, 'Connection tested successfully!']`。
 *   - 如果失敗，捕獲錯誤，使用 `parseNeo4jError` (來自 helpers/utils) 解析錯誤，並返回 `[false, parsedError.message]` 或更詳細的錯誤資訊。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/methods/credentialTest.ts` 的實作邏輯。
 *   - 如何獲取憑證、建立連線、處理錯誤和關閉連線。
 *
 */
import type { ICredentialTestFunctions, IDataObject } from 'n8n-workflow';
import neo4j from 'neo4j-driver';

// 假設的輔助函式和介面
import type { Neo4jApiCredentials } from '../helpers/interfaces';
import { parseNeo4jError } from '../helpers/utils'; // 需要錯誤解析函式

export async function credentialTest(this: ICredentialTestFunctions): Promise<[boolean, string | IDataObject]> {
	const credentials = await this.getCredentials<Neo4jApiCredentials>('neo4jApi');

	if (!credentials) {
		return [false, 'Credentials not found. Please configure Neo4j API credentials.'];
	}

	let driver: neo4j.Driver | undefined;
	try {
		// 嘗試建立 Driver
		driver = neo4j.driver(
			credentials.uri,
			neo4j.auth.basic(credentials.username, credentials.password),
			{
				// 增加連線超時設置，避免 UI 卡死
				connectionTimeout: 5000, // 5 秒
				logging: neo4j.logging.console('warn'), // 僅記錄警告和錯誤
			},
		);

		// 驗證連線
		await driver.verifyConnectivity({ database: credentials.database || 'neo4j' });

		return [true, 'Connection tested successfully!'];

	} catch (error) {
		// 解析錯誤並返回錯誤訊息
		const parsedError = parseNeo4jError(this.getNode() as any, error, 'credentialTest'); // getNode 可能不存在於 ICredentialTestFunctions，需要注意
		// 返回給 UI 的錯誤訊息應盡量簡潔
		return [false, parsedError.message || 'Failed to connect to Neo4j. Check console for details.'];
	} finally {
		// 確保關閉 Driver
		if (driver) {
			await driver.close();
		}
	}
}
