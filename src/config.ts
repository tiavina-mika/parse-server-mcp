export type Transport = "stdio" | "http";

export interface Config {
  parseServerUrl: string;
  parseAppId: string;
  parseMasterKey?: string;
  parseJavascriptKey?: string;
  parseRestApiKey?: string;
  transport: Transport;
  port: number;
  mcpAuthToken?: string;
  snapshotDir: string;
  snapshotEnabled: boolean;
  allowNewFields: boolean;
  typesDir: string;
}

export interface ConfigOverrides {
  transport?: Transport;
  port?: number;
}

/**
 * Parses a "true"/"1" style env var into a boolean.
 *
 * @param value - Raw env var value (`string | undefined`).
 * @param defaultValue - Value returned when `value` is `undefined`.
 * @returns `true` if `value` is `"true"` or `"1"`, `false` otherwise (or `defaultValue` when unset).
 */
const readBool = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  return value === "true" || value === "1";
};

/**
 * Builds the runtime config from environment variables.
 *
 * @param overrides - CLI-provided values that take priority over env vars (default: `{}`).
 * @param overrides.transport - Forces `"stdio"` or `"http"` instead of reading `MCP_TRANSPORT`.
 * @param overrides.port - Forces the HTTP port instead of reading `PORT`.
 * @returns The resolved {@link Config}.
 * @throws If `PARSE_SERVER_URL` or `PARSE_APP_ID` is missing from the environment.
 */
export const loadConfig = (overrides: ConfigOverrides = {}): Config => {
  const env = process.env;

  const parseServerUrl = env.PARSE_SERVER_URL;
  const parseAppId = env.PARSE_APP_ID;

  if (!parseServerUrl) {
    throw new Error("PARSE_SERVER_URL is required");
  }
  if (!parseAppId) {
    throw new Error("PARSE_APP_ID is required");
  }

  return {
    parseServerUrl,
    parseAppId,
    parseMasterKey: env.PARSE_MASTER_KEY,
    parseJavascriptKey: env.PARSE_JAVASCRIPT_KEY,
    parseRestApiKey: env.PARSE_REST_API_KEY,
    transport: overrides.transport ?? (env.MCP_TRANSPORT as Transport | undefined) ?? "stdio",
    port: overrides.port ?? Number(env.PORT ?? 3939),
    mcpAuthToken: env.MCP_AUTH_TOKEN,
    snapshotDir: env.SNAPSHOT_DIR ?? "./snapshots",
    snapshotEnabled: readBool(env.SNAPSHOT_ENABLED, true),
    allowNewFields: readBool(env.ALLOW_NEW_FIELDS, false),
    typesDir: env.TYPES_DIR ?? "./types",
  };
};
