import * as fs from 'fs/promises';
import * as path from 'path';
import ts from 'typescript'; // Import TypeScript Compiler API

// --- Configuration ---
const nodesDir = path.join(__dirname, 'nodes');
const originalJsonFilePath = path.join(__dirname, 'DOCS', 'Booking_MCP_Server.json');
const outputJsonFilePath = path.join(__dirname, 'DOCS', 'Booking_MCP_Server_updated.json'); // New output file path
// --- End Configuration ---

interface NodeDescriptionInfo {
    [paramName: string]: string; // Map parameter name to its description
}

interface AllNodeDescriptions {
    [nodeTypeName: string]: NodeDescriptionInfo; // Map node type name (e.g., neo4jcreateuser) to its parameter descriptions
}

/**
 * Extracts the node type name from the .node.ts filename (lowercase).
 */
function getNodeTypeNameFromFilename(filename: string): string | null {
    const match = filename.match(/^(.+)\.node\.ts$/);
    return match ? match[1].toLowerCase() : null;
}

// Helper function to extract name/description from an object literal expression
function extractFromObjectLiteral(element: ts.ObjectLiteralExpression, sf: ts.SourceFile): { name?: string; description?: string } {
    let name: string | undefined;
    let description: string | undefined;
    element.properties.forEach(objProp => {
        if (ts.isPropertyAssignment(objProp) && objProp.initializer) {
            const propName = objProp.name.getText(sf);
            if (propName === 'name' && ts.isStringLiteral(objProp.initializer)) {
                name = objProp.initializer.text;
            } else if (propName === 'description') {
                if (ts.isStringLiteral(objProp.initializer)) {
                    description = objProp.initializer.text;
                } else if (ts.isNoSubstitutionTemplateLiteral(objProp.initializer)) {
                    description = objProp.initializer.text;
                } else if (ts.isTemplateExpression(objProp.initializer)) {
                    description = objProp.initializer.head.text;
                    objProp.initializer.templateSpans.forEach(span => {
                        description += `{${span.expression.getText(sf)}}`; // Placeholder
                        description += span.literal.text;
                    });
                }
            }
        }
    });
    if (description !== undefined) {
        description = description.replace(/\\`/g, '`').replace(/\\n/g, '\n').trim();
    }
    return { name, description };
}


/**
 * Extracts parameter names and descriptions using TypeScript AST.
 * Includes special handling for Neo4j.node.ts which uses spread syntax for properties.
 */
async function extractDescriptionsFromNodeFileAST(filePath: string, content: string, visitedFiles: Set<string> = new Set()): Promise<NodeDescriptionInfo> {
    const descriptions: NodeDescriptionInfo = {};
    if (visitedFiles.has(filePath)) {
        console.warn(`      --> [AST] Already visited ${filePath}, skipping to prevent circular dependency.`);
        return descriptions;
    }
    visitedFiles.add(filePath);

    // console.log(`      --> [AST] Parsing file: ${filePath}`); // Reduce noise
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ES2019, true);

    async function parsePropertiesArray(initializer: ts.ArrayLiteralExpression, currentFilePath: string, currentSourceFile: ts.SourceFile) {
        for (const element of initializer.elements) {
            if (ts.isObjectLiteralExpression(element)) {
                const extracted = extractFromObjectLiteral(element, currentSourceFile);
                if (extracted.name && extracted.description !== undefined) {
                    descriptions[extracted.name] = extracted.description;
                }
            } else if (ts.isSpreadElement(element)) {
                const spreadExprText = element.expression.getText(currentSourceFile);
                console.log(`      --> [AST] Found SpreadElement: ${spreadExprText} in ${currentFilePath}`);

                let importPath: string | undefined;
                let variableName = spreadExprText;

                if (ts.isPropertyAccessExpression(element.expression)) {
                     variableName = element.expression.name.getText(currentSourceFile);
                     const importIdentifier = element.expression.expression.getText(currentSourceFile);
                     ts.forEachChild(currentSourceFile, node => {
                         if (ts.isImportDeclaration(node) && node.importClause) {
                             const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
                             if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
                                 if (node.importClause.namedBindings.name.getText(currentSourceFile) === importIdentifier) {
                                     importPath = moduleSpecifier;
                                 }
                             }
                         }
                     });
                } else if (ts.isIdentifier(element.expression)) {
                     variableName = element.expression.getText(currentSourceFile);
                      ts.forEachChild(currentSourceFile, node => {
                         if (ts.isImportDeclaration(node) && node.importClause) {
                             const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
                              if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                                 node.importClause.namedBindings.elements.forEach(specifier => {
                                     // Check if the imported name matches OR if the property name matches (for aliases)
                                     if (specifier.name.getText(currentSourceFile) === variableName ||
                                         (specifier.propertyName && specifier.propertyName.getText(currentSourceFile) === variableName)) {
                                         importPath = moduleSpecifier;
                                     }
                                 });
                             }
                         }
                     });
                }

                if (importPath) {
                    // Construct the absolute path, assuming relative paths from the current file
                    const importedFilePath = path.resolve(path.dirname(currentFilePath), `${importPath}.ts`);
                    console.log(`      --> [AST] Spread element resolved to import: ${variableName} from ${importedFilePath}`);
                    try {
                        const importedContent = await fs.readFile(importedFilePath, 'utf-8');
                        const importedDescriptions = await extractDescriptionsFromNodeFileAST(importedFilePath, importedContent, new Set(visitedFiles));
                        Object.assign(descriptions, importedDescriptions); // Merge results
                    } catch (error) {
                        console.error(`      --> [AST] Error reading or parsing imported file ${importedFilePath}:`, error);
                    }
                } else {
                     console.warn(`      --> [AST] Could not resolve import path for spread element: ${spreadExprText} in ${currentFilePath}`);
                }
            }
        }
    }

    function visit(node: ts.Node) {
        // Find top-level variable declarations (like in operations.ts or individual operation files)
        if (ts.isVariableStatement(node)) {
             node.declarationList.declarations.forEach(declaration => {
                 // Look for exported 'description' array
                 if (declaration.name.getText(sourceFile) === 'description' && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)) {
                     console.log(`      --> [AST] Found top-level 'description' array in ${filePath}`);
                     parsePropertiesArray(declaration.initializer, filePath, sourceFile);
                 }
                 // Handle the nested structure in operations.ts
                 else if (declaration.name.getText(sourceFile) === 'description' && declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer)) {
                     declaration.initializer.properties.forEach(prop => {
                         if (ts.isPropertyAssignment(prop) && prop.name.getText(sourceFile) === 'operations' && prop.initializer && ts.isObjectLiteralExpression(prop.initializer)) {
                             prop.initializer.properties.forEach(opProp => {
                                 if (ts.isPropertyAssignment(opProp) && opProp.name.getText(sourceFile) === 'properties' && opProp.initializer && ts.isArrayLiteralExpression(opProp.initializer)) {
                                     console.log(`      --> [AST] Found nested 'description.operations.properties' array in ${filePath}`);
                                     parsePropertiesArray(opProp.initializer, filePath, sourceFile);
                                 }
                             });
                         }
                     });
                 }
             });
        }
        // Find class declarations (like in regular node files)
        else if (ts.isClassDeclaration(node) && node.name) {
            node.members.forEach(member => {
                if (ts.isPropertyDeclaration(member) && member.name.getText(sourceFile) === 'description') {
                    if (member.initializer && ts.isObjectLiteralExpression(member.initializer)) {
                        member.initializer.properties.forEach(prop => {
                            if (ts.isPropertyAssignment(prop) && prop.name.getText(sourceFile) === 'properties') {
                                if (prop.initializer && ts.isArrayLiteralExpression(prop.initializer)) {
                                    parsePropertiesArray(prop.initializer, filePath, sourceFile);
                                }
                            }
                        });
                    }
                }
            });
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    console.log(`    --> [AST] Final extracted descriptions for ${filePath}: ${JSON.stringify(Object.keys(descriptions))}`);
    return descriptions;
}


