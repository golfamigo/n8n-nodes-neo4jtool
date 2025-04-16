// ============================================================================
// N8N Neo4j Node: Set Business Hours
// ============================================================================
import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError, jsonParse } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	parseNeo4jError,
	convertNeo4jValueToJs, // Import the converter
} from '../neo4j/helpers/utils';

// --- Node Class Definition ---
export class Neo4jSetBusinessHours implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j: Set Business Hours',
		name: 'neo4jSetBusinessHours',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: 'for Business {{$parameter["businessId"]}}',
		description: '設定或更新指定商家的營業時間 (會覆蓋舊設定)。',
		defaults: {
			name: 'Neo4j Set Business Hours',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			{
				displayName: 'Business ID',
				name: 'businessId',
				type: 'string',
				required: true,
				default: '',
				description: '要設定營業時間的商家 ID',
			},
			{
				displayName: 'Hours Data (JSON Array)',
				name: 'hoursData',
				type: 'json',
				required: true,
				default: '[\n  {\n    "day_of_week": 1,\n    "start_time": "09:00",\n    "end_time": "17:00"\n  }\n]',
				description: '包含每天營業時間的 JSON 陣列。如果某天休息，則不包含該天的物件。',
				hint: '格式: [{"day_of_week": 1, "start_time": "HH:MM", "end_time": "HH:MM"}, ...] (時間為 UTC)',
				typeOptions: {
					rows: 10,
				}
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

		// This node typically runs once per businessId
		if (items.length > 1) {
			this.logger.warn('This node is processing multiple items. It will set hours for each businessId found in the input items.');
		}

		try {
			// 1. Get Credentials
			const credentials = await this.getCredentials('neo4jApi') as ICredentialDataDecryptedObject;

			// 2. Validate Credentials
			if (!credentials || !credentials.host || !credentials.port || !credentials.username || typeof credentials.password === 'undefined') {
				throw new NodeOperationError(node, 'Neo4j credentials are not fully configured.', { itemIndex: 0 });
			}

			const uri = `${credentials.host}:${credentials.port}`;
			const user = credentials.username as string;
			const password = credentials.password as string;
			const database = credentials.database as string || 'neo4j';

			// 3. Establish Neo4j Connection
			try {
				driver = neo4j.driver(uri, auth.basic(user, password));
				await driver.verifyConnectivity();
				session = driver.session({ database });
			} catch (connectionError) {
				throw parseNeo4jError(node, connectionError, 'Failed to establish Neo4j connection.');
			}

			// 4. Loop Through Input Items
			for (let i = 0; i < items.length; i++) {
				try {
					// 5. Get Input Parameters
					const businessId = this.getNodeParameter('businessId', i, '') as string;
					const hoursDataJson = this.getNodeParameter('hoursData', i, '[]') as string;

					// Parse and validate hoursData
					let hoursData: any[];
					try {
						hoursData = jsonParse(hoursDataJson);
						if (!Array.isArray(hoursData)) {
							throw new NodeOperationError(node, 'Hours Data must be a valid JSON array.', { itemIndex: i });
						}
						// Basic validation for each entry (can be enhanced)
						for (const entry of hoursData) {
							if (typeof entry !== 'object' || entry === null ||
							    typeof entry.day_of_week !== 'number' ||
								typeof entry.start_time !== 'string' ||
								typeof entry.end_time !== 'string' ||
								!/^[0-9]+$/.test(String(entry.day_of_week)) || // Ensure integer
								!/^[0-2][0-9]:[0-5][0-9]$/.test(entry.start_time) || // Basic HH:MM format
								!/^[0-2][0-9]:[0-5][0-9]$/.test(entry.end_time))
							{
								throw new NodeOperationError(node, `Invalid entry in Hours Data array: ${JSON.stringify(entry)}. Required format: {"day_of_week": number, "start_time": "HH:MM", "end_time": "HH:MM"}`, { itemIndex: i });
							}
							// Ensure day_of_week is within 1-7
							if (entry.day_of_week < 1 || entry.day_of_week > 7) {
								throw new NodeOperationError(node, `Invalid day_of_week (${entry.day_of_week}). Must be between 1 (Monday) and 7 (Sunday).`, { itemIndex: i });
							}
						}
					} catch (jsonError) {
						throw new NodeOperationError(node, `Invalid JSON in Hours Data field: ${jsonError.message}`, { itemIndex: i });
					}

					// 6. Define Cypher Query & Parameters
					// This query first deletes old hours, then unwinds the new data to create new hours nodes and relationships.
					const query = `
						MATCH (b:Business {business_id: $businessId})
						OPTIONAL MATCH (b)-[r:HAS_HOURS]->(oldBh:BusinessHours)
						DELETE r, oldBh
						WITH b
						UNWIND $hoursData AS dayHours
						CREATE (bh:BusinessHours {
							business_id: $businessId,
							day_of_week: toInteger(dayHours.day_of_week), // Ensure integer type
							start_time: time(dayHours.start_time),
							end_time: time(dayHours.end_time),
							created_at: datetime()
						})
						MERGE (b)-[:HAS_HOURS]->(bh)
						RETURN count(bh) AS hoursSetCount // Return count as confirmation
					`;

					const parameters: IDataObject = {
						businessId,
						hoursData, // Pass the parsed array
					};

					// 7. Execute Query (using session directly for complex transaction)
					if (!session) {
						throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
					}
					const result = await session.run(query, parameters);
					const count = result.records.length > 0 ? convertNeo4jValueToJs(result.records[0].get('hoursSetCount')) : 0;

					returnData.push({ json: { success: true, businessId: businessId, hoursSetCount: count }, pairedItem: { item: i } });


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
			if (items.length === 1) (error as any).itemIndex = 0; // Add index if possible
			throw parseNeo4jError(node, error);
		} finally {
			// 11. Close Session and Driver
			if (session) {
				try { await session.close(); } catch (e) { this.logger.error('Error closing Neo4j session:', e); }
			}
			if (driver) {
				try { await driver.close(); } catch (e) { this.logger.error('Error closing Neo4j driver:', e); }
			}
		}
	}
}
