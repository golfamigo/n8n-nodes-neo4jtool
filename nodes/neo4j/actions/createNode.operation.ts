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
import { parseJsonParameter, formatLabels, runCypherQuery, parseNeo4jError } from '../helpers/utils';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'Labels',
		name: 'labels',
		type: 'string', // Could also be 'multiOptions' with loadOptions: 'getNodeLabels'
		required: true,
		default: '',
		placeholder: 'Person, User',
		description: 'Comma-separated labels for the new node (e.g., Person, Customer)',
		displayOptions: {
			show: {
				operation: ['createNode'],
			},
		},
	},
	{
		displayName: 'Properties',
		name: 'properties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"name": "{{ $json.name }}", "email": "{{ $json.email }}", "createdAt": "{{ $now.toISO() }}"}',
		description: 'Properties for the new node (JSON object). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['createNode'],
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
				operation: ['createNode'],
			},
		},
		options: [
			{
				displayName: 'Return Data',
				name: 'returnData',
				type: 'boolean',
				default: true,
				description: 'Whether to return the created node\'s element ID and properties',
			},
			// Add other createNode specific options here if needed
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
			const labelsRaw = this.getNodeParameter('labels', i, '') as string;
			const propertiesRaw = this.getNodeParameter('properties', i, '{}') as string | IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const shouldReturnData = options.returnData !== false; // Default to true

			if (!labelsRaw) {
				throw new NodeOperationError(this.getNode(), 'Labels cannot be empty.', { itemIndex: i });
			}

			// Format labels for Cypher query
			const labelsFormatted = formatLabels(labelsRaw);
			if (!labelsFormatted) {
				throw new NodeOperationError(this.getNode(), 'No valid labels provided.', { itemIndex: i });
			}

			// Parse and evaluate expressions in properties
			const properties = await parseJsonParameter.call(this, propertiesRaw, i);

			// Build Cypher query
			const returnClause = shouldReturnData ? 'RETURN elementId(n) AS elementId, properties(n) AS properties' : '';
			const query = `CREATE (n${labelsFormatted} $props) ${returnClause}`;

			// Call the generic Cypher runner, always use write transaction for CREATE
			const resultData = await runCypherQuery.call(this, session, query, { props: properties }, true, i);

			// Merge results
			allResults.push(...resultData);

		} catch (error) {
			// Handle continueOnFail or re-throw
			// Corrected: Use this.continueOnFail(error)
			if (this.continueOnFail(error)) {
				const node = this.getNode();
				const parsedError = parseNeo4jError(node, error, 'createNode');
				const errorItemIndex = (error as any).itemIndex ?? i;
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(node, parsedError.message, { itemIndex: errorItemIndex, description: parsedError.description ?? undefined }),
					pairedItem: { item: i },
				});
				continue;
			}
			throw parseNeo4jError(this.getNode(), error, 'createNode');
		}
	}

	return allResults;
}
