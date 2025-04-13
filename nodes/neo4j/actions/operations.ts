import type { INodeProperties, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import type { Session } from 'neo4j-driver';
import type { Neo4jNodeOptions } from '../helpers/interfaces';


// Import definitions for each operation
import * as executeQuery from './executeQuery.operation';
import * as createNode from './createNode.operation';
import * as matchNodes from './matchNodes.operation';
import * as updateNode from './updateNode.operation';
import * as deleteNode from './deleteNode.operation';
import * as createRelationship from './createRelationship.operation';

// Type definition for the execute function of an operation
type OperationExecuteFunction = (
	this: IExecuteFunctions,
	session: Session,
	items: INodeExecutionData[],
	nodeOptions: Neo4jNodeOptions,
) => Promise<INodeExecutionData[]>;

// Export an object containing the execute function for each operation
// This allows the router to dynamically call the correct execute function
export const operations: { [key: string]: OperationExecuteFunction } = {
	executeQuery: executeQuery.execute,
	createNode: createNode.execute,
	matchNodes: matchNodes.execute,
	updateNode: updateNode.execute,
	deleteNode: deleteNode.execute,
	createRelationship: createRelationship.execute,
	// Add other operations here
};


// Aggregate UI property descriptions from all operations
export const description: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		options: [ // Sorted alphabetically by name
			{
				name: 'Create Node',
				value: 'createNode',
				description: 'Create a new node with labels and properties',
				action: 'Create a node',
			},
			{
				name: 'Create Relationship',
				value: 'createRelationship',
				description: 'Create a relationship between two nodes',
				action: 'Create a relationship',
			},
			{
				name: 'Delete Node',
				value: 'deleteNode',
				description: 'Delete nodes (optionally detaching relationships)',
				action: 'Delete a node',
			},
			{
				name: 'Execute Cypher Query',
				value: 'executeQuery',
				description: 'Execute a raw Cypher query',
				action: 'Execute a cypher query',
			},
			{
				name: 'Match Nodes',
				value: 'matchNodes',
				description: 'Find nodes based on labels and properties',
				action: 'Match nodes',
			},
			{
				name: 'Update Node',
				value: 'updateNode',
				description: 'Update properties of existing nodes',
				action: 'Update a node',
			},
			// ... other operation options ...
		],
		default: 'executeQuery',
	},

	// Spread descriptions from each operation file
	...executeQuery.description,
	...createNode.description,
	...matchNodes.description,
	...updateNode.description,
	...deleteNode.description,
	...createRelationship.description,
	// ... other operation descriptions ...
];
