// This file acts as an entry point for methods callable from the n8n UI.

// Export credential testing function
export { credentialTest } from './credentialTest';
export { resourceMapping } from './resourceMapping';

// Import load options functions
import { getNodeLabels, getRelationshipTypes, getPropertyKeys } from './loadOptions';

// Export load options functions grouped in an object
export const loadOptions = {
	getNodeLabels,
	getRelationshipTypes,
	getPropertyKeys,
};

// Export other methods if needed
