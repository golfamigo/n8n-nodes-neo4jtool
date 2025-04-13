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
	// --- Start Node ---
	{
		displayName: 'Start Node Match Labels',
		name: 'startNodeMatchLabels',
		type: 'string',
		default: '',
		placeholder: 'Person (optional)',
		description: 'Labels of the starting node for the relationship (optional)',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	{
		displayName: 'Start Node Match Properties',
		name: 'startNodeMatchProperties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"ID": "{{ $json.startNodeID }}"}',
		description: 'Properties to uniquely identify the starting node (JSON object, required). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	// --- End Node ---
	{
		displayName: 'End Node Match Labels',
		name: 'endNodeMatchLabels',
		type: 'string',
		default: '',
		placeholder: 'Company (optional)',
		description: 'Labels of the ending node for the relationship (optional)',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	{
		displayName: 'End Node Match Properties',
		name: 'endNodeMatchProperties',
		type: 'json',
		required: true,
		default: '{}',
		placeholder: '{"ID": "{{ $json.endNodeID }}"}',
		description: 'Properties to uniquely identify the ending node (JSON object, required). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	// --- Relationship ---
	{
		displayName: 'Relationship Type',
		name: 'relationshipType',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'WORKS_AT',
		description: 'The type of the relationship (e.g., KNOWS, WORKS_AT). Must be a valid Neo4j type name (letters, numbers, underscores).',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	{
		displayName: 'Relationship Properties',
		name: 'relationshipProperties',
		type: 'json',
		default: '{}',
		placeholder: '{"since": "{{ $now.year }}", "role": "Developer"} (optional)',
		description: 'Properties for the relationship (JSON object, optional). Values can be n8n expressions.',
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
	},
	// --- Options ---
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: {
			show: {
				operation: ['createRelationship'],
			},
		},
		options: [
			{
				displayName: 'Return Data',
				name: 'returnData',
				type: 'boolean',
				default: true,
				description: 'Whether to return the created relationship\'s element ID, type, and properties',
			},
			// Add other createRelationship specific options here if needed
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
			const startLabelsRaw = this.getNodeParameter('startNodeMatchLabels', i, '') as string;
			const startPropsRaw = this.getNodeParameter('startNodeMatchProperties', i, '{}') as string | IDataObject;
			const endLabelsRaw = this.getNodeParameter('endNodeMatchLabels', i, '') as string;
			const endPropsRaw = this.getNodeParameter('endNodeMatchProperties', i, '{}') as string | IDataObject;
			const relType = this.getNodeParameter('relationshipType', i, '') as string;
			const relPropsRaw = this.getNodeParameter('relationshipProperties', i, '{}') as string | IDataObject;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			const shouldReturnData = options.returnData !== false;

			// Validate Relationship Type
			if (!relType) {
				throw new NodeOperationError(this.getNode(), 'Relationship Type cannot be empty.', { itemIndex: i });
			}
			if (!/^[A-Z_][A-Z0-9_]*$/i.test(relType)) {
				throw new NodeOperationError(this.getNode(), `Invalid Relationship Type: "${relType}". Use only letters, numbers, and underscores, starting with a letter or underscore.`, { itemIndex: i });
			}

			// Parse and evaluate match properties
			const startProps = await parseJsonParameter.call(this, startPropsRaw, i);
			const endProps = await parseJsonParameter.call(this, endPropsRaw, i);
			if (Object.keys(startProps).length === 0 || Object.keys(endProps).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Start Node and End Node Match Properties cannot be empty.', { itemIndex: i });
			}

			// Parse and evaluate relationship properties
			const relProps = await parseJsonParameter.call(this, relPropsRaw, i);

			// Format labels
			const startLabelsFormatted = formatLabels(startLabelsRaw);
			const endLabelsFormatted = formatLabels(endLabelsRaw);

			// Build Cypher query
			let parameters: IDataObject = {};

			// MATCH clause
			let query = `MATCH (a${startLabelsFormatted}), (b${endLabelsFormatted})`;

			// WHERE clause for start node
			const [startWhereClause, startWhereParams] = buildWhereClause(startProps, 'a', 'start_');
			let whereClauses: string[] = [];
			if (startWhereClause) {
				whereClauses.push(startWhereClause.substring(6));
				parameters = { ...parameters, ...startWhereParams };
			} else {
                 throw new NodeOperationError(this.getNode(), 'Failed to build WHERE clause for Start Node.', { itemIndex: i });
            }

			// WHERE clause for end node
			const [endWhereClause, endWhereParams] = buildWhereClause(endProps, 'b', 'end_');
			if (endWhereClause) {
				whereClauses.push(endWhereClause.substring(6));
				parameters = { ...parameters, ...endWhereParams };
			} else {
                 throw new NodeOperationError(this.getNode(), 'Failed to build WHERE clause for End Node.', { itemIndex: i });
            }

            query += ` WHERE ${whereClauses.join(' AND ')}`;


			// CREATE clause - Use backticks for relationship type
			query += ` CREATE (a)-[r:\`${relType}\` $relProps]->(b)`;
			parameters.relProps = relProps;

			// RETURN clause
			if (shouldReturnData) {
				query += ' RETURN elementId(r) AS elementId, type(r) AS type, properties(r) AS properties';
			}

			// Call the generic Cypher runner (CREATE is always a write operation)
			const resultData = await runCypherQuery.call(this, session, query, parameters, true, i);

			// Merge results
			allResults.push(...resultData);

		} catch (error) {
			// Handle continueOnFail or re-throw
			// Corrected: Use this.continueOnFail(error)
			if (this.continueOnFail(error)) {
				const node = this.getNode();
				const parsedError = parseNeo4jError(node, error, 'createRelationship');
				const errorItemIndex = (error as any).itemIndex ?? i;
				allResults.push({
					json: items[i].json,
					error: new NodeOperationError(node, parsedError.message, { itemIndex: errorItemIndex, description: parsedError.description ?? undefined }),
					pairedItem: { item: i },
				});
				continue;
			}
			// If not continueOnFail, re-throw the parsed error
			throw parseNeo4jError(this.getNode(), error, 'createRelationship');
		}
	}

	return allResults;
}
