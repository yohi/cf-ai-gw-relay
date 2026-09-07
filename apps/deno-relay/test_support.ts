import { createRelayHandler } from "./relay.ts";

export const relayToken = "relay-test-token";
export const relayAuthorization = `Bearer ${relayToken}`;
export const MAX_NORMALIZATION_BODY_BYTES = 4 * 1024 * 1024;

const encoder = new TextEncoder();

export type FetchCapture = {
  fetchCalls: number;
  request: Request | undefined;
};

export type OversizedBodyCase =
  | {
    readonly request: Request;
    readonly expectedBody: string;
  }
  | {
    readonly pathname: string;
    readonly body: string | ReadableStream<Uint8Array>;
    readonly expectedBody: string;
    readonly headers?: HeadersInit;
  };

export type PullMetrics = {
  pullCount: number;
  pulledBytes: number;
};

export function createFetchCapture(): FetchCapture {
  return { fetchCalls: 0, request: undefined };
}

export function assertEquals<T>(
  actual: T,
  expected: T,
  message: string,
): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function createGenericRequest(
  pathname: string,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);
  headers.set("X-Relay-Authorization", relayAuthorization);
  return new Request(`https://relay.example${pathname}`, {
    ...init,
    headers,
  });
}

export function createHandler(
  capture: FetchCapture,
  makeResponse: () => Response = () => new Response("upstream-body"),
): (request: Request) => Promise<Response> {
  return createRelayHandler({
    getSecret: () => relayToken,
    fetcher: (input, init) => {
      capture.fetchCalls += 1;
      capture.request = new Request(input, init);
      return Promise.resolve(makeResponse());
    },
  });
}

export function requireCapturedRequest(capture: FetchCapture): Request {
  if (capture.request === undefined) {
    throw new Error("upstream request was not made");
  }
  return capture.request;
}

export async function captureForwardedBody(
  pathname: string,
  body: string,
): Promise<string> {
  const capture = createFetchCapture();
  await createHandler(capture)(
    createGenericRequest(pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
  assertEquals(capture.fetchCalls, 1, "upstream fetch calls");
  return requireCapturedRequest(capture).text();
}

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function createSizedJsonBody(byteLength: number): string {
  const prefix = '{"model":"command-code","messages":[],"tools":[],"padding":"';
  const suffix = '"}';
  const paddingBytes = byteLength - utf8ByteLength(prefix) -
    utf8ByteLength(suffix);
  assert(paddingBytes >= 0, "requested JSON body size is too small");
  return `${prefix}${"x".repeat(paddingBytes)}${suffix}`;
}

export function createTrackedOneChunkBodyStream(
  body: string,
  onCancel: () => void,
): {
  readonly body: ReadableStream<Uint8Array>;
  readonly metrics: PullMetrics;
} {
  const bytes = encoder.encode(body);
  const metrics: PullMetrics = { pullCount: 0, pulledBytes: 0 };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      metrics.pullCount += 1;
      metrics.pulledBytes += bytes.byteLength;
      controller.enqueue(bytes);
      controller.close();
    },
    cancel() {
      onCancel();
    },
  });
  return { body: stream, metrics };
}

export function createLazyTrackedOneChunkBodyStream(
  body: string,
  onCancel: () => void,
): {
  readonly body: ReadableStream<Uint8Array>;
  readonly metrics: PullMetrics;
} {
  const bytes = encoder.encode(body);
  const metrics: PullMetrics = { pullCount: 0, pulledBytes: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      metrics.pullCount += 1;
      metrics.pulledBytes += bytes.byteLength;
      controller.enqueue(bytes);
      controller.close();
    },
    cancel() {
      onCancel();
    },
  }, { highWaterMark: 0 });
  return { body: stream, metrics };
}

export function createBoundaryOverflowBodyStream(
  body: string,
  onCancel: () => void,
): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(body);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === 0) {
        controller.enqueue(bytes.subarray(0, MAX_NORMALIZATION_BODY_BYTES));
        offset = MAX_NORMALIZATION_BODY_BYTES;
        return;
      }
      if (offset === MAX_NORMALIZATION_BODY_BYTES) {
        controller.enqueue(bytes.subarray(offset));
        offset = bytes.length;
        return;
      }
      controller.close();
    },
    cancel() {
      onCancel();
    },
  });
}

export function createTrackedBoundaryOverflowBodyStream(
  body: string,
  onCancel: () => void,
): {
  readonly body: ReadableStream<Uint8Array>;
  readonly metrics: PullMetrics;
} {
  const bytes = encoder.encode(body);
  let offset = 0;
  const metrics: PullMetrics = { pullCount: 0, pulledBytes: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      metrics.pullCount += 1;
      if (offset === 0) {
        controller.enqueue(bytes.subarray(0, MAX_NORMALIZATION_BODY_BYTES));
        offset = MAX_NORMALIZATION_BODY_BYTES;
        metrics.pulledBytes += MAX_NORMALIZATION_BODY_BYTES;
        return;
      }
      if (offset === MAX_NORMALIZATION_BODY_BYTES) {
        controller.enqueue(bytes.subarray(offset));
        offset = bytes.length;
        metrics.pulledBytes += bytes.byteLength - MAX_NORMALIZATION_BODY_BYTES;
        return;
      }
      controller.close();
    },
    cancel() {
      onCancel();
    },
  });
  return { body: stream, metrics };
}

function jsonHeaders(source: HeadersInit | undefined): Headers {
  const headers = new Headers(source);
  headers.set("Content-Type", "application/json");
  return headers;
}

export async function assertOversizedBodyRejected(
  testCase: OversizedBodyCase,
): Promise<FetchCapture> {
  const capture = createFetchCapture();
  const request = "request" in testCase
    ? testCase.request
    : createGenericRequest(testCase.pathname, {
      method: "POST",
      headers: jsonHeaders(testCase.headers),
      body: testCase.body,
    });
  const response = await createHandler(capture)(request);

  assertEquals(response.status, 413, "oversized body response status");
  assertEquals(
    response.headers.get("content-type"),
    "application/json",
    "oversized body response content type",
  );
  assertEquals(await response.text(), testCase.expectedBody, "413 envelope");
  assertEquals(capture.fetchCalls, 0, "upstream fetch calls");
  assertEquals(capture.request, undefined, "oversized body forwarded upstream");
  return capture;
}
