import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { Session } from 'neo4j-driver';

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
		description: 'Labels of the nodes to delete (optional)',
		displayOptions: {
			show: {
				operation: ['deleteNode'],
			},
		},
	},
	{
		displayName: 'Match Properties',
		name: 'matchProperties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"ID": "{{ $json.ID }}"}',
		description: 'Properties to find the nodes to delete (JSON object, required). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['deleteNode'],
			},
		},
	},
	{
		displayName: 'Detach Relationships',
		name: 'detach',
		type: 'boolean',
		default: true,
		description: 'Whether to delete all relationships connected to the node before deleting the node itself (DETACH DELETE). If false, deleting a node with relationships will cause an error.',
		displayOptions: {
			show: {
				operation: ['deleteNode'],
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
				operation: ['deleteNode'],
			},
		},
		options: [
			{
				displayName: 'Return Delete Count',
				name: 'returnCount',
				type: 'boolean',
				default: false,
				description: 'Whether to return the count of deleted nodes',
			},
			// Add other deleteNode specific options here if needed
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
			const detach = this.getNodeParameter('detach', i, true) as boolean;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const shouldReturnCount = options.returnCount === true;

			// Parse and evaluate match properties
			const matchProperties = await parseJsonParameter.call(this, matchPropertiesRaw, i);
			if (Object.keys(matchProperties).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Match Properties cannot be empty for delete operation to prevent accidental mass deletes.', { itemIndex: i });
			}

			// Format labels
			const labelsFormatted = formatLabels(matchLabelsRaw);

			// Build Cypher query
			let query = `MATCH (n${labelsFormatted})`;
			let parameters: IDataObject = {};

			// Add WHERE clause using buildWhereClause
			const [whereClause, whereParams] = buildWhereClause(matchProperties, 'n', 'match_');
			if (whereClause) {
				query += ` ${whereClause}`;
				parameters = { ...parameters, ...whereParams };
			} else {
                 throw new NodeOperationError(this.getNode(), 'Failed to build WHERE clause from Match Properties.', { itemIndex: i });
            }

			// Add DELETE clause
			const deletePrefix = detach ? 'DETACH ' : '';
			query += ` ${deletePrefix}DELETE n`;

			// Add RETURN clause if requested
			if (shouldReturnCount) {
				query += ' RETURN count(n) AS deletedCount';
			}

			// Call the generic Cypher runner (DELETE is always a write operation)
			const resultData = await runCypherQuery.call(this, session, query, parameters, true, i);

			// Merge results
			allResults.push(...resultData);

		} catch (error) {
			// Handle continueOnFail or re-throw
			// Corrected: Use this.continueOnFail(error)
			if (this.continueOnFail(error)) {
				const node = this.getNode();
				const parsedError = parseNeo4jError(node, error, 'deleteNode');
				const errorItemIndex = (error as any).itemIndex ?? i;
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(node, parsedError.message, { itemIndex: errorItemIndex, description: parsedError.description ?? undefined }),
					pairedItem: { item: i },
				});
				continue;
			}
			// If not continueOnFail, re-throw the parsed error
			throw parseNeo4jError(this.getNode(), error, 'deleteNode');
		}
	}

	return allResults;
}
