import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
} from 'n8n-workflow';

// Import router, operations description, and method functions/objects
import { router } from './actions/router';
import { description as operationsDescription } from './actions/operations';
import { credentialTest, loadOptions } from './methods'; // Imports the function and the object

export class Neo4j implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
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
			credentials: [
				{
					name: 'neo4jApi',
					required: true,
				},
			],
			properties: [
				...operationsDescription,
			],
		};
	}

	// Register methods callable from the UI
	// Ensure the structure matches INodeType['methods']
	methods = {
		// credentialTest should be an object containing the test function
		credentialTest: {
			credentialTest, // The key matches the expected property, value is the imported function
		},
		// loadOptions is already an object containing the load functions
		loadOptions,
	};

	// Execution entry point, delegates to the router
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
