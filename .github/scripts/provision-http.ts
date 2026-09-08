export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonObject
  | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };
export type RequestFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
export type HttpMethod = "GET" | "PATCH" | "POST" | "PUT";

export class HttpStatusError extends Error {
  override readonly name = "HttpStatusError";

  constructor(
    readonly status: number,
    readonly method: HttpMethod,
    readonly path: string,
  ) {
    super(`HTTP ${status} for ${method} ${path}`);
  }
}

export class HttpResponseError extends Error {
  override readonly name = "HttpResponseError";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpResponseError(`Response is missing ${key}`);
  }
  return value;
}

export async function requestJson(options: {
  readonly baseUrl: string;
  readonly fetcher: RequestFetcher;
  readonly token: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly body?: JsonValue;
}): Promise<unknown> {
  const headers = new Headers({
    Authorization: `Bearer ${options.token}`,
    Accept: "application/json",
  });
  const init: RequestInit = { method: options.method, headers };
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await options.fetcher(`${options.baseUrl}${options.path}`, init);
  } catch (error) {
    if (error instanceof Error) {
      throw new HttpResponseError(
        `HTTP request failed for ${options.method} ${options.path}`,
        { cause: error },
      );
    }
    throw new HttpResponseError(
      `HTTP request failed for ${options.method} ${options.path}`,
    );
  }

  if (!response.ok) {
    throw new HttpStatusError(response.status, options.method, options.path);
  }

  try {
    const body: unknown = await response.json();
    return body;
  } catch (error) {
    if (error instanceof Error) {
      throw new HttpResponseError(
        `HTTP response was not valid JSON for ${options.method} ${options.path}`,
        { cause: error },
      );
    }
    throw new HttpResponseError(
      `HTTP response was not valid JSON for ${options.method} ${options.path}`,
    );
  }
}
