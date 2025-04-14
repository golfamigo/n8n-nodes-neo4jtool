import type { ILoadOptionsFunctions, ResourceMapperFields, ResourceMapperField } from 'n8n-workflow';

/**
 * Provides the parameter schema for Neo4j node operations when used as a Tool.
 * This defines the expected input structure for AI Agents.
 */
export async function resourceMapping(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	// Get the selected operation from the node parameters
	const operation = this.getNodeParameter('operation', 0) as string;
	const fields: ResourceMapperField[] = [];

	// Define tool parameters based on the selected operation
	switch (operation) {
		case 'executeQuery':
			fields.push({
				id: 'query', // Only expose query parameter
				displayName: 'Cypher Query',
				type: 'string',
				required: true,
				display: true,
				defaultMatch: false,
			});
			// 'parameters' field removed
			break;
		case 'createNode':
			fields.push({ id: 'labels', displayName: 'Labels', type: 'string', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'properties', displayName: 'Properties', type: 'object', required: true, display: true, defaultMatch: false });
			break;
		case 'matchNodes':
			fields.push({ id: 'labels', displayName: 'Labels', type: 'string', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'matchProperties', displayName: 'Match Properties', type: 'object', required: false, display: true, defaultMatch: false });
			fields.push({ id: 'returnProperty', displayName: 'Return Property', type: 'string', required: false, display: true, defaultMatch: false });
			break;
		case 'updateNode':
			fields.push({ id: 'matchLabels', displayName: 'Match Labels', type: 'string', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'matchProperties', displayName: 'Match Properties', type: 'object', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'updateProperties', displayName: 'Update Properties', type: 'object', required: true, display: true, defaultMatch: false });
			break;
		case 'deleteNode':
			fields.push({ id: 'matchLabels', displayName: 'Match Labels', type: 'string', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'matchProperties', displayName: 'Match Properties', type: 'object', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'detach', displayName: 'Detach Relationships', type: 'boolean', required: false, display: true, defaultMatch: false });
			break;
		case 'createRelationship':
			fields.push({ id: 'startNodeLabel', displayName: 'Start Node Label', type: 'string', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'startNodeMatchProperties', displayName: 'Start Node Match Properties', type: 'object', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'endNodeLabel', displayName: 'End Node Label', type: 'string', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'endNodeMatchProperties', displayName: 'End Node Match Properties', type: 'object', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'relationshipType', displayName: 'Relationship Type', type: 'string', required: true, display: true, defaultMatch: false });
			fields.push({ id: 'properties', displayName: 'Relationship Properties', type: 'object', required: false, display: true, defaultMatch: false });
			break;
		default:
			this.logger.warn(`Resource mapping not defined for operation: ${operation}`);
			break;
	}

	return { fields };
}
