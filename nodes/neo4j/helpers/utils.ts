import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeExecutionData,
	NodeParameterValue,
} from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow';
import type {
	Session,
	Record as Neo4jRecord,
	Node as Neo4jNode,
	Relationship as Neo4jRelationship,
	Integer as Neo4jInteger,
	Date as Neo4jDate,
	DateTime as Neo4jDateTime,
	Time as Neo4jTime,
	Duration as Neo4jDuration,
	Point as Neo4jPoint,
	ManagedTransaction,
	QueryResult,
	LocalDateTime,
	LocalTime,
} from 'neo4j-driver';
import neo4j, { Neo4jError } from 'neo4j-driver';
import { DateTime } from 'luxon'; // Import DateTime from luxon

import type { CypherRunner } from './interfaces';

// --- 基礎工具 ---

export function evaluateExpression(expression: NodeParameterValue | undefined): any {
	if (expression === undefined) {
		return undefined;
	} else if (expression === null) {
		return null;
	} else {
		if (typeof expression === 'object') {
			return expression;
		}
		return expression;
	}
}

export async function parseJsonParameter(this: IExecuteFunctions, param: string | IDataObject, itemIndex: number): Promise<IDataObject> {
	let parsedParam: IDataObject;
	if (typeof param === 'string') {
		try {
			// Handle empty string explicitly, return empty object
			if (param.trim() === '') {
				return {};
			}
			parsedParam = jsonParse(param);
		} catch (error) {
			const node = this.getNode();
			throw new NodeOperationError(node, `Parameter JSON is invalid: ${error.message}`, { itemIndex });
		}
	} else {
		parsedParam = param;
	}

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
			if (obj.startsWith('={{') && obj.endsWith('}}')) {
				return this.evaluateExpression(obj.slice(2, -2), itemIndex);
			}
		}
		return obj;
	};

	return evaluateRecursively(parsedParam);
}


// --- Cypher 相關工具 ---

export function formatLabels(labelsRaw: string | string[] | undefined): string {
	if (!labelsRaw) {
		return '';
	}
	const labels = (Array.isArray(labelsRaw) ? labelsRaw : labelsRaw.split(','))
		.map(label => label.trim())
		.filter(label => label)
		.map(label => `\`${label.replace(/`/g, '``')}\``);

	return labels.length > 0 ? `:${labels.join(':')}` : '';
}

/**
 * Builds a Cypher properties string like {key1: $param1, key2: $param2}
 * suitable for CREATE or SET n = $props.
 * Returns the properties string and the parameters object.
 */
export function buildSetPropertiesClause(properties: IDataObject, paramPrefix = 'prop'): [string, IDataObject] {
	const setClauses: string[] = [];
	const parameters: IDataObject = {};
	let paramIndex = 0;

	for (const key in properties) {
		if (Object.prototype.hasOwnProperty.call(properties, key)) {
			const paramName = `${paramPrefix}_${key}_${paramIndex++}`;
			// Use backticks for property names
			setClauses.push(`\`${key.replace(/`/g, '``')}\`: $${paramName}`);
			parameters[paramName] = properties[key]; // TODO: Consider converting JS types to Neo4j types if needed
		}
	}

	if (setClauses.length === 0) {
		return ['', {}];
	}

	return [`{${setClauses.join(', ')}}`, parameters];
}

/**
 * Builds a Cypher WHERE clause string. Uses CONTAINS for strings, = for others.
 * suitable for MATCH, UPDATE, DELETE operations.
 * Returns the WHERE clause string (including 'WHERE') and the parameters object.
 */
export function buildWhereClause(properties: IDataObject, alias: string, paramPrefix = 'where_'): [string, IDataObject] {
	const conditions: string[] = [];
	const parameters: IDataObject = {};
	let paramIndex = 0;

	for (const key in properties) {
		if (Object.prototype.hasOwnProperty.call(properties, key)) {
			const paramName = `${paramPrefix}${key}_${paramIndex++}`;
			const value = properties[key]; // Get the value
			parameters[paramName] = value; // Assign value to parameters

			// Use backticks for alias and property names
			const propertyRef = `\`${alias}\`.\`${key.replace(/`/g, '``')}\``;

			// --- MODIFICATION START ---
			// Check value type to decide operator
			if (typeof value === 'string') {
				conditions.push(`${propertyRef} CONTAINS $${paramName}`); // Use CONTAINS for strings
			} else {
				conditions.push(`${propertyRef} = $${paramName}`); // Use = for other types (number, boolean, etc.)
			}
			// --- MODIFICATION END ---
		}
	}

	if (conditions.length === 0) {
		return ['', {}]; // No conditions, return empty WHERE clause
	}

	return [`WHERE ${conditions.join(' AND ')}`, parameters];
}


// --- Neo4j 結果轉換 ---

export function wrapNeo4jResult(records: Neo4jRecord[]): INodeExecutionData[] {
	if (!records || records.length === 0) {
		return [];
	}
	return records.map((record) => ({
		json: recordToObject(record),
	}));
}

