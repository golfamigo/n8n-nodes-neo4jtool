// @ts-nocheck
/**
 * =============================================================================
 * 動態選項載入方法 (methods/loadOptions.ts)
 * =============================================================================
 *
 * 目的:
 *   - 提供方法供 n8n 節點 UI 的 'options' 或 'multiOptions' 類型參數調用，以動態獲取選項列表。
 *   - 例如，可以從 Neo4j 資料庫中查詢現有的節點標籤、關係類型或屬性鍵。
 *   - 在 `Neo4j.node.ts` 中被註冊到 `methods` 物件下。
 *
 * 實作要點:
 *   - 導出多個函式，每個函式對應一種需要動態載入的選項 (e.g., `getNodeLabels`, `getRelationshipTypes`, `getPropertyKeys`)。
 *   - 函式簽名應符合 `ILoadOptionsFunctions` 的要求。
 *   - 從 `this.getCredentials()` 獲取憑證。
 *   - 建立 Driver 和 Session (與 `credentialTest` 類似，需要處理連線和關閉)。
 *   - 執行特定的 Cypher 查詢來獲取所需的列表：
 *     - 獲取標籤: `CALL db.labels() YIELD label RETURN label`
 *     - 獲取關係類型: `CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType`
 *     - 獲取屬性鍵: `CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey` (可能需要針對特定標籤或類型查詢)
 *   - 處理查詢結果，將返回的字串列表轉換為 n8n `INodePropertyOptions` 陣列 (`{ name: value, value: value }`)。
 *   - 處理可能發生的錯誤，返回空陣列或錯誤提示。
 *   - **注意效能:** 這些查詢可能會在使用者與 UI 互動時頻繁調用，應確保查詢效率，並考慮快取結果 (如果適用)。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/methods/loadOptions.ts` 的結構和實作方式。
 *   - 如何執行查詢並將結果轉換為 `INodePropertyOptions[]`。
 *   - 錯誤處理和連線管理。
 *
 */
import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import neo4j from 'neo4j-driver';

// 假設的輔助函式和介面
import type { Neo4jApiCredentials } from '../helpers/interfaces';
import { parseNeo4jError } from '../helpers/utils'; // 需要錯誤解析

// --- 獲取節點標籤列表 ---
export async function getNodeLabels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const credentials = await this.getCredentials<Neo4jApiCredentials>('neo4jApi');
	if (!credentials) return []; // 沒有憑證則返回空

	let driver: neo4j.Driver | undefined;
	let session: neo4j.Session | undefined;
	try {
		driver = neo4j.driver(credentials.uri, neo4j.auth.basic(credentials.username, credentials.password), { connectionTimeout: 3000 });
		session = driver.session({ database: credentials.database || 'neo4j', defaultAccessMode: neo4j.session.READ });

		const result = await session.run('CALL db.labels() YIELD label RETURN label ORDER BY label');

		return result.records.map((record) => {
			const label = record.get('label') as string;
			return { name: label, value: label };
		});

	} catch (error) {
		// 在控制台記錄詳細錯誤，但只向 UI 返回空列表或簡單提示
		console.error("Error loading Neo4j labels:", parseNeo4jError(this.getNode() as any, error, 'loadOptions:getNodeLabels').message);
		// 可以返回一個固定的錯誤選項
		// return [{ name: 'Error loading labels', value: '__error__' }];
		return []; // 返回空列表，避免 UI 出錯
	} finally {
		if (session) await session.close();
		if (driver) await driver.close();
	}
}

// --- 獲取關係類型列表 ---
export async function getRelationshipTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const credentials = await this.getCredentials<Neo4jApiCredentials>('neo4jApi');
	if (!credentials) return [];

	let driver: neo4j.Driver | undefined;
	let session: neo4j.Session | undefined;
	try {
		driver = neo4j.driver(credentials.uri, neo4j.auth.basic(credentials.username, credentials.password), { connectionTimeout: 3000 });
		session = driver.session({ database: credentials.database || 'neo4j', defaultAccessMode: neo4j.session.READ });

		const result = await session.run('CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType');

		return result.records.map((record) => {
			const relType = record.get('relationshipType') as string;
			return { name: relType, value: relType };
		});

	} catch (error) {
		console.error("Error loading Neo4j relationship types:", parseNeo4jError(this.getNode() as any, error, 'loadOptions:getRelationshipTypes').message);
		return [];
	} finally {
		if (session) await session.close();
		if (driver) await driver.close();
	}
}

// --- 獲取屬性鍵列表 (可以根據節點標籤過濾) ---
// 注意：這個查詢可能比較慢，取決於資料庫大小
export async function getPropertyKeys(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
    // 可以通過 this.getNodeParameter('labels', 0) 獲取當前輸入的標籤來過濾屬性鍵，但這裡先獲取全部
	const credentials = await this.getCredentials<Neo4jApiCredentials>('neo4jApi');
	if (!credentials) return [];

	let driver: neo4j.Driver | undefined;
	let session: neo4j.Session | undefined;
	try {
		driver = neo4j.driver(credentials.uri, neo4j.auth.basic(credentials.username, credentials.password), { connectionTimeout: 3000 });
		session = driver.session({ database: credentials.database || 'neo4j', defaultAccessMode: neo4j.session.READ });

        // 獲取所有屬性鍵可能較慢，實際應用中可能需要優化或限制範圍
		const result = await session.run('CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey ORDER BY propertyKey');

		return result.records.map((record) => {
			const propKey = record.get('propertyKey') as string;
			return { name: propKey, value: propKey };
		});

	} catch (error) {
		console.error("Error loading Neo4j property keys:", parseNeo4jError(this.getNode() as any, error, 'loadOptions:getPropertyKeys').message);
		return [];
	} finally {
		if (session) await session.close();
		if (driver) await driver.close();
	}
}

// 將需要註冊的方法匯出，以便 Neo4j.node.ts 引用
export const loadOptions = {
	getNodeLabels,
	getRelationshipTypes,
	getPropertyKeys,
};
