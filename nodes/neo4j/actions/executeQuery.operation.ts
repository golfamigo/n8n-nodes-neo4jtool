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
import { parseJsonParameter, runCypherQuery, parseNeo4jError } from '../helpers/utils';

// --- UI Definition ---
export const description: INodeProperties[] = [
	{
		displayName: 'Cypher Query',
		name: 'query',
		type: 'string',
		typeOptions: {
			editorLanguage: 'cypher',
		},
		required: true,
		default: '',
		placeholder: 'MATCH (n) RETURN n LIMIT 10',
		description: 'The Cypher query to execute. Use $parameterName syntax for parameters defined below.',
		displayOptions: {
			show: {
				operation: ['executeQuery'],
			},
		},
	},
	{
		displayName: 'Parameters',
		name: 'parameters',
		type: 'json',
		default: '{}',
		placeholder: '{"name": "Alice", "limit": {{ $json.maxResults || 10 }} }',
		description: 'Parameters to pass to the Cypher query (JSON object). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['executeQuery'],
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
				operation: ['executeQuery'],
			},
		},
		options: [
			{
				displayName: 'Transaction Type',
				name: 'transactionType',
				type: 'options',
				options: [
					{
						name: 'Auto-Detect (Read/Write)',
						value: 'auto',
						description: 'Detect based on keywords (CREATE, MERGE, SET, DELETE, REMOVE) if it\'s a write query',
					},
					{
						name: 'Read',
						value: 'read',
						description: 'Force using a read transaction',
					},
					{
						name: 'Write',
						value: 'write',
						description: 'Force using a write transaction',
					},
				],
				default: 'auto',
				description: 'Choose the type of transaction to use',
			},
			// Add other executeQuery specific options here if needed
		],
	},
];

// --- Execution Logic ---
export async function execute(
	this: IExecuteFunctions,
	session: Session, // Passed from router
	items: INodeExecutionData[],
	nodeOptions: Neo4jNodeOptions, // General node options like continueOnFail (though we use this.continueOnFail)
): Promise<INodeExecutionData[]> {
	const allResults: INodeExecutionData[] = [];

	for (let i = 0; i < items.length; i++) {
		try {
			// Get parameters for the current item
			const query = this.getNodeParameter('query', i, '') as string;
			const parametersRaw = this.getNodeParameter('parameters', i, '{}') as string | IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const transactionTypeHint = options.transactionType as 'auto' | 'read' | 'write' | undefined ?? 'auto';

			if (!query) {
				throw new NodeOperationError(this.getNode(), 'Cypher Query cannot be empty.', { itemIndex: i });
			}

			// Parse and evaluate expressions in parameters
			const parameters = await parseJsonParameter.call(this, parametersRaw, i);

			// Determine if it's a write query based on hint or keywords
			let isWriteQuery = false;
			if (transactionTypeHint === 'write') {
				isWriteQuery = true;
			} else if (transactionTypeHint === 'auto') {
				const upperQuery = query.toUpperCase();
				if (upperQuery.includes('CREATE') || upperQuery.includes('MERGE') || upperQuery.includes('SET') || upperQuery.includes('DELETE') || upperQuery.includes('REMOVE')) {
					isWriteQuery = true;
				}
			}

			// Call the generic Cypher runner from utils.ts
			const resultData = await runCypherQuery.call(this, session, query, parameters, isWriteQuery, i);

			// Merge results
			allResults.push(...resultData);

		} catch (error) {
			// Handle continueOnFail or re-throw
			// Corrected: Use this.continueOnFail(error)
			if (this.continueOnFail(error)) {
				const node = this.getNode();
				const parsedError = parseNeo4jError(node, error, 'executeQuery');
				const errorItemIndex = (error as any).itemIndex ?? i;
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(node, parsedError.message, { itemIndex: errorItemIndex, description: parsedError.description ?? undefined }),
					pairedItem: { item: i },
				});
				continue;
			}
			// If not continueOnFail, re-throw the parsed error
			throw parseNeo4jError(this.getNode(), error, 'executeQuery');
		}
	}

	return allResults;
}
