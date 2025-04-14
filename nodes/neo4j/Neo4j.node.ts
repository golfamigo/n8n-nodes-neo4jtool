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
import { credentialTest, loadOptions } from './methods';

export class Neo4j implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		// First, assign the base description. This includes usableAsTool.
		// We need to cast because TS might think baseDescription lacks specific properties initially.
		this.description = baseDescription as INodeTypeDescription;

		// Now, add or overwrite the node-specific properties
		this.description.displayName = 'Neo4j';
		this.description.name = 'neo4j';
		this.description.icon = 'file:neo4j.svg';
		this.description.group = ['database'];
		this.description.version = 1;
		this.description.subtitle = '={{$parameter["operation"]}}';
		this.description.description = 'Interact with a Neo4j graph database';
		this.description.defaults = {
			name: 'Neo4j',
		};
		this.description.inputs = ['main'];
		this.description.outputs = ['main'];
		// usableAsTool should be inherited from baseDescription, no need to set explicitly here
		this.description.credentials = [
			{
				name: 'neo4jApi',
				required: true,
			},
		];
		this.description.properties = [
			// Spread the imported operations description
			...operationsDescription,
		];
	}

	// Register methods callable from the UI
	methods = {
		credentialTest: {
			credentialTest,
		},
		loadOptions,
	};

	// Execution entry point, delegates to the router
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		return await router.call(this);
	}
}
