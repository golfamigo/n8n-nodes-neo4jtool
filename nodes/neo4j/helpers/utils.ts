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
 * Builds a Cypher WHERE clause string like WHERE alias.key1 = $param1 AND alias.key2 = $param2
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
			// Use backticks for alias and property names
			conditions.push(`\`${alias}\`.\`${key.replace(/`/g, '``')}\` = $${paramName}`);
			parameters[paramName] = properties[key];
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
		return neo4jInt.inSafeRange() ? neo4jInt.toNumber() : neo4jInt.toString();
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

	if (error instanceof Neo4jError) {
		message = error.message.split('\n')[0];
		description = error.message;

		if (code === 'Neo.ClientError.Security.Unauthorized' || message.includes('Authentication failure')) {
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

	const errorNode = node ?? { name: 'Neo4jNode', type: 'N8nNeo4j', typeVersion: 1, position: [0, 0], parameters: {}, credentials: {} };

	return new NodeOperationError(errorNode, description, {
		message,
		description: error instanceof Error ? error.message : description,
		itemIndex: (error as any).itemIndex,
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
		let result: QueryResult;
		const transactionFunction = async (tx: ManagedTransaction) => {
			// Potentially convert JS types to Neo4j driver types here if needed before running
			// e.g., convert Date objects to neo4j.Date, etc.
			// For now, assume parameters are directly usable or driver handles conversion.
			return await tx.run(query, parameters);
		};

		if (isWriteQuery) {
			result = await session.executeWrite(transactionFunction);
		} else {
			result = await session.executeRead(transactionFunction);
		}

		const executionData = wrapNeo4jResult(result.records);

		return executionData.map(item => ({ ...item, pairedItem: { item: itemIndex } }));

	} catch (error) {
        (error as any).itemIndex = itemIndex;
		throw error;
	}
};
