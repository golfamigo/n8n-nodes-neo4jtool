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
		description: 'Labels of the nodes to update (optional)',
		displayOptions: {
			show: {
				operation: ['updateNode'],
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
		description: 'Properties to find the nodes to update (JSON object, required). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['updateNode'],
			},
		},
	},
	{
		displayName: 'Update Mode',
		name: 'updateMode',
		type: 'options',
		options: [
			{
				name: 'Merge',
				value: 'merge',
				description: 'Add new properties and update existing ones (SET n += $props)',
			},
			{
				name: 'Set (Replace)',
				value: 'set',
				description: 'Replace all existing properties with the new ones (SET n = $props)',
			},
		],
		default: 'merge',
		description: 'How to apply the new properties',
		displayOptions: {
			show: {
				operation: ['updateNode'],
			},
		},
	},
	{
		displayName: 'Update Properties',
		name: 'updateProperties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"status": "updated", "lastModified": "{{ $now.toISO() }}"}',
		description: 'Properties to set or merge onto the matched nodes (JSON object). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['updateNode'],
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
				operation: ['updateNode'],
			},
		},
		options: [
			{
				displayName: 'Return Data',
				name: 'returnData',
				type: 'boolean',
				default: true,
				description: 'Whether to return the updated node\'s element ID and properties',
			},
			// Add other updateNode specific options here if needed
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
			const updateMode = this.getNodeParameter('updateMode', i, 'merge') as 'merge' | 'set';
			const updatePropertiesRaw = this.getNodeParameter('updateProperties', i, '{}') as string | IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const shouldReturnData = options.returnData !== false;

			// Parse and evaluate match properties
			const matchProperties = await parseJsonParameter.call(this, matchPropertiesRaw, i);
			if (Object.keys(matchProperties).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Match Properties cannot be empty for update operation to prevent accidental mass updates.', { itemIndex: i });
			}

			// Parse and evaluate update properties
			const updateProperties = await parseJsonParameter.call(this, updatePropertiesRaw, i);
			if (Object.keys(updateProperties).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Update Properties cannot be empty.', { itemIndex: i });
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


			// Add SET clause
			const setOperator = updateMode === 'merge' ? '+=' : '=';
			query += ` SET n ${setOperator} $updateProps`;
			parameters.updateProps = updateProperties;

			// Add RETURN clause
			if (shouldReturnData) {
				query += ' RETURN elementId(n) AS elementId, labels(n) AS labels, properties(n) AS properties';
			}

			// Call the generic Cypher runner (UPDATE is always a write operation)
			const resultData = await runCypherQuery.call(this, session, query, parameters, true, i);

			// Merge results
			allResults.push(...resultData);

		} catch (error) {
			// Handle continueOnFail or re-throw
			// Corrected: Use this.continueOnFail(error)
			if (this.continueOnFail(error)) {
				const node = this.getNode();
				const parsedError = parseNeo4jError(node, error, 'updateNode');
				const errorItemIndex = (error as any).itemIndex ?? i;
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(node, parsedError.message, { itemIndex: errorItemIndex, description: parsedError.description ?? undefined }),
					pairedItem: { item: i },
				});
				continue;
			}
			// If not continueOnFail, re-throw the parsed error
			throw parseNeo4jError(this.getNode(), error, 'updateNode');
		}
	}

	return allResults;
}