function recordToObject(record: Neo4jRecord): IDataObject {
	const obj: IDataObject = {};
	const stringKeys = record.keys.filter(key => typeof key === 'string');
	stringKeys.forEach((key) => {
		obj[key] = convertNeo4jValueToJs(record.get(key));
	});
	return obj;
}

export function convertNeo4jValueToJs(value: any): any {
	if (value === null || value === undefined) {
		return null;
	}
	if (neo4j.isInt(value)) {
		const neo4jInt = value as Neo4jInteger;
		// 改進整數處理，保持一致的返回類型
		if (neo4jInt.inSafeRange()) {
			return neo4jInt.toNumber();
		} else {
			// 對於超出範圍的整數，返回標記的字符串
			return `int:${neo4jInt.toString()}`; // 標記為整數字符串
		}
	}
	if (value instanceof neo4j.types.Node) {
		const node = value as Neo4jNode;
		return {
			elementId: node.elementId,
			labels: node.labels,
			properties: mapProperties(node.properties),
		};
	}
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
	if (value instanceof neo4j.types.Path) {
		// 改進複雜結構處理
		return {
			segments: value.segments.map(segment => ({
				start: convertNeo4jValueToJs(segment.start),
				relationship: convertNeo4jValueToJs(segment.relationship),
				end: convertNeo4jValueToJs(segment.end),
			})),
			length: value.length,
			// 可以添加更多有用信息，例如 start 和 end 節點
			start: convertNeo4jValueToJs(value.start),
			end: convertNeo4jValueToJs(value.end),
		};
	}
	if (value instanceof neo4j.types.PathSegment) {
		// PathSegment 通常在 Path 內部處理，但如果單獨出現也轉換
		return {
			start: convertNeo4jValueToJs(value.start),
			relationship: convertNeo4jValueToJs(value.relationship),
			end: convertNeo4jValueToJs(value.end),
		};
	}
	if (neo4j.isDate(value)) return (value as Neo4jDate).toString();
	if (neo4j.isDateTime(value)) return (value as Neo4jDateTime).toString();
	if (neo4j.isLocalDateTime(value)) return (value as LocalDateTime).toString();
	if (neo4j.isTime(value)) return (value as Neo4jTime).toString();
	if (neo4j.isLocalTime(value)) return (value as LocalTime).toString();
	if (neo4j.isDuration(value)) return (value as Neo4jDuration).toString();
	if (neo4j.isPoint(value)) {
		const point = value as Neo4jPoint;
		const coords: IDataObject = { srid: point.srid.toNumber(), x: point.x, y: point.y };
		if (point.z !== undefined) {
			coords.z = point.z;
		}
		return coords;
	}
	if (Array.isArray(value)) {
		return value.map(convertNeo4jValueToJs);
	}
	if (value instanceof Map) {
		 const obj: IDataObject = {};
		 value.forEach((v, k) => {
			 obj[k] = convertNeo4jValueToJs(v);
		 });
		 return obj;
	}
	if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
		return mapProperties(value);
	}
	return value;
}

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

export function parseNeo4jError(node: INode | null, error: any, operation?: string): NodeOperationError {
	let message = 'Neo4j Error';
	let description = error instanceof Error ? error.message : 'An unknown error occurred';
	const code = error?.code;
	const itemIndex = (error as any).itemIndex !== undefined ? (error as any).itemIndex : undefined; // 確保 itemIndex 正確傳遞

	if (error instanceof Neo4jError) {
		message = error.message.split('\n')[0]; // Use first line as concise message
		description = error.message; // Full message as description

		// 添加更多錯誤代碼處理 (來自說明書)
		if (code?.startsWith('Neo.TransientError.Transaction.')) {
			message = 'Transaction error (temporary)';
			description = `暫時性交易錯誤，可重試操作。詳情: ${error.message}`;
		} else if (code?.startsWith('Neo.TransientError.Cluster.')) {
			message = 'Cluster synchronization error';
			description = `叢集同步錯誤，請稍後重試。詳情: ${error.message}`;
		} else if (code?.startsWith('Neo.ClientError.Transaction.')) {
			message = 'Transaction constraint error';
			description = `交易約束錯誤，請檢查數據一致性。詳情: ${error.message}`;
		}
		// 保留原有錯誤處理
		else if (code === 'Neo.ClientError.Security.Unauthorized' || message.includes('Authentication failure')) {
			message = 'Authentication failed';
			description = 'Please check your Neo4j credentials (URI, username, password).';
		} else if (code === 'Neo.ClientError.Security.Forbidden') {
			message = 'Permission denied';
			description = 'The provided credentials do not have permission to perform this operation.';
		} else if (code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
			message = 'Constraint violation';
			description = `A database constraint was violated. Details: ${error.message}`;
		} else if (code?.startsWith('Neo.ClientError.Statement.')) {
			message = 'Cypher statement error';
		}
	} else if (error instanceof Error) {
		message = error.message;
		description = error.stack || error.message;
		if (message.includes('ECONNREFUSED')) {
			message = 'Connection refused';
			description = `Could not connect to Neo4j using the provided credentials. Ensure Neo4j is running and the URI is correct.`;
		} else if (message.includes('ENOTFOUND') || message.includes('DNS lookup failed')) {
			message = 'Host not found';
			description = `Could not resolve the Neo4j host. Check the hostname in the URI.`;
		} else if (message.includes('ETIMEDOUT') || message.includes('Connection timed out')) {
			message = 'Connection timed out';
			description = `Connection attempt to Neo4j timed out. Check network connectivity and firewall rules.`;
		}
	}

	const errorNode = node ?? { id: 'default-neo4j-node', name: 'Neo4jNode', type: 'N8nNeo4j', typeVersion: 1, position: [0, 0], parameters: {}, credentials: {} }; // Added default id

	// Ensure 'description' holds the detailed message/stack, and 'message' holds the concise summary.
	const finalDescription = error instanceof Error ? (error.stack || error.message) : description;
	const finalContextMessage = message; // 'message' variable holds the concise summary determined above

	return new NodeOperationError(errorNode, finalDescription, { // Pass detailed description as main message
		message: finalContextMessage, // Pass concise summary to context
		// description: finalDescription, // No need to duplicate description in context
		itemIndex: itemIndex,
	});
}

