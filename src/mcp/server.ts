import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { createParseClient } from "../parse/client.js";
import { createSchemaService } from "../parse/schema.js";
import { createCrudService } from "../parse/crud.js";
import { registerCrudTools } from "./tools/crud.js";
import { registerSchemaTools } from "./tools/schema.js";
import { registerSnapshotTools } from "./tools/snapshot.js";
import { registerQuerySnapshotTools } from "./tools/querySnapshot.js";
import { registerCodegenTools } from "./tools/codegen.js";

/**
 * Wires the Parse REST client, schema/CRUD services and MCP tool registrations into a single MCP server instance.
 *
 * @param config - Resolved app config.
 * @returns The configured {@link McpServer}, ready to `connect()` to a transport.
 */
export const createMcpServer = (config: Config): McpServer => {
  const server = new McpServer({ name: "parse-server-mcp", version: "0.1.0" });

  const client = createParseClient(config);
  const schemaService = createSchemaService(client);
  const crud = createCrudService(client, schemaService, { allowNewFields: config.allowNewFields });

  registerSchemaTools(server, schemaService);
  registerCrudTools(server, crud, config);
  registerSnapshotTools(server, config);
  registerQuerySnapshotTools(server, crud, config);
  registerCodegenTools(server, schemaService, config);

  return server;
};
