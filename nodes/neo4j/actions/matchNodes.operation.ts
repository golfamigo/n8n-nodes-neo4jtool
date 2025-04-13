import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver'; // For neo4j.int

// Import helpers and types
import type { Neo4jNodeOptions } from '../helpers/interfaces';
import { parseJsonParameter, formatLabels, buildWhereClause, runCypherQuery, parseNeo4jError } from '../helpers/utils';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'Match Labels',
		name: 'matchLabels',
		type: 'string',
		default: '',
		placeholder: 'Person, User (optional)',
		description: 'Comma-separated labels to match. If empty, matches nodes with any label.',
		displayOptions: {
			show: {
				operation: ['matchNodes'],
			},
		},
	},
	{
		displayName: 'Match Properties',
		name: 'matchProperties',
		type: 'json',
		default: '{}',
		placeholder: '{"email": "{{ $json.email }}", "status": "active"} (optional)',
		description: 'Properties to match (JSON object). Values can be n8n expressions. Leave empty to match based only on labels',
		displayOptions: {
			show: {
				operation: ['matchNodes'],
			},
		},
	},
	{
		displayName: 'Return Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: {
				operation: ['matchNodes'],
			},
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['matchNodes'],
			},
		},
		options: [
			// Add matchNodes specific options here if needed
		],
	},
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	session: Session, // Passed from router
	items: INodeExecutionData[],
	nodeOptions: Neo4jNodeOptions, // General node options (though continueOnFail is checked via this.continueOnFail)
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			// Get parameters for the current item
			const matchLabelsRaw = this.getNodeParameter('matchLabels', i, '') as string;
			const matchPropertiesRaw = this.getNodeParameter('matchProperties', i, '{}') as string | IDataObject;
			const limitRaw = this.getNodeParameter('limit', i, 50);

			// Format labels
			const labelsFormatted = formatLabels(matchLabelsRaw);

			// Parse and evaluate properties
			const matchProperties = await parseJsonParameter.call(this, matchPropertiesRaw, i);

			// Build Cypher query
			let query = `MATCH (n${labelsFormatted})`;
			let parameters: IDataObject = {};

			// Add WHERE clause if properties are provided
			const [whereClause, whereParams] = buildWhereClause(matchProperties, 'n', 'match_');
			if (whereClause) {
				query += ` ${whereClause}`;
				parameters = { ...parameters, ...whereParams };
			}

			// Add RETURN clause
			query += ' RETURN elementId(n) AS elementId, labels(n) AS labels, properties(n) AS properties';

			// Add LIMIT clause
			const limit = neo4j.int(limitRaw);
			query += ' LIMIT $limit';
			parameters.limit = limit;


			// Call the generic Cypher runner (MATCH is always a read operation)
			const resultData = await runCypherQuery.call(this, session, query, parameters, false, i);

			// Merge results
			allResults.push(...resultData);

		} catch (error) {
			// Handle continueOnFail or re-throw
			// Corrected: Use this.continueOnFail(error)
			if (this.continueOnFail(error)) {
				const node = this.getNode();
				const parsedError = parseNeo4jError(node, error, 'matchNodes');
				const errorItemIndex = (error as any).itemIndex ?? i;
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(node, parsedError.message, { itemIndex: errorItemIndex, description: parsedError.description ?? undefined }),
					pairedItem: { item: i },
				});
				continue;
			}
			throw parseNeo4jError(this.getNode(), error, 'matchNodes');
		}
	}

	return allResults;
}
