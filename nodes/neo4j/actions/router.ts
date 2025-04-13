import type {
	IExecuteFunctions,
	INodeExecutionData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session } from 'neo4j-driver';

// Import interfaces and helpers
import type { Neo4jApiCredentials, Neo4jNodeOptions } from '../helpers/interfaces';
import { parseNeo4jError } from '../helpers/utils'; // Import error parser

// Import the operations object which contains all execute functions
import { operations } from './operations';

export async function router(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	let returnData: INodeExecutionData[] = [];
	const node = this.getNode();

	// Get operation and node options
	const operation = this.getNodeParameter('operation', 0) as string;
	// Cast to Neo4jNodeOptions which includes continueOnFail etc.
	const nodeOptions = this.getNodeParameter('options', 0, {}) as Neo4jNodeOptions;
	nodeOptions.nodeVersion = node.typeVersion;
	// Get continueOnFail specifically for error handling below
	const continueOnFail = this.continueOnFail();


	// Get credentials
	const credentials = (await this.getCredentials('neo4jApi')) as unknown as Neo4jApiCredentials;
	if (!credentials) {
		throw new NodeOperationError(node, 'Neo4j credentials are not configured!', { itemIndex: 0 });
	}

	// Create Neo4j Driver and Session
	let driver: Driver | undefined;
	let session: Session | undefined;
	const neo4jUri = `${credentials.host}:${credentials.port}`;

	try {
		driver = neo4j.driver(
			neo4jUri,
			neo4j.auth.basic(credentials.username, credentials.password),
			// Add driver config if needed
		);

		await driver.verifyConnectivity();
		session = driver.session({ database: credentials.database || 'neo4j' });

		// ---------------------------------------------------------------------
		// Dispatch the task to the corresponding operation executor
		// ---------------------------------------------------------------------
		const executeFunction = operations[operation]; // Get the execute function from the imported object

		if (!executeFunction) {
			throw new NodeOperationError(node, `The operation "${operation}" is not supported!`, { itemIndex: 0 });
		}

		// Execute the operation's logic, passing session, items, and nodeOptions
		// The operation's execute function will handle its specific parameters and call runCypherQuery internally
		returnData = await executeFunction.call(this, session, items, nodeOptions);

		// ---------------------------------------------------------------------

	} catch (error) {
		// Use the parsed error for consistent reporting
		const parsedError = parseNeo4jError(node, error, operation);

		if (continueOnFail) {
			// Prepare error output for each item if continueOnFail is true
			returnData = items.map((item, index) => ({
				json: item.json, // Keep original json data if possible
				error: new NodeOperationError(node, parsedError.message, { itemIndex: (error as any).itemIndex ?? index, description: parsedError.description ?? undefined }),
				pairedItem: { item: index }, // Ensure pairing
			}));
		} else {
			// If not continuing on fail, throw the parsed error
			throw parsedError;
		}
	} finally {
		// Ensure Session and Driver are closed
		if (session) {
			await session.close();
		}
		if (driver) {
			await driver.close();
		}
	}

	// Return the final data
	return this.prepareOutputData(returnData);
}
