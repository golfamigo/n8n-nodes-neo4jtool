import type {
	IExecuteFunctions, // Added back
	IDataObject, // Added back
	INodeExecutionData, // Added back
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow'; // Added back
import type { Session } from 'neo4j-driver'; // Added back

// Import shared Neo4j helper functions
import {
	// connectToNeo4j, // TODO: Implement or import actual connection function
	runCypherQuery, // Added back
	parseNeo4jError, // Added back
} from '../neo4j/helpers/utils'; // Correct path

// Define FindBusinessByName node class
export class Neo4jFindBusinessByName implements INodeType {
	// Define the node description for the n8n UI
	description: INodeTypeDescription = {
		displayName: 'Neo4j: Find Business by Name', // Restored descriptive name
		name: 'neo4jFindBusinessByName',
		icon: 'file:neo4j.svg', // Path relative to this file
		group: ['database'],
		version: 1,
		subtitle: 'Find by Name', // Static subtitle
		description: '根據名稱模糊查找商家 (Business) 節點。', // Restored description
		defaults: {
			name: 'Neo4j Find Business', // Restored default name
		},
		inputs: ['main'],
		outputs: ['main'],
		// usableAsTool: true, // Keep commented out/removed as per user's successful load test
		credentials: [
			{
				name: 'neo4jFindBusinessByNameApi', // Using the specific credential name
				required: true,
			},
		],
		properties: [
			// Restored properties needed for this node
			{
				displayName: 'Search Term',
				name: 'searchTerm',
				type: 'string',
				required: true,
				default: '',
				description: '用於商家名稱模糊匹配的關鍵字',
			},
		],
	};

	// Execute method restored
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let session: Session | undefined;

		try {
			// Use the specific credential name defined above
			const credentials = await this.getCredentials('neo4jFindBusinessByNamejApi');
			// TODO: Implement connection logic using credentials
			const tempSession = (this.helpers as any).neo4j?.getSession?.(credentials);
			if (!tempSession) {
				throw new NodeOperationError(this.getNode(), 'Failed to establish Neo4j session.');
			}
			session = tempSession;

			for (let i = 0; i < items.length; i++) {
				try {
					const searchTerm = this.getNodeParameter('searchTerm', i, '') as string;
					this.logger.debug(`[Item ${i}] Search Term: ${searchTerm}`);

					const query = 'MATCH (b:Business) WHERE b.name CONTAINS $searchTerm RETURN b {.*, business_id: b.business_id} AS business';
					const parameters: IDataObject = { searchTerm: searchTerm };
					const isWrite = false;

					// Use non-null assertion '!' as session is guaranteed non-undefined here
					const results = await runCypherQuery.call(this, session!, query, parameters, isWrite, i);
					returnData.push(...results);

				} catch (error) {
					if (this.continueOnFail(error)) {
						const item = items[i];
						const parsedError = parseNeo4jError(this.getNode(), error);
						const errorData = { ...item.json, error: parsedError };
						returnData.push({ json: errorData, pairedItem: { item: i } });
						continue;
					}
					throw error;
				}
			}

			return [returnData];

		} catch (error) {
			if (error instanceof NodeOperationError) { throw error; }
			throw parseNeo4jError(this.getNode(), error);
		} finally {
			if (session) {
				try {
					await session.close();
					this.logger.debug('Neo4j session closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j session:', closeError);
				}
			}
		}
	}
}
