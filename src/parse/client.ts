import type { Config } from "../config.js";

export class ParseRequestError extends Error {
  readonly status: number;
  readonly parseError?: unknown;

  constructor(message: string, status: number, parseError?: unknown) {
    super(message);
    this.name = "ParseRequestError";
    this.status = status;
    this.parseError = parseError;
  }
}

export interface ParseClient {
  get: <T>(path: string, query?: Record<string, unknown>) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
}

/**
 * Builds the Parse REST headers for a request.
 *
 * @param config - Resolved app config holding the app id and whichever Parse keys are set.
 * @returns Header map with `X-Parse-Application-Id` and any configured `X-Parse-*-Key` headers.
 */
const buildHeaders = (config: Config): Record<string, string> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Parse-Application-Id": config.parseAppId,
  };
  if (config.parseMasterKey) {
    headers["X-Parse-Master-Key"] = config.parseMasterKey;
  }
  if (config.parseJavascriptKey) {
    headers["X-Parse-Javascript-Key"] = config.parseJavascriptKey;
  }
  if (config.parseRestApiKey) {
    headers["X-Parse-REST-API-Key"] = config.parseRestApiKey;
  }
  return headers;
};

/**
 * Resolves a Parse REST path into a full URL and serializes query params.
 *
 * @param baseUrl - Parse Server base URL (e.g. `https://example.com/parse`).
 * @param path - REST path relative to `baseUrl` (e.g. `classes/Foo`).
 * @param query - Optional query params; non-string values are JSON-encoded, as Parse expects for `where` (default: none).
 * @returns The fully resolved URL as a string.
 */
const buildUrl = (
  baseUrl: string,
  path: string,
  query?: Record<string, unknown>,
): string => {
  const url = new URL(path.replace(/^\//, ""), `${baseUrl.replace(/\/$/, "")}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
  }
  return url.toString();
};

/**
 * Performs a single REST call against Parse Server.
 *
 * @param config - Resolved app config used to build the URL and auth headers.
 * @param method - HTTP method (`GET`, `POST`, `PUT`, `DELETE`).
 * @param path - REST path relative to `config.parseServerUrl`.
 * @param options - Optional query params and/or JSON body (default: `{}`).
 * @returns The parsed JSON response body, cast to `T`.
 * @throws {ParseRequestError} On network failure or a non-2xx response from Parse.
 */
const request = async <T>(
  config: Config,
  method: string,
  path: string,
  options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<T> => {
  const url = buildUrl(config.parseServerUrl, path, options.query);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: buildHeaders(config),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    throw new ParseRequestError(
      `Network error calling Parse Server: ${(cause as Error).message}`,
      0,
    );
  }

  const text = await response.text();
  const json: unknown = text.length > 0 ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error: unknown }).error)
        : `Parse Server returned HTTP ${response.status}`;
    throw new ParseRequestError(message, response.status, json);
  }

  return json as T;
};

/**
 * Creates a typed HTTP client bound to a single Parse Server instance, used by every service in `src/parse/`.
 *
 * @param config - Resolved app config (server URL, app id, keys).
 * @returns A {@link ParseClient} exposing `get`/`post`/`put`/`del`.
 */
export const createParseClient = (config: Config): ParseClient => ({
  get: (path, query) => request(config, "GET", path, { query }),
  post: (path, body) => request(config, "POST", path, { body }),
  put: (path, body) => request(config, "PUT", path, { body }),
  del: (path) => request(config, "DELETE", path),
});
