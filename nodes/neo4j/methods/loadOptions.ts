import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import neo4j, { Driver, Session, Neo4jError } from 'neo4j-driver';

// Import shared interfaces
import type { Neo4jApiCredentials } from '../helpers/interfaces';
// We might not need parseNeo4jError here if we return a generic error option

// Helper function to safely get credentials and handle connection
async function safeNeo4jOperation(
	// Use the correct 'this' type for loadOptions methods
	context: ILoadOptionsFunctions,
	operation: (session: Session) => Promise<INodePropertyOptions[]>,
): Promise<INodePropertyOptions[]> {
	const credentials = (await context.getCredentials('neo4jApi')) as unknown as Neo4jApiCredentials;
	// Return generic error option if credentials are missing
	if (!credentials) return [{ name: 'Error: Credentials not found', value: '__ERROR_CREDENTIALS__' }];

	let driver: Driver | undefined;
	let session: Session | undefined;
	const neo4jUri = `${credentials.host}:${credentials.port}`;

	try {
		driver = neo4j.driver(neo4jUri, neo4j.auth.basic(credentials.username, credentials.password), {
			connectionTimeout: 3000, // Short timeout for UI operations
			// logging: neo4j.logging.console('debug'), // Enable for debugging loadOptions
		});
		// Verify connectivity briefly before creating session
		await driver.verifyConnectivity({ database: credentials.database || 'neo4j' });
		session = driver.session({ database: credentials.database || 'neo4j', defaultAccessMode: neo4j.session.READ });
		return await operation(session);
	} catch (error) {
		// Log the detailed error for debugging
		console.error("Error during Neo4j load options:", error instanceof Error ? error.message : JSON.stringify(error));
		// Return a user-friendly error option
		let errorMessage = 'Error loading options';
		if (error instanceof Neo4jError) {
			errorMessage = `Neo4j Error: ${error.message.split('\n')[0]}`;
		} else if (error instanceof Error) {
			errorMessage = `Error: ${error.message}`;
		}
		return [{ name: errorMessage, value: '__ERROR__' }];
	} finally {
		if (session) await session.close();
		if (driver) await driver.close();
	}
}

// --- Get Node Labels ---
export async function getNodeLabels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return safeNeo4jOperation(this, async (session) => {
		const result = await session.run('CALL db.labels() YIELD label RETURN label ORDER BY label');
		return result.records.map((record) => {
			const label = record.get('label') as string;
			return { name: label, value: label };
		});
	});
}

// --- Get Relationship Types ---
export async function getRelationshipTypes(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return safeNeo4jOperation(this, async (session) => {
		const result = await session.run('CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType ORDER BY relationshipType');
		return result.records.map((record) => {
			const relType = record.get('relationshipType') as string;
			return { name: relType, value: relType };
		});
	});
}

// --- Get Property Keys ---
export async function getPropertyKeys(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
    // TODO: Implement filtering based on selected labels if needed
	// const labels = this.getNodeParameter('labels', []) as string[]; // Example: Get labels from another parameter
	return safeNeo4jOperation(this, async (session) => {
		// Consider optimizing this query if performance is an issue,
		// e.g., sampling or querying based on selected labels.
		const result = await session.run('CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey ORDER BY propertyKey');
		return result.records.map((record) => {
			const propKey = record.get('propertyKey') as string;
			return { name: propKey, value: propKey };
		});
	});
}
