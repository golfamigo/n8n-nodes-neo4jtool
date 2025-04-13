// @ts-nocheck
/**
 * =============================================================================
 * 通用輔助函式 (helpers/utils.ts)
 * =============================================================================
 *
 * 目的:
 *   - 提供可在節點不同部分重用的輔助函式。
 *   - 封裝常用邏輯，如資料轉換、字串處理、錯誤處理、Cypher 片段生成等。
 *   - 保持主要邏輯檔案 (router, operations) 的簡潔性。
 *
 * 實作要點 (基於之前的分析和 Neo4j 需求):
 *   - `evaluateExpression(expression)`: 將 n8n 參數值安全地轉換為字串或 JSON 字串。
 *   - `parseJsonParameter(this, param, itemIndex)`: 解析 JSON 字串參數，並遞迴地評估其中的 n8n 運算式。
 *   - `formatLabels(labelsRaw)`: 將逗號分隔的標籤字串轉換為 Cypher 格式 (e.g., ':Label1:Label2')。
 *   - `buildMatchPropertiesClause(properties, alias, paramPrefix)`: 根據屬性物件動態生成 Cypher 的 WHERE 子句和參數物件 (e.g., "WHERE alias.prop1 = $prefix_prop1 AND alias.prop2 = $prefix_prop2")。
 *   - `wrapNeo4jResult(records)`: 將 neo4j-driver 返回的 `Record` 陣列轉換為 n8n 的 `INodeExecutionData[]` 格式。需要處理 Neo4j 特有類型 (Integer, Node, Relationship, Path, Date/Time)。
 *   - `prepareErrorItem(items, error, index)`: 為失敗的項目創建標準錯誤輸出。
 *   - `parseNeo4jError(node, error, operation)`: 解析 `Neo4jError`，提供更友善的錯誤訊息。
 *   - `runCypherQuery(this, session, query, parameters, isWriteQuery, itemIndex)`: **核心執行器函式**。
 *     - 接收 Session、查詢、參數、讀寫提示、索引。
 *     - 根據 `isWriteQuery` 選擇 `session.executeWrite()` 或 `session.executeRead()`。
 *     - 在交易函式內部執行 `tx.run(query, parameters)`。
 *     - 處理 `tx.run` 的結果 (`Result` 物件)，提取 `records`。
 *     - 調用 `wrapNeo4jResult` 轉換結果。
 *     - 捕獲執行期間的錯誤，調用 `parseNeo4jError`。
 *     - 返回 `INodeExecutionData[]`。
 *   - (可選) `convertValueToNeo4j(value)`: 將 JavaScript 值轉換為 Neo4j Driver 接受的類型 (例如，處理 Date 物件)。
 *   - (可選) `convertNeo4jValueToJs(value)`: 在 `wrapNeo4jResult` 中使用，將 Neo4j 特有類型轉換為 JS/JSON 友善的格式 (e.g., Neo4j Integer -> number or string, Node -> { elementId, labels, properties })。
 *
 * 參考 Postgres V2:
 *   - `Postgres/v2/helpers/utils.ts` 中的各種輔助函式，特別是：
 *     - `evaluateExpression`, `stringToArray` (概念)
 *     - `wrapData` (對應 `wrapNeo4jResult`)
 *     - `prepareErrorItem`
 *     - `parsePostgresError` (對應 `parseNeo4jError`)
 *     - `addWhereClauses` (對應 `buildMatchPropertiesClause`)
 *     - `configureQueryRunner` (對應 `runCypherQuery` 的概念)
 *     - `checkItemAgainstSchema`, `getTableSchema` (Neo4j 可能不需要這麼複雜的 schema 處理，但資料轉換是必要的)
 *
 */
import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeExecutionData,
	NodeParameterValue,
} from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow';
import type { Session, Record as Neo4jRecord, Node as Neo4jNode, Relationship as Neo4jRelationship, Path as Neo4jPath, Integer as Neo4jInteger, Date as Neo4jDate, DateTime as Neo4jDateTime, Time as Neo4jTime, Duration as Neo4jDuration, Point as Neo4jPoint } from 'neo4j-driver';
import neo4j from 'neo4j-driver'; // 需要 driver 的類型和方法