// --- 新增輔助函數 (來自說明書) ---
export function prepareQueryParams(parameters: IDataObject): IDataObject {
  const preparedParams: IDataObject = {};

  for (const [key, value] of Object.entries(parameters)) {
    if (value === null || value === undefined) {
      preparedParams[key] = null;
      continue;
    }

    // 處理不同類型的參數
    if (typeof value === 'number') {
      // 使用安全整數檢查
      if (Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
         preparedParams[key] = neo4j.int(value);
      } else {
         // 非安全整數或非整數數值保持不變 (Neo4j 驅動程序可以處理浮點數)
         preparedParams[key] = value;
      }
    } else if (value instanceof Date) {
      // 轉換 JS Date 為 Neo4j DateTime
      preparedParams[key] = neo4j.types.DateTime.fromStandardDate(value);
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value)) {
      // 嘗試解析 ISO 8601 日期時間字符串
      try {
        // 使用 Luxon 解析 ISO 字符串以保留 UTC 或偏移量
        const dt = DateTime.fromISO(value, { setZone: true });
        if (dt.isValid) {
           // 轉換為 Neo4j DateTime
           preparedParams[key] = new neo4j.types.DateTime(
             dt.year, dt.month, dt.day,
             dt.hour, dt.minute, dt.second, dt.millisecond * 1_000_000, // nanoseconds
             dt.offset * 60 // timezone offset in seconds
           );
        } else {
           preparedParams[key] = value; // 解析失敗則保持原始值
        }
      } catch (e) {
        preparedParams[key] = value; // 轉換失敗則保持原始值
      }
    } else {
      preparedParams[key] = value; // 其他類型保持不變
    }
  }

  return preparedParams;
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
		// 添加參數預處理 (來自說明書)
		const preparedParams = prepareQueryParams(parameters);

		// Add debug logging for query and PREPARED parameters
		this.logger.debug(`Running Cypher query: ${query}`);
		this.logger.debug(`With prepared parameters: ${JSON.stringify(preparedParams)}`); // Log prepared params

		// Specifically log booking_mode if present in prepared params
		if (preparedParams.booking_mode !== undefined) {
			this.logger.info(`booking_mode parameter value: ${preparedParams.booking_mode}`);
		}

		let result: QueryResult;
		const transactionFunction = async (tx: ManagedTransaction) => {
			// 使用處理後的參數
			return await tx.run(query, preparedParams);
		};

		if (isWriteQuery) {
			result = await session.executeWrite(transactionFunction);
		} else {
			result = await session.executeRead(transactionFunction);
		}

		const executionData = wrapNeo4jResult(result.records);

		// Log the first result to debug booking_mode issues
		if (executionData.length > 0 && executionData[0].json.business) {
			this.logger.info(`Result business node: ${JSON.stringify(executionData[0].json.business)}`);
		}

		return executionData.map(item => ({ ...item, pairedItem: { item: itemIndex } }));

	} catch (error) {
        (error as any).itemIndex = itemIndex;
		// Throw a new Error containing the original message to potentially avoid issues with non-standard error objects
		const errorMessage = error instanceof Error ? error.message : String(error);
		const newError = new Error(`Error executing Cypher for item ${itemIndex}: ${errorMessage}`);
		// Preserve stack trace if possible, though this might be difficult across re-throws
		if (error instanceof Error && error.stack) {
			(newError as any).originalStack = error.stack;
		}
		(newError as any).originalError = error; // Attach original error for inspection if needed
		(newError as any).itemIndex = itemIndex; // Ensure itemIndex is preserved
		throw newError;
	}
};
