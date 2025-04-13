import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class Neo4jApi implements ICredentialType {
	name = 'neo4jApi';
	displayName = 'Neo4j API';
	// documentationUrl = 'neo4j'; // Add link to documentation
	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: 'neo4j://localhost',
			placeholder: 'neo4j://localhost',
			description: 'The host of the Neo4j instance, including the protocol (e.g., neo4j://, bolt://, neo4j+s://)',
			required: true,
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 7687,
			description: 'The port number for the Neo4j Bolt protocol',
			required: true,
		},
		{
			displayName: 'Database',
			name: 'database',
			type: 'string',
			default: 'neo4j',
			description: 'The name of the database to connect to (optional, defaults to "neo4j")',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: 'neo4j',
			description: 'The username for authentication',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The password for authentication',
			required: true,
		},
	];
}
