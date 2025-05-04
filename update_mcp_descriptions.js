"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs/promises");
var path = require("path");
var typescript_1 = require("typescript"); // Import TypeScript Compiler API
// --- Configuration ---
var nodesDir = path.join(__dirname, 'nodes');
var originalJsonFilePath = path.join(__dirname, 'DOCS', 'Booking_MCP_Server.json');
var outputJsonFilePath = path.join(__dirname, 'DOCS', 'Booking_MCP_Server_updated.json'); // New output file path
/**
 * Extracts the node type name from the .node.ts filename (lowercase).
 */
function getNodeTypeNameFromFilename(filename) {
    var match = filename.match(/^(.+)\.node\.ts$/);
    return match ? match[1].toLowerCase() : null;
}
// Helper function to extract name/description from an object literal expression
function extractFromObjectLiteral(element, sf) {
    var name;
    var description;
    element.properties.forEach(function (objProp) {
        if (typescript_1.default.isPropertyAssignment(objProp) && objProp.initializer) {
            var propName = objProp.name.getText(sf);
            if (propName === 'name' && typescript_1.default.isStringLiteral(objProp.initializer)) {
                name = objProp.initializer.text;
            }
            else if (propName === 'description') {
                if (typescript_1.default.isStringLiteral(objProp.initializer)) {
                    description = objProp.initializer.text;
                }
                else if (typescript_1.default.isNoSubstitutionTemplateLiteral(objProp.initializer)) {
                    description = objProp.initializer.text;
                }
                else if (typescript_1.default.isTemplateExpression(objProp.initializer)) {
                    description = objProp.initializer.head.text;
                    objProp.initializer.templateSpans.forEach(function (span) {
                        description += "{".concat(span.expression.getText(sf), "}"); // Placeholder
                        description += span.literal.text;
                    });
                }
            }
        }
    });
    if (description !== undefined) {
        description = description.replace(/\\`/g, '`').replace(/\\n/g, '\n').trim();
    }
    return { name: name, description: description };
}
/**
 * Extracts parameter names and descriptions using TypeScript AST.
 * Includes special handling for Neo4j.node.ts which uses spread syntax for properties.
 */
function extractDescriptionsFromNodeFileAST(filePath_1, content_1) {
    return __awaiter(this, arguments, void 0, function (filePath, content, visitedFiles) {
        function parsePropertiesArray(initializer, currentFilePath, currentSourceFile) {
            return __awaiter(this, void 0, void 0, function () {
                var _loop_1, _i, _a, element;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _loop_1 = function (element) {
                                var extracted, spreadExprText, importPath_1, variableName_1, importIdentifier_1, importedFilePath, importedContent, importedDescriptions, error_1;
                                return __generator(this, function (_c) {
                                    switch (_c.label) {
                                        case 0:
                                            if (!typescript_1.default.isObjectLiteralExpression(element)) return [3 /*break*/, 1];
                                            extracted = extractFromObjectLiteral(element, currentSourceFile);
                                            if (extracted.name && extracted.description !== undefined) {
                                                descriptions[extracted.name] = extracted.description;
                                            }
                                            return [3 /*break*/, 8];
                                        case 1:
                                            if (!typescript_1.default.isSpreadElement(element)) return [3 /*break*/, 8];
                                            spreadExprText = element.expression.getText(currentSourceFile);
                                            console.log("      --> [AST] Found SpreadElement: ".concat(spreadExprText, " in ").concat(currentFilePath));
                                            variableName_1 = spreadExprText;
                                            if (typescript_1.default.isPropertyAccessExpression(element.expression)) {
                                                variableName_1 = element.expression.name.getText(currentSourceFile);
                                                importIdentifier_1 = element.expression.expression.getText(currentSourceFile);
                                                typescript_1.default.forEachChild(currentSourceFile, function (node) {
                                                    if (typescript_1.default.isImportDeclaration(node) && node.importClause) {
                                                        var moduleSpecifier = node.moduleSpecifier.text;
                                                        if (node.importClause.namedBindings && typescript_1.default.isNamespaceImport(node.importClause.namedBindings)) {
                                                            if (node.importClause.namedBindings.name.getText(currentSourceFile) === importIdentifier_1) {
                                                                importPath_1 = moduleSpecifier;
                                                            }
                                                        }
                                                    }
                                                });
                                            }
                                            else if (typescript_1.default.isIdentifier(element.expression)) {
                                                variableName_1 = element.expression.getText(currentSourceFile);
                                                typescript_1.default.forEachChild(currentSourceFile, function (node) {
                                                    if (typescript_1.default.isImportDeclaration(node) && node.importClause) {
                                                        var moduleSpecifier_1 = node.moduleSpecifier.text;
                                                        if (node.importClause.namedBindings && typescript_1.default.isNamedImports(node.importClause.namedBindings)) {
                                                            node.importClause.namedBindings.elements.forEach(function (specifier) {
                                                                // Check if the imported name matches OR if the property name matches (for aliases)
                                                                if (specifier.name.getText(currentSourceFile) === variableName_1 ||
                                                                    (specifier.propertyName && specifier.propertyName.getText(currentSourceFile) === variableName_1)) {
                                                                    importPath_1 = moduleSpecifier_1;
                                                                }
                                                            });
                                                        }
                                                    }
                                                });
                                            }
                                            if (!importPath_1) return [3 /*break*/, 7];
                                            importedFilePath = path.resolve(path.dirname(currentFilePath), "".concat(importPath_1, ".ts"));
                                            console.log("      --> [AST] Spread element resolved to import: ".concat(variableName_1, " from ").concat(importedFilePath));
                                            _c.label = 2;
                                        case 2:
                                            _c.trys.push([2, 5, , 6]);
                                            return [4 /*yield*/, fs.readFile(importedFilePath, 'utf-8')];
                                        case 3:
                                            importedContent = _c.sent();
                                            return [4 /*yield*/, extractDescriptionsFromNodeFileAST(importedFilePath, importedContent, new Set(visitedFiles))];
                                        case 4:
                                            importedDescriptions = _c.sent();
                                            Object.assign(descriptions, importedDescriptions); // Merge results
                                            return [3 /*break*/, 6];
                                        case 5:
                                            error_1 = _c.sent();
                                            console.error("      --> [AST] Error reading or parsing imported file ".concat(importedFilePath, ":"), error_1);
                                            return [3 /*break*/, 6];
                                        case 6: return [3 /*break*/, 8];
                                        case 7:
                                            console.warn("      --> [AST] Could not resolve import path for spread element: ".concat(spreadExprText, " in ").concat(currentFilePath));
                                            _c.label = 8;
                                        case 8: return [2 /*return*/];
                                    }
                                });
                            };
                            _i = 0, _a = initializer.elements;
                            _b.label = 1;
                        case 1:
                            if (!(_i < _a.length)) return [3 /*break*/, 4];
                            element = _a[_i];
                            return [5 /*yield**/, _loop_1(element)];
                        case 2:
                            _b.sent();
                            _b.label = 3;
                        case 3:
                            _i++;
                            return [3 /*break*/, 1];
                        case 4: return [2 /*return*/];
                    }
                });
            });
        }
        function visit(node) {
            // Find top-level variable declarations (like in operations.ts or individual operation files)
            if (typescript_1.default.isVariableStatement(node)) {
                node.declarationList.declarations.forEach(function (declaration) {
                    // Look for exported 'description' array
                    if (declaration.name.getText(sourceFile) === 'description' && declaration.initializer && typescript_1.default.isArrayLiteralExpression(declaration.initializer)) {
                        console.log("      --> [AST] Found top-level 'description' array in ".concat(filePath));
                        parsePropertiesArray(declaration.initializer, filePath, sourceFile);
                    }
                    // Handle the nested structure in operations.ts
                    else if (declaration.name.getText(sourceFile) === 'description' && declaration.initializer && typescript_1.default.isObjectLiteralExpression(declaration.initializer)) {
                        declaration.initializer.properties.forEach(function (prop) {
                            if (typescript_1.default.isPropertyAssignment(prop) && prop.name.getText(sourceFile) === 'operations' && prop.initializer && typescript_1.default.isObjectLiteralExpression(prop.initializer)) {
                                prop.initializer.properties.forEach(function (opProp) {
                                    if (typescript_1.default.isPropertyAssignment(opProp) && opProp.name.getText(sourceFile) === 'properties' && opProp.initializer && typescript_1.default.isArrayLiteralExpression(opProp.initializer)) {
                                        console.log("      --> [AST] Found nested 'description.operations.properties' array in ".concat(filePath));
                                        parsePropertiesArray(opProp.initializer, filePath, sourceFile);
                                    }
                                });
                            }
                        });
                    }
                });
            }
            // Find class declarations (like in regular node files)
            else if (typescript_1.default.isClassDeclaration(node) && node.name) {
                node.members.forEach(function (member) {
                    if (typescript_1.default.isPropertyDeclaration(member) && member.name.getText(sourceFile) === 'description') {
                        if (member.initializer && typescript_1.default.isObjectLiteralExpression(member.initializer)) {
                            member.initializer.properties.forEach(function (prop) {
                                if (typescript_1.default.isPropertyAssignment(prop) && prop.name.getText(sourceFile) === 'properties') {
                                    if (prop.initializer && typescript_1.default.isArrayLiteralExpression(prop.initializer)) {
                                        parsePropertiesArray(prop.initializer, filePath, sourceFile);
                                    }
                                }
                            });
                        }
                    }
                });
            }
            typescript_1.default.forEachChild(node, visit);
        }
        var descriptions, sourceFile;
        if (visitedFiles === void 0) { visitedFiles = new Set(); }
        return __generator(this, function (_a) {
            descriptions = {};
            if (visitedFiles.has(filePath)) {
                console.warn("      --> [AST] Already visited ".concat(filePath, ", skipping to prevent circular dependency."));
                return [2 /*return*/, descriptions];
            }
            visitedFiles.add(filePath);
            sourceFile = typescript_1.default.createSourceFile(filePath, content, typescript_1.default.ScriptTarget.ES2019, true);
            visit(sourceFile);
            console.log("    --> [AST] Final extracted descriptions for ".concat(filePath, ": ").concat(JSON.stringify(Object.keys(descriptions))));
            return [2 /*return*/, descriptions];
        });
    });
}
/**
 * Converts camelCase string to snake_case.
 */