import type { CypherRunner } from './interfaces'; // 引入類型定義

// --- 基礎工具 ---

export function evaluateExpression(expression: NodeParameterValue | undefined): any {
	if (expression === undefined) {
		return undefined; // 或者返回 null 或 '' 取決於上下文
	} else if (expression === null) {
		return null;
	} else {
		// 保留物件和陣列的原樣，字串化其他類型
		if (typeof expression === 'object') {
			return expression; // JSON編輯器等會直接返回物件/陣列
		}
		return expression; // 其他基本類型直接返回
		// 注意：這裡不再強制 stringify，因為參數可能是數字、布林等
	}
}

export async function parseJsonParameter(this: IExecuteFunctions, param: string | IDataObject, itemIndex: number): Promise<IDataObject> {
	let parsedParam: IDataObject;
	if (typeof param === 'string') {
		try {
			parsedParam = jsonParse(param); // 使用 n8n 的 jsonParse 處理可能的 undefined/null
		} catch (error) {
			throw new NodeOperationError(this.getNode(), `Parameter JSON is invalid: ${error.message}`, { itemIndex });
		}
	} else {
		parsedParam = param; // 已經是物件
	}

	// 遞迴評估物件/陣列中的表達式
	const evaluateRecursively = async (obj: any): Promise<any> => {
		if (Array.isArray(obj)) {
			return Promise.all(obj.map(evaluateRecursively));
		} else if (typeof obj === 'object' && obj !== null) {
			const newObj: IDataObject = {};
			for (const key in obj) {
				if (Object.prototype.hasOwnProperty.call(obj, key)) {
					newObj[key] = await evaluateRecursively(obj[key]);
				}
			}
			return newObj;
		} else if (typeof obj === 'string') {
			// 假設表達式格式為 {{ ... }}
			if (obj.startsWith('={{') && obj.endsWith('}}')) {
				return this.evaluateExpression(obj.slice(2, -2), itemIndex);
			}
			// 檢查是否需要評估整個字串作為表達式 (如果 n8n 版本支援)
			// return this.evaluateExpression(obj, itemIndex); // 根據需要調整
		}
		return obj; // 返回原始值 (非物件/陣列/表達式字串)
	};

	return evaluateRecursively(parsedParam);
}


export function formatLabels(labelsRaw: string): string {
	if (!labelsRaw || typeof labelsRaw !== 'string') {
		return '';
	}
	const labels = labelsRaw.split(',')
		.map(label => label.trim())
		.filter(label => label) // 移除空標籤
		.map(label => `\`${label.replace(/`/g, '``')}\``); // 使用反引號處理特殊字符，並轉義反引號本身

	return labels.length > 0 ? `:${labels.join(':')}` : '';
}

export function buildMatchPropertiesClause(properties: IDataObject, alias: string, paramPrefix = ''): [string, IDataObject] {
	const conditions: string[] = [];
	const parameters: IDataObject = {};
	let paramIndex = 0;

	for (const key in properties) {
		if (Object.prototype.hasOwnProperty.call(properties, key)) {
			const paramName = `${paramPrefix}${key}_${paramIndex++}`;
			// 使用反引號處理屬性名中的特殊字符
			conditions.push(`\`${alias}\`.\`${key.replace(/`/g, '``')}\` = $${paramName}`);
			parameters[paramName] = properties[key];
		}
	}

	if (conditions.length === 0) {
		return ['', {}]; // 沒有屬性，返回空 WHERE 子句
	}

	return [`WHERE ${conditions.join(' AND ')}`, parameters];
}


// --- Neo4j 結果轉換 ---

/**
 * 將 Neo4j Driver 返回的 Record 陣列轉換為 n8n 節點輸出格式
 */
export function wrapNeo4jResult(records: Neo4jRecord[]): INodeExecutionData[] {
	if (!records || records.length === 0) {
		return [];
	}
	return records.map((record) => ({
		json: recordToObject(record), // 將單個 Record 轉換為 JSON 物件
	}));
}

/**
 * 將單個 Neo4j Record 轉換為 key-value 的 JSON 物件
 */
function recordToObject(record: Neo4jRecord): IDataObject {
	const obj: IDataObject = {};
	record.keys.forEach((key) => {
		obj[key] = convertNeo4jValueToJs(record.get(key));
	});
	return obj;
}

