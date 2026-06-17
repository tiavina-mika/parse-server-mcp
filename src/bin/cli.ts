#!/usr/bin/env node
import { Command } from "commander";
import express from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig, type Transport } from "../config.js";
import { createMcpServer } from "../mcp/server.js";

const program = new Command();
program
  .name("parse-server-mcp")
  .option("--transport <type>", "stdio | http")
  .option("--port <number>", "port for http transport")
  .parse(process.argv);

const opts = program.opts<{ transport?: string; port?: string }>();

const config = loadConfig({
  transport: opts.transport as Transport | undefined,
  port: opts.port ? Number(opts.port) : undefined,
});

/** Starts the MCP server over stdio, the default transport for local clients (Claude CLI/Desktop, Cursor). */
const runStdio = async (): Promise<void> => {
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`parse-server-mcp connected via stdio to ${config.parseServerUrl}`);
};

/** Starts the MCP server over HTTP for remote/shared access; a fresh MCP server instance is created per `/mcp` request. */
const runHttp = async (): Promise<void> => {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    if (!config.mcpAuthToken) {
      next();
      return;
    }
    const authHeader = req.header("authorization");
    if (authHeader === `Bearer ${config.mcpAuthToken}`) {
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", parseServerUrl: config.parseServerUrl });
  });

  app.post("/mcp", async (req, res) => {
    const server = createMcpServer(config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(config.port, () => {
    console.error(`parse-server-mcp listening on http://localhost:${config.port}/mcp`);
    console.error(`Connected to Parse Server at ${config.parseServerUrl}`);
    if (!config.mcpAuthToken) {
      console.error("WARNING: MCP_AUTH_TOKEN is not set, /mcp is unauthenticated.");
    }
  });
};

/** Entry point: picks stdio or HTTP transport based on the resolved config. */
const main = async (): Promise<void> => {
  if (config.transport === "http") {
    await runHttp();
  } else {
    await runStdio();
  }
};

main().catch((cause) => {
  console.error("parse-server-mcp failed to start:", cause);
  process.exitCode = 1;
});
