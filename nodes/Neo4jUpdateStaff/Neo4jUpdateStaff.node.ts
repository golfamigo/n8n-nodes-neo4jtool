// ============================================================================
// N8N Neo4j Node: Update Staff
// ============================================================================
import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import neo4j, { Driver, Session, auth } from 'neo4j-driver';

// --- IMPORTANT: Shared Utilities ---
import {
	runCypherQuery,
	parseNeo4jError,
} from '../neo4j/helpers/utils';

// --- Node Class Definition ---
export class Neo4jUpdateStaff implements INodeType {

	// --- Node Description for n8n UI ---
	description: INodeTypeDescription = {
		displayName: 'Neo4j Update Staff',
		name: 'neo4jUpdateStaff',
		icon: 'file:../neo4j/neo4j.svg',
		group: ['database'],
		version: 1,
		subtitle: '={{$parameter["staffId"]}}',
		description: '根據 staff_id 更新員工資訊。,staffId: 要更新的員工 staff_id (UUID),name: 新的員工姓名 (可選),email: 新的員工電子郵件 (可選),phone: 新的員工電話號碼 (可選)。',
		defaults: {
			name: 'Neo4j Update Staff',
		},
		inputs: ['main'],
		outputs: ['main'],
		// @ts-ignore - Workaround
		usableAsTool: true,
		credentials: [ { name: 'neo4jApi', required: true } ],
		properties: [
			{
				displayName: 'Staff ID',
				name: 'staffId',
				type: 'string',
				required: true,
				default: '',
				description: '要更新的員工 staff_id',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: '新的員工姓名 (可選)',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '',
				placeholder: 'staff@email.com',
				description: '新的員工電子郵件 (可選)',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				description: '新的員工電話號碼 (可選)',
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
					const staffId = this.getNodeParameter('staffId', i, '') as string;
					const name = this.getNodeParameter('name', i, '') as string;
					const email = this.getNodeParameter('email', i, '') as string;
					const phone = this.getNodeParameter('phone', i, '') as string;

					// Build SET clause dynamically
					const setClauses: string[] = [];
					const parameters: IDataObject = { staffId };

					if (name !== undefined && name !== '') { setClauses.push('st.name = $name'); parameters.name = name; }
					if (email !== undefined && email !== '') { setClauses.push('st.email = $email'); parameters.email = email; }
					if (phone !== undefined && phone !== '') { setClauses.push('st.phone = $phone'); parameters.phone = phone; }

					if (setClauses.length === 0) {
						this.logger.warn(`No update parameters provided for Staff ID: ${staffId}. Returning current data.`);
						const findQuery = 'MATCH (st:Staff {staff_id: $staffId}) RETURN st {.*} AS staff';
						const findParams = { staffId };
						if (!session) throw new NodeOperationError(node, 'Neo4j session is not available.', { itemIndex: i });
						const findResults = await runCypherQuery.call(this, session, findQuery, findParams, false, i);
						returnData.push(...findResults);
						continue;
					}

					// Add updated_at timestamp
					setClauses.push('st.updated_at = datetime()');

					// 6. Define Specific Cypher Query
					const query = `
						MATCH (st:Staff {staff_id: $staffId})
						SET ${setClauses.join(', ')}
						RETURN st {.*} AS staff
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
			if (items.length === 1) (error as any).itemIndex = 0;
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