/**
 * 遞迴地將 Neo4j 特有類型轉換為 JS/JSON 友善的格式
 */
function convertNeo4jValueToJs(value: any): any {
	if (value === null || value === undefined) {
		return null;
	}

	// Neo4j Integer (處理可能的溢出)
	if (neo4j.isInt(value)) {
		const neo4jInt = value as Neo4jInteger;
		if (neo4jInt.inSafeRange()) {
			return neo4jInt.toNumber();
		} else {
			// 對於超出安全範圍的整數，返回字串
			return neo4jInt.toString();
		}
	}

	// Neo4j Node
	if (value instanceof neo4j.types.Node) {
		const node = value as Neo4jNode;
		return {
			elementId: node.elementId,
			labels: node.labels,
			properties: mapProperties(node.properties),
		};
	}

	// Neo4j Relationship
	if (value instanceof neo4j.types.Relationship) {
		const rel = value as Neo4jRelationship;
		return {
			elementId: rel.elementId,
			startNodeElementId: rel.startNodeElementId,
			endNodeElementId: rel.endNodeElementId,
			type: rel.type,
			properties: mapProperties(rel.properties),
		};
	}

	// Neo4j Path / PathSegment (可能需要更複雜的處理)
	if (value instanceof neo4j.types.Path) {
		// 簡化處理：返回路徑段的陣列
		return value.segments.map(segment => ({
			start: convertNeo4jValueToJs(segment.start),
			relationship: convertNeo4jValueToJs(segment.relationship),
			end: convertNeo4jValueToJs(segment.end),
		}));
	}
	if (value instanceof neo4j.types.PathSegment) {
		return {
			start: convertNeo4jValueToJs(value.start),
			relationship: convertNeo4jValueToJs(value.relationship),
			end: convertNeo4jValueToJs(value.end),
		};
	}


	// Neo4j Date/Time Types (轉換為 ISO 字串)
	if (neo4j.isDate(value)) return (value as Neo4jDate).toString(); // YYYY-MM-DD
	if (neo4j.isDateTime(value)) return (value as Neo4jDateTime).toString(); // ISO 8601 with timezone
	if (neo4j.isLocalDateTime(value)) return (value as neo4j.types.LocalDateTime).toString(); // ISO 8601 without timezone
	if (neo4j.isTime(value)) return (value as Neo4jTime).toString(); // HH:MM:SS.sssssssss[+/-]HH:MM
	if (neo4j.isLocalTime(value)) return (value as neo4j.types.LocalTime).toString(); // HH:MM:SS.sssssssss
	if (neo4j.isDuration(value)) return (value as Neo4jDuration).toString(); // P...T... format

	// Neo4j Point (轉換為物件)
	if (neo4j.isPoint(value)) {
		const point = value as Neo4jPoint;
		const coords = { srid: point.srid.toNumber(), x: point.x, y: point.y };
		if (point.z !== undefined) {
			(coords as any).z = point.z;
		}
		return coords;
	}

	// 處理陣列: 遞迴轉換陣列中的每個元素
	if (Array.isArray(value)) {
		return value.map(convertNeo4jValueToJs);
	}

	// 處理物件 (Map): 遞迴轉換物件中的每個值
	if (typeof value === 'object' && value !== null && !(value instanceof Date)) { // 排除 JS Date
        // 檢查是否為 Map 類型 (Neo4j 屬性可能是 Map)
        if (value instanceof Map) {
             const obj: IDataObject = {};
             value.forEach((v, k) => {
                 obj[k] = convertNeo4jValueToJs(v);
             });
             return obj;
        }
        // 普通物件
		return mapProperties(value);
	}


	// 其他基本類型直接返回
	return value;
}

/**
 * 輔助函式：遞迴轉換屬性物件中的 Neo4j 值
 */
function mapProperties(properties: IDataObject): IDataObject {
	const mappedProps: IDataObject = {};
	for (const key in properties) {
		if (Object.prototype.hasOwnProperty.call(properties, key)) {
			mappedProps[key] = convertNeo4jValueToJs(properties[key]);
		}
	}
	return mappedProps;
}


// --- 錯誤處理 ---

