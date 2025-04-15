import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';

// Import router, operations description, and method functions/objects
import { router } from './actions/router';
import { description as operationsDescription } from './actions/operations';
// Import methods (removed resourceMappingFunction)
import { credentialTest, loadOptions } from './methods';

export class Neo4j implements INodeType {
	// Define description directly as a class property
	description: INodeTypeDescription = {
		displayName: 'Neo4j',
		name: 'neo4j',
		icon: 'file:neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with a Neo4j graph database',
		defaults: {
			name: 'Neo4j',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround: Suppress TS error for usableAsTool in this project context
		usableAsTool: true,
		credentials: [
			{
				name: 'neo4jApi',
				required: true,
			},
		],
		properties: [
			// Spread the imported operations description
			...operationsDescription,
		],
	};

	constructor(baseDescription: INodeTypeBaseDescription) {
        // Constructor remains simple
	}

	// Register methods callable from the UI
	// Ensure the structure matches INodeType['methods']
	methods = {
		credentialTest: {
			// Key 'credentialTest' matches the expected property name for testing credentials
			credentialTest, // The imported function
		},
		loadOptions, // This is already an object { getNodeLabels, ... }
		// Removed resourceMapping property
	};

	// Execution entry point, delegates to the router
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
