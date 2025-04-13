import type { ICredentialTestFunctions, INodeCredentialTestResult, ICredentialsDecrypted } from 'n8n-workflow';
import neo4j, { Driver } from 'neo4j-driver';

// Import shared interfaces and helpers
import type { Neo4jApiCredentials } from '../helpers/interfaces';
import { parseNeo4jError } from '../helpers/utils';

// Define the function signature matching ICredentialTestFunction
export async function credentialTest(this: ICredentialTestFunctions, credential: ICredentialsDecrypted): Promise<INodeCredentialTestResult> {

	// Cast the decrypted credential data
	const credentials = credential.data as unknown as Neo4jApiCredentials;

	if (!credentials) {
		// Return error in INodeCredentialTestResult format
		return { status: 'Error', message: 'Credentials data is missing.' };
	}

	let driver: Driver | undefined;
	const neo4jUri = `${credentials.host}:${credentials.port}`;

	try {
		// Attempt to create Driver
		driver = neo4j.driver(
			neo4jUri,
			neo4j.auth.basic(credentials.username, credentials.password),
			{
				connectionTimeout: 5000,
			},
		);

		// Verify connectivity
		await driver.verifyConnectivity({ database: credentials.database || 'neo4j' });

		// Return success in INodeCredentialTestResult format
		return { status: 'OK', message: 'Connection tested successfully!' };

	} catch (error) {
		// Use parseNeo4jError for consistent and user-friendly error messages
		// Pass null for node context as it's not directly available in ICredentialTestFunctions context
		const parsedError = parseNeo4jError(null, error, 'credentialTest');
		// Return error in INodeCredentialTestResult format
		return { status: 'Error', message: parsedError.message };
	} finally {
		// Ensure Driver is closed
		if (driver) {
			await driver.close();
		}
	}
}