export function prepareErrorItem(
	items: INodeExecutionData[],
	error: any, // 可以是 Error, NodeOperationError, 或其他
	index: number,
): INodeExecutionData {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const errorDetails = error instanceof NodeOperationError ? { ...error } : { message: errorMessage };

	return {
		json: {
			// 保留原始輸入數據，並添加錯誤信息
			...items[index].json,
			n8n_neo4j_error: errorMessage, // 添加特定前綴以避免衝突
			n8n_neo4j_error_details: errorDetails,
		},
		pairedItem: { item: index }, // 保持與輸入項目的關聯
	};
}

export function parseNeo4jError(node: INode, error: any, operation?: string): NodeOperationError {
	let message = 'Neo4j Error';
	let description = error.message || 'An unknown error occurred';
	const errorDetails: IDataObject = { code: error.code, operation }; // 包含錯誤碼和操作

	if (error.name === 'Neo4jError') {
		message = error.message.split('\n')[0]; // 取第一行作為主要訊息
		description = error.message; // 完整訊息作為描述
		errorDetails.code = error.code; // Neo4j 特定的錯誤碼 (e.g., Neo.ClientError.Schema.ConstraintValidationFailed)
		errorDetails.retriable = error.retriable;
	} else if (error instanceof Error) {
		message = error.message;
		description = error.stack || error.message;
	}

	// 針對常見錯誤提供更友善的提示
	if (error.code === 'Neo.ClientError.Security.Unauthorized' || message.includes('Authentication failure')) {
		message = 'Authentication failed';
		description = 'Please check your Neo4j credentials (URI, username, password).';
	} else if (error.code === 'Neo.ClientError.Security.Forbidden') {
        message = 'Permission denied';
        description = 'The provided credentials do not have permission to perform this operation.';
    } else if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
		message = 'Constraint violation';
		description = `A database constraint was violated. Details: ${error.message}`;
	} else if (error.code && error.code.startsWith('Neo.ClientError.Statement.')) { // 語法錯誤等
		message = 'Cypher statement error';
		description = error.message;
	} else if (message.includes('ECONNREFUSED')) {
		message = 'Connection refused';
		description = `Could not connect to Neo4j at ${error.address || 'the specified URI'}. Ensure Neo4j is running and the URI is correct.`;
	} else if (message.includes('ENOTFOUND') || message.includes('DNS lookup failed')) {
		message = 'Host not found';
		description = `Could not resolve the Neo4j host. Check the hostname in the URI.`;
	} else if (message.includes('ETIMEDOUT') || message.includes('Connection timed out')) {
		message = 'Connection timed out';
		description = `Connection attempt to Neo4j timed out. Check network connectivity and firewall rules.`;
	}

	return new NodeOperationError(node, description, { // 使用原始錯誤訊息作為 description
		message, // 提供簡化的 message
		description: error.message, // 將詳細的原始錯誤訊息放在 description
		itemIndex: (error as any).itemIndex, // 如果錯誤物件包含 itemIndex
		errorDetails,
	});
}


// --- 核心 Cypher 執行器 ---

export const runCypherQuery: CypherRunner = async function (
	this: IExecuteFunctions,
	session: Session,
	query: string,
	parameters: IDataObject,
	isWriteQuery: boolean,
	itemIndex: number,
): Promise<INodeExecutionData[]> {
	try {
		let result: neo4j.QueryResult;
		const transactionFunction = async (tx: neo4j.Transaction) => {
			return await tx.run(query, parameters);
		};

		if (isWriteQuery) {
			result = await session.executeWrite(transactionFunction);
		} else {
			result = await session.executeRead(transactionFunction);
		}

		// 轉換結果為 n8n 格式
		const executionData = wrapNeo4jResult(result.records);

		// 添加配對信息，以便與輸入項目關聯 (如果需要一對一輸出)
		return generatePairedItemData(itemIndex, executionData);
		// 如果不需要嚴格配對，可以直接返回 executionData

	} catch (error) {
		// 在這裡捕獲執行錯誤，附加 itemIndex，然後重新拋出
		// router 中的 catch 會處理 continueOnFail 或最終拋出
        (error as any).itemIndex = itemIndex; // 附加索引信息
		throw error; // 向上拋出，由 router 或 operation 的 try/catch 處理
	}
};