function camelToSnakeCase(str) {
    str = str.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
    str = str.replace(/([a-z\d])([A-Z])/g, '$1_$2');
    return str.toLowerCase();
}
/**
 * Updates the description in the $fromAI string using Regex.
 */
function updateFromAIString(originalString, newDescription) {
    var fromAIRegex = /(\$fromAI\s*\(\s*['"].*?['"]\s*,\s*[`'"])(.*?)([`'"]\s*,\s*['"].*?['"]\s*\)\s*\}\})/s;
    var escapedDescription = newDescription.replace(/`/g, '\\`'); // Escape backticks for template literal safety
    var match = originalString.match(fromAIRegex);
    if (!match) {
        console.warn("      --> WARNING: Regex did NOT match original string in updateFromAIString: \"".concat(originalString, "\""));
        return originalString; // Return original if regex fails
    }
    var safeEscapedDescription = escapedDescription.replace(/\$\{/g, '\\${');
    var result = originalString.replace(fromAIRegex, "$1".concat(safeEscapedDescription, "$3"));
    return result;
}
/**
 * Main function to update the JSON file.
 */
function updateDescriptions() {
    return __awaiter(this, void 0, void 0, function () {
        var allDescriptions, nodeFolders, _i, nodeFolders_1, dirent, nodeFolderPath, nodeFiles, nodeTsFile, nodeTypeName, filePath, content, descriptions, readError_1, jsonContent, jsonString, jsonError_1, updatedCount, _a, _b, node, typeParts, nodeTypeNameFromJson, nodeDescriptions, paramName, descriptionKeyToUse, newDescription, snakeCaseParamName, originalValue, fromAIRegexForExtraction, matchResult, currentDescriptionInJson, trimmedNewDescription, descriptionsDiffer, updatedValue, updatedJsonString, writeError_1, error_2;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    console.log('Starting description update process using AST...');
                    allDescriptions = {};
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 21, , 22]);
                    // 1. Scan nodes directory and extract descriptions using AST
                    console.log("Scanning directory: ".concat(nodesDir));
                    return [4 /*yield*/, fs.readdir(nodesDir, { withFileTypes: true })];
                case 2:
                    nodeFolders = _c.sent();
                    _i = 0, nodeFolders_1 = nodeFolders;
                    _c.label = 3;
                case 3:
                    if (!(_i < nodeFolders_1.length)) return [3 /*break*/, 10];
                    dirent = nodeFolders_1[_i];
                    if (!dirent.isDirectory()) return [3 /*break*/, 9];
                    nodeFolderPath = path.join(nodesDir, dirent.name);
                    return [4 /*yield*/, fs.readdir(nodeFolderPath)];
                case 4:
                    nodeFiles = _c.sent();
                    nodeTsFile = nodeFiles.find(function (file) { return file.endsWith('.node.ts'); });
                    if (!nodeTsFile) return [3 /*break*/, 9];
                    nodeTypeName = getNodeTypeNameFromFilename(nodeTsFile);
                    if (!nodeTypeName) {
                        console.warn("Could not extract node type name from ".concat(nodeTsFile));
                        return [3 /*break*/, 9];
                    }
                    filePath = path.join(nodeFolderPath, nodeTsFile);
                    console.log("Processing node file: ".concat(filePath));
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 8, , 9]);
                    return [4 /*yield*/, fs.readFile(filePath, 'utf-8')];
                case 6:
                    content = _c.sent();
                    return [4 /*yield*/, extractDescriptionsFromNodeFileAST(filePath, content)];
                case 7:
                    descriptions = _c.sent();
                    if (Object.keys(descriptions).length > 0) {
                        allDescriptions[nodeTypeName] = __assign(__assign({}, (allDescriptions[nodeTypeName] || {})), descriptions);
                        console.log(" -> Found/Updated ".concat(Object.keys(descriptions).length, " descriptions for ").concat(nodeTypeName));
                    }
                    else {
                        console.warn(" -> No descriptions extracted via AST from ".concat(nodeTypeName));
                    }
                    return [3 /*break*/, 9];
                case 8:
                    readError_1 = _c.sent();
                    console.error("Error reading file ".concat(filePath, ":"), readError_1);
                    return [3 /*break*/, 9];
                case 9:
                    _i++;
                    return [3 /*break*/, 3];
                case 10:
                    console.log("\nExtracted descriptions for ".concat(Object.keys(allDescriptions).length, " node types."));
                    // 2. Read and parse the target JSON file
                    console.log("\nReading original JSON file: ".concat(originalJsonFilePath));
                    jsonContent = void 0;
                    _c.label = 11;
                case 11:
                    _c.trys.push([11, 13, , 14]);
                    return [4 /*yield*/, fs.readFile(originalJsonFilePath, 'utf-8')];
                case 12:
                    jsonString = _c.sent();
                    jsonContent = JSON.parse(jsonString);
                    return [3 /*break*/, 14];
                case 13:
                    jsonError_1 = _c.sent();
                    console.error("Error reading or parsing JSON file ".concat(originalJsonFilePath, ":"), jsonError_1);
                    return [2 /*return*/];
                case 14:
                    // 3. Update descriptions in the JSON object
                    console.log('Updating descriptions in JSON...');
                    updatedCount = 0;
                    if (jsonContent && jsonContent.nodes && Array.isArray(jsonContent.nodes)) {
                        for (_a = 0, _b = jsonContent.nodes; _a < _b.length; _a++) {
                            node = _b[_a];
                            if (node.type && typeof node.type === 'string' && node.parameters && typeof node.parameters === 'object') {
                                typeParts = node.type.split('.');
                                nodeTypeNameFromJson = typeParts.length > 1 ? typeParts[1].replace(/Tool$/, '').toLowerCase() : null;
                                // *** ADDED EXCLUSION ***
                                if (nodeTypeNameFromJson === 'neo4j') {
                                    console.log(" -> Skipping excluded node type: ".concat(nodeTypeNameFromJson, " (from JSON type: ").concat(node.type, ")"));
                                    continue; // Skip this node entirely
                                }
                                // *** END EXCLUSION ***
                                if (nodeTypeNameFromJson && allDescriptions[nodeTypeNameFromJson]) {
                                    nodeDescriptions = allDescriptions[nodeTypeNameFromJson];
                                    for (paramName in node.parameters) {
                                        descriptionKeyToUse = null;
                                        newDescription = null;
                                        if (Object.prototype.hasOwnProperty.call(nodeDescriptions, paramName)) {
                                            descriptionKeyToUse = paramName;
                                            newDescription = nodeDescriptions[paramName];
                                        }
                                        else {
                                            snakeCaseParamName = camelToSnakeCase(paramName);
                                            if (Object.prototype.hasOwnProperty.call(nodeDescriptions, snakeCaseParamName)) {
                                                descriptionKeyToUse = snakeCaseParamName;
                                                newDescription = nodeDescriptions[snakeCaseParamName];
                                            }
                                        }
                                        if (descriptionKeyToUse && newDescription !== null) {
                                            originalValue = node.parameters[paramName];
                                            if (typeof originalValue === 'string' && originalValue.includes('$fromAI')) {
                                                fromAIRegexForExtraction = /(\$fromAI\s*\(\s*['"].*?['"]\s*,\s*[`'"])(.*?)([`'"]\s*,\s*['"].*?['"]\s*\)\s*\}\})/s;
                                                matchResult = originalValue.match(fromAIRegexForExtraction);
                                                currentDescriptionInJson = matchResult && matchResult[2] ? matchResult[2].replace(/\\`/g, '`').trim() : '';
                                                trimmedNewDescription = newDescription.trim();
                                                descriptionsDiffer = trimmedNewDescription !== currentDescriptionInJson;
                                                if (descriptionsDiffer) {
                                                    updatedValue = updateFromAIString(originalValue, newDescription);
                                                    if (updatedValue !== originalValue) {
                                                        console.log("    - Param: ".concat(paramName, " (Key used: ").concat(descriptionKeyToUse, ")"));
                                                        console.log("      - TS Desc : \"".concat(trimmedNewDescription, "\""));
                                                        console.log("      - JSON Desc: \"".concat(currentDescriptionInJson, "\""));
                                                        console.log("      - UPDATING description for parameter: ".concat(paramName));
                                                        node.parameters[paramName] = updatedValue;
                                                        updatedCount++;
                                                    }
                                                    else {
                                                        console.log("    - Param: ".concat(paramName, " (Key used: ").concat(descriptionKeyToUse, ")"));
                                                        console.log("      - TS Desc : \"".concat(trimmedNewDescription, "\""));
                                                        console.log("      - JSON Desc: \"".concat(currentDescriptionInJson, "\""));
                                                        console.log("      - CRITICAL WARNING: Descriptions differ but string replacement failed! Skipping update.");
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                else if (nodeTypeNameFromJson) {
                                    console.log(" -> WARNING: No descriptions found in map for derived node type: ".concat(nodeTypeNameFromJson, " (from JSON type: ").concat(node.type, ")"));
                                }
                                else {
                                    console.log(" -> WARNING: Could not derive node type name from JSON type: ".concat(node.type));
                                }
                            }
                        }
                    }
                    else {
                        console.error('Invalid JSON structure: "nodes" array not found.');
                        return [2 /*return*/];
                    }
                    if (!(updatedCount > 0)) return [3 /*break*/, 19];
                    console.log("\nWriting updated JSON to ".concat(outputJsonFilePath, "... (").concat(updatedCount, " descriptions updated)"));
                    _c.label = 15;
                case 15:
                    _c.trys.push([15, 17, , 18]);
                    updatedJsonString = JSON.stringify(jsonContent, null, 2);
                    return [4 /*yield*/, fs.writeFile(outputJsonFilePath, updatedJsonString, 'utf-8')];
                case 16:
                    _c.sent();
                    console.log('New JSON file created successfully!');
                    return [3 /*break*/, 18];
                case 17:
                    writeError_1 = _c.sent();
                    console.error("Error writing updated JSON to ".concat(outputJsonFilePath, ":"), writeError_1);
                    return [3 /*break*/, 18];
                case 18: return [3 /*break*/, 20];
                case 19:
                    console.log('\nNo descriptions needed updating. No output file created.');
                    _c.label = 20;
                case 20: return [3 /*break*/, 22];
                case 21:
                    error_2 = _c.sent();
                    console.error('An unexpected error occurred:', error_2);
                    return [3 /*break*/, 22];
                case 22: return [2 /*return*/];
            }
        });
    });
}
// Run the update process
updateDescriptions();
