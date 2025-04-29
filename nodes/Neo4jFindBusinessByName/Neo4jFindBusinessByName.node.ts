import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject, // Import credential type
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver'; // Import driver components

// Import shared Neo4j helper functions
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils'; // Correct path

// Define FindBusinessByName node class
export class Neo4jFindBusinessByName implements INodeType {
	// Define the node description for the n8n UI
	description: INodeTypeDescription = {
		displayName: 'Neo4j Find Business by Name',
		name: 'neo4jFindBusinessByName',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'Find by Name', // Static subtitle
		description: '根據名稱模糊查找商家 (Business) 。,searchTerm: 用於商家名稱模糊匹配的關鍵字。',
		defaults: {
			name: 'Neo4j Find Business',
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
			{
					displayName: 'Search Term',
					name: 'searchTerm',
					type: 'string',
					required: true,
					default: '',
					description: '用於商家名稱模糊匹配的關鍵字',
			}
	],
	};

	// Execute method with corrected connection logic based on nodes/neo4j/actions/router.ts pattern
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode(); // Get node instance for error reporting

		try {
			// Get credentials (Pattern from router.ts)
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;

			// Validate credentials
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured or missing required fields (host, port, username, password).', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const user = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j'; // Default to 'neo4j' if not provided

			// Create driver and session (Pattern from router.ts)
			try {
				driver = neo4j.driver(uri, auth.basic(user, password));
				// Verify connectivity (Pattern from router.ts)
				await driver.verifyConnectivity();
				this.logger.debug('Neo4j driver connected successfully.');
				session = driver.session({ database });
				this.logger.debug(`Neo4j session opened for database: ${database}`);
			} catch (connectionError) {
				this.logger.error('Failed to connect to Neo4j or open session:', connectionError);
				// Use parseNeo4jError for consistent error handling (Pattern from router.ts)
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection or session.');
			}

			// Process items
			for (let i = 0; i < items.length; i++) {
				try {
					const searchTerm = this.getNodeParameter('searchTerm', i, '') as string;
					this.logger.debug(`[Item ${i}] Search Term: ${searchTerm}`);

					const query = 'MATCH (b:Business) WHERE b.name CONTAINS $searchTerm RETURN b {.*, business_id: b.business_id} AS business';
					const parameters: IDataObject = { searchTerm: searchTerm };
					const isWrite = false; // This is a read operation

					// Ensure session is defined before using it
					if (!session) {
						// This should theoretically not happen if connection succeeded, but good practice to check
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}

					// Execute the query using the shared helper function
					// Unlike router.ts which delegates to operation functions, this node executes directly
					const results = await runCypherQuery.call(this, session, query, parameters, isWrite, i);
					returnData.push(...results);

				} catch (itemError) {
					// Error handling for individual items (Pattern from router.ts)
					if (this.continueOnFail(itemError)) {
						const item = items[i];
						const parsedError = parseNeo4jError(node, itemError); // Use shared error parser
						const errorData = { ...item.json, error: parsedError };
						// Use NodeOperationError for structured error reporting in the output
						returnData.push({
							json: errorData,
							error: new NodeOperationError(node, parsedError.message, { itemIndex: i, description: parsedError.description ?? undefined }),
							pairedItem: { item: i }
						});
						continue;
					}
					// If not continuing on fail, re-throw the error to be caught by the outer catch block
					throw itemError;
				}
			}

			return this.prepareOutputData(returnData); // Use prepareOutputData like router.ts

		} catch (error) {
			// Catch errors from credential fetching, connection, or item processing (if not handled by continueOnFail)
			// Consistent error handling (Pattern from router.ts)
			if (error instanceof NodeOperationError) {
				// Re-throw NodeOperationErrors directly
				throw error;
			}
			// Parse other errors using the shared helper
			throw parseNeo4jError(node, error);
		} finally {
			// Ensure session and driver are closed (Pattern from router.ts)
			if (session) {
				try {
					await session.close();
					this.logger.debug('Neo4j session closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j session:', closeError);
				}
			}
			if (driver) {
				try {
					await driver.close();
					this.logger.debug('Neo4j driver closed successfully.');
				} catch (closeError) {
					this.logger.error('Error closing Neo4j driver:', closeError);
				}
			}
		}
	}
}
