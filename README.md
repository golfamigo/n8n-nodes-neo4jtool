# n8n-nodes-neo4j

This is an n8n community node. It lets you use Neo4j in your n8n workflows.

Neo4j is a native graph database platform, built from the ground up to leverage not only data but also data relationships.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)
[Compatibility](#compatibility)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

*   **Execute Cypher Query**: Execute a raw Cypher query against the database.
*   **Create Node**: Create a new node with specified labels and properties.
*   **Match Nodes**: Find nodes based on labels and properties.
*   **Update Node**: Update properties of existing nodes based on match criteria.
*   **Delete Node**: Delete nodes based on match criteria, with an option to detach relationships first.
*   **Create Relationship**: Create a relationship of a specified type with optional properties between two matched nodes.

## Credentials

To use this node, you need to configure Neo4j credentials in n8n. This requires the following information from your Neo4j instance:

*   **Host**: The host address of your Neo4j instance, including the protocol (e.g., `neo4j://localhost`, `bolt://your-server.com`, `neo4j+s://your-aura-instance.databases.neo4j.io`).
*   **Port**: The Bolt port number for your Neo4j instance (typically `7687`).
*   **Database**: The name of the database to connect to (optional, defaults to `neo4j`).
*   **Username**: The username for authenticating with Neo4j.
*   **Password**: The password for the specified username.

## Compatibility

*   Minimum n8n version: (Requires testing, likely >=1.0)
*   Minimum Node.js version: >=18.10 (as specified in `package.json`)

## Resources

*   [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
*   [Neo4j Documentation](https://neo4j.com/docs/)