/**
 * Converts camelCase string to snake_case.
 */
function camelToSnakeCase(str: string): string {
  str = str.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
  str = str.replace(/([a-z\d])([A-Z])/g, '$1_$2');
  return str.toLowerCase();
}


/**
 * Updates the description in the $fromAI string using Regex.
 */
function updateFromAIString(originalString: string, newDescription: string): string {
    const fromAIRegex = /(\$fromAI\s*\(\s*['"].*?['"]\s*,\s*[`'"])(.*?)([`'"]\s*,\s*['"].*?['"]\s*\)\s*\}\})/s;
    const escapedDescription = newDescription.replace(/`/g, '\\`'); // Escape backticks for template literal safety

    const match = originalString.match(fromAIRegex);
    if (!match) {
        console.warn(`      --> WARNING: Regex did NOT match original string in updateFromAIString: "${originalString}"`);
        return originalString; // Return original if regex fails
    }

    const safeEscapedDescription = escapedDescription.replace(/\$\{/g, '\\${');
    const result = originalString.replace(fromAIRegex, `$1${safeEscapedDescription}$3`);
    return result;
}

/**
 * Main function to update the JSON file.
 */
async function updateDescriptions() {
    console.log('Starting description update process using AST...');
    const allDescriptions: AllNodeDescriptions = {};

    try {
        // 1. Scan nodes directory and extract descriptions using AST
        console.log(`Scanning directory: ${nodesDir}`);
        const nodeFolders = await fs.readdir(nodesDir, { withFileTypes: true });

        for (const dirent of nodeFolders) {
            if (dirent.isDirectory()) {
                const nodeFolderPath = path.join(nodesDir, dirent.name);
                const nodeFiles = await fs.readdir(nodeFolderPath);
                const nodeTsFile = nodeFiles.find(file => file.endsWith('.node.ts'));

                if (nodeTsFile) {
                    const nodeTypeName = getNodeTypeNameFromFilename(nodeTsFile); // lowercase
                    if (!nodeTypeName) {
                        console.warn(`Could not extract node type name from ${nodeTsFile}`);
                        continue;
                    }

                    const filePath = path.join(nodeFolderPath, nodeTsFile);
                    console.log(`Processing node file: ${filePath}`);
                    try {
                        const content = await fs.readFile(filePath, 'utf-8');
                        const descriptions = await extractDescriptionsFromNodeFileAST(filePath, content);
                        if (Object.keys(descriptions).length > 0) {
                            allDescriptions[nodeTypeName] = { ...(allDescriptions[nodeTypeName] || {}), ...descriptions };
                            console.log(` -> Found/Updated ${Object.keys(descriptions).length} descriptions for ${nodeTypeName}`);
                        } else {
                             console.warn(` -> No descriptions extracted via AST from ${nodeTypeName}`);
                        }
                    } catch (readError) {
                        console.error(`Error reading file ${filePath}:`, readError);
                    }
                }
            }
        }
        console.log(`\nExtracted descriptions for ${Object.keys(allDescriptions).length} node types.`);


        // 2. Read and parse the target JSON file
        console.log(`\nReading original JSON file: ${originalJsonFilePath}`);
        let jsonContent: any;
        try {
            const jsonString = await fs.readFile(originalJsonFilePath, 'utf-8');
            jsonContent = JSON.parse(jsonString);
        } catch (jsonError) {
            console.error(`Error reading or parsing JSON file ${originalJsonFilePath}:`, jsonError);
            return;
        }

        // 3. Update descriptions in the JSON object
        console.log('Updating descriptions in JSON...');
        let updatedCount = 0;
        if (jsonContent && jsonContent.nodes && Array.isArray(jsonContent.nodes)) {
            for (const node of jsonContent.nodes) {
                if (node.type && typeof node.type === 'string' && node.parameters && typeof node.parameters === 'object') {
                    const typeParts = node.type.split('.');
                    const nodeTypeNameFromJson = typeParts.length > 1 ? typeParts[1].replace(/Tool$/, '').toLowerCase() : null;

                    // *** ADDED EXCLUSION ***
                    if (nodeTypeNameFromJson === 'neo4j') {
                        console.log(` -> Skipping excluded node type: ${nodeTypeNameFromJson} (from JSON type: ${node.type})`);
                        continue; // Skip this node entirely
                    }
                    // *** END EXCLUSION ***


                    if (nodeTypeNameFromJson && allDescriptions[nodeTypeNameFromJson]) {
                        const nodeDescriptions = allDescriptions[nodeTypeNameFromJson];

                        for (const paramName in node.parameters) {
                            let descriptionKeyToUse: string | null = null;
                            let newDescription: string | null = null;

                            if (Object.prototype.hasOwnProperty.call(nodeDescriptions, paramName)) {
                                descriptionKeyToUse = paramName;
                                newDescription = nodeDescriptions[paramName];
                            } else {
                                const snakeCaseParamName = camelToSnakeCase(paramName);
                                if (Object.prototype.hasOwnProperty.call(nodeDescriptions, snakeCaseParamName)) {
                                    descriptionKeyToUse = snakeCaseParamName;
                                    newDescription = nodeDescriptions[snakeCaseParamName];
                                }
                            }

                            if (descriptionKeyToUse && newDescription !== null) {
                                const originalValue = node.parameters[paramName];

                                if (typeof originalValue === 'string' && originalValue.includes('$fromAI')) {
                                    const fromAIRegexForExtraction = /(\$fromAI\s*\(\s*['"].*?['"]\s*,\s*[`'"])(.*?)([`'"]\s*,\s*['"].*?['"]\s*\)\s*\}\})/s;
                                    const matchResult = originalValue.match(fromAIRegexForExtraction);
                                    const currentDescriptionInJson = matchResult && matchResult[2] ? matchResult[2].replace(/\\`/g, '`').trim() : '';

                                    const trimmedNewDescription = newDescription.trim();
                                    const descriptionsDiffer = trimmedNewDescription !== currentDescriptionInJson;

                                    if (descriptionsDiffer) {
                                        const updatedValue = updateFromAIString(originalValue, newDescription);
                                        if (updatedValue !== originalValue) {
                                            console.log(`    - Param: ${paramName} (Key used: ${descriptionKeyToUse})`);
                                            console.log(`      - TS Desc : "${trimmedNewDescription}"`);
                                            console.log(`      - JSON Desc: "${currentDescriptionInJson}"`);
                                            console.log(`      - UPDATING description for parameter: ${paramName}`);
                                            node.parameters[paramName] = updatedValue;
                                            updatedCount++;
                                        } else {
                                             console.log(`    - Param: ${paramName} (Key used: ${descriptionKeyToUse})`);
                                             console.log(`      - TS Desc : "${trimmedNewDescription}"`);
                                             console.log(`      - JSON Desc: "${currentDescriptionInJson}"`);
                                             console.log(`      - CRITICAL WARNING: Descriptions differ but string replacement failed! Skipping update.`);
                                        }
                                    }
                                }
                            }
                        }
                    } else if (nodeTypeNameFromJson) {
                         console.log(` -> WARNING: No descriptions found in map for derived node type: ${nodeTypeNameFromJson} (from JSON type: ${node.type})`);
                    } else {
                         console.log(` -> WARNING: Could not derive node type name from JSON type: ${node.type}`);
                    }
                }
            }
        } else {
            console.error('Invalid JSON structure: "nodes" array not found.');
            return;
        }

        // 4. Write the updated JSON to the new file
        if (updatedCount > 0) {
            console.log(`\nWriting updated JSON to ${outputJsonFilePath}... (${updatedCount} descriptions updated)`);
            try {
                const updatedJsonString = JSON.stringify(jsonContent, null, 2);
                await fs.writeFile(outputJsonFilePath, updatedJsonString, 'utf-8');
                console.log('New JSON file created successfully!');
            } catch (writeError) {
                console.error(`Error writing updated JSON to ${outputJsonFilePath}:`, writeError);
            }
        } else {
            console.log('\nNo descriptions needed updating. No output file created.');
        }

    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
}

// Run the update process
updateDescriptions();
