import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { Session } from 'neo4j-driver';

// Import shared Neo4j helper functions
import {
	// connectToNeo4j, // TODO: Implement or import actual connection function
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils';

// Define FindBusinessByName node class
export class FindBusinessByName implements INodeType {
	// Define the node description for the n8n UI
	description: INodeTypeDescription = {
		displayName: 'Neo4j: Find Business by Name',
		name: 'neo4jFindBusinessByName',
		icon: 'file:neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["searchTerm"]}}',
		description: '根據名稱模糊查找商家 (Business) 節點。',
		defaults: {
			name: 'Neo4j Find Business',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore
		usableAsTool: true,
		credentials: [
			{
				name: 'neo4jApi',
				required: true,
			},
		],
		properties: [
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let session: Session | undefined;

		try {
			const credentials = await this.getCredentials('neo4jApi');
			// TODO: Implement connection logic
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
