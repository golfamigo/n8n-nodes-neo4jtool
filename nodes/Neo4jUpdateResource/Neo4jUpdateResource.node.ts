// ============================================================================
// N8N Neo4j Node: Update Resource
// ============================================================================
import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow'; // Import jsonParse
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils'; // Adjusted path relative to new location

// --- Node Class Definition ---
export class Neo4jUpdateResource implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Update Resource', // From TaskInstructions.md
		name: 'neo4jUpdateResource', // From TaskInstructions.md
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["resourceId"]}}', // Show resourceId
		description: '根據 resource_id 更新資源資訊。,resourceId: 要更新的資源 ID (UUID),type: 新的資源類型 (可選),name: 新的資源名稱/編號 (可選),capacity: 新的資源容量 (可選),propertiesJson: 要更新或添加的其他屬性 (JSON 格式)。留空則不更新此項。', // From TaskInstructions.md
		defaults: {
			name: 'Neo4j Update Resource',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,

		// --- Credentials ---
		credentials: [
			{
				name: 'neo4jApi',
				required: true,
			},
		],

		// --- Node Specific Input Properties ---
		properties: [
			// Parameters from TaskInstructions.md
			{
				displayName: 'Resource ID',
				name: 'resourceId',
				type: 'string',
				required: true,
				default: '',
				description: '要更新的資源 ID',
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'string',
				default: '',
				description: '新的資源類型 (可選)',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: '新的資源名稱/編號 (可選)',
			},
			{
				displayName: 'Capacity',
				name: 'capacity',
				type: 'number',
				typeOptions: {
					numberStep: 1,
				},
				default: undefined,
				description: '新的資源容量 (可選)',
			},
			{
				displayName: 'Properties (JSON)',
				name: 'propertiesJson',
				type: 'json',
				default: '', // Default to empty string for optional JSON update
				description: '要更新或添加的其他屬性 (JSON 格式)。留空則不更新此項。',
			},
		],
	};

	// --- Node Execution Logic ---
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let driver: Driver | undefined;
		let session: Session | undefined;
		const node = this.getNode();

		try {
			// 1. Get Credentials
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;

			// 2. Validate Credentials
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured or missing required fields (host, port, username, password).', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const user = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			// 3. Establish Neo4j Connection
			try {
				driver = neo4j.driver(uri, auth.basic(user, password));
				await driver.verifyConnectivity();
				this.logger.debug('Neo4j driver connected successfully.');
				session = driver.session({ database });
				this.logger.debug(`Neo4j session opened for database: ${database}`);
			} catch (connectionError) {
				this.logger.error('Failed to connect to Neo4j or open session:', connectionError);
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection or session.');
			}

			// 4. Loop Through Input Items
			for (let i = 0; i < items.length; i++) {
				try {
					// 5. Get Input Parameters
					const resourceId = this.getNodeParameter('resourceId', i, '') as string;
					const type = this.getNodeParameter('type', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const capacity = this.getNodeParameter('capacity', i, undefined) as number | undefined;
					const propertiesJson = this.getNodeParameter('propertiesJson', i, '') as string; // Get as string

					// Build SET clause dynamically
					const setClauses: string[] = [];
					const parameters: IDataObject = { resourceId };

					if (type !== undefined && type !== '') { setClauses.push('r.type = $type'); parameters.type = type; }
					if (name !== undefined && name !== '') { setClauses.push('r.name = $name'); parameters.name = name; }
					if (capacity !== undefined && capacity !== null) { setClauses.push('r.capacity = $capacity'); parameters.capacity = neo4j.int(capacity); }

					// Handle JSON properties update
					let properties: IDataObject | undefined = undefined;
					if (propertiesJson !== undefined && propertiesJson.trim() !== '') {
					this.logger.debug(`Raw propertiesJson value: ${propertiesJson}`);
					this.logger.debug(`Type of propertiesJson: ${typeof propertiesJson}`);
						try {
							properties = jsonParse(propertiesJson);
							if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
								throw new NodeOperationError(node, 'Properties must be a valid JSON object.', { itemIndex: i });
							}
							// Merge properties instead of overwriting: r.properties = $properties
							// Or use SET r += $properties for merging (requires properties param to be a map)
							setClauses.push('r.properties = $propertiesJsonString');
							parameters.propertiesJsonString = JSON.stringify(properties);
						} catch (jsonError) {
							throw new NodeOperationError(node, `Invalid JSON in Properties field: ${jsonError.message}`, { itemIndex: i });
						}
					}


					if (setClauses.length === 0) {
						this.logger.warn(`No update parameters provided for Resource ID: ${resourceId}. Returning current data.`);
						const findQuery = 'MATCH (r:Resource {resource_id: $resourceId}) RETURN r {.*} AS resource';
						const findParams = { resourceId };
						if (!session) throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
						const findResults = await runCypherQuery.call(this, session, findQuery, findParams, false, i);
						returnData.push(...findResults);
						continue;
					}

					// Add updated_at timestamp
					setClauses.push('r.updated_at = datetime()');

					// 6. Define Specific Cypher Query
					const query = `
						MATCH (r:Resource {resource_id: $resourceId})
						SET ${setClauses.join(', ')}
						RETURN r {.*} AS resource
					`;
					const isWrite = true; // This is a write operation (SET)

					// 7. Execute Query
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}
					const results = await runCypherQuery.call(this, session, query, parameters, isWrite, i);
					returnData.push(...results);

				} catch (itemError) {
					// 8. Handle Item-Level Errors
					if (this.continueOnFail(itemError)) {
						const item = items[i];
						const parsedError = parseNeo4jError(node, itemError);
						const errorData = { ...item.json, error: parsedError };
						returnData.push({
							json: errorData,
							error: new NodeOperationError(node, parsedError.message, { itemIndex: i, description: parsedError.description ?? undefined }),
							pairedItem: { item: i }
						});
						continue;
					}
					throw itemError;
				}
			}

			// 9. Return Results
			return this.prepareOutputData(returnData);

		} catch (error) {
			// 10. Handle Node-Level Errors
			if (error instanceof NodeOperationError) { throw error; }
			throw parseNeo4jError(node, error);
		} finally {
			// 11. Close Session and Driver
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
