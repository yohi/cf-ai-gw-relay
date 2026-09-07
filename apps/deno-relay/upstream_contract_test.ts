import {
  assert,
  assertEquals,
  assertOversizedBodyRejected,
  captureForwardedBody,
  createBoundaryOverflowBodyStream,
  createFetchCapture,
  createGenericRequest,
  createHandler,
  createOneChunkBodyStream,
  createSizedJsonBody,
  MAX_NORMALIZATION_BODY_BYTES,
  requireCapturedRequest,
  utf8ByteLength,
} from "./test_support.ts";

const redirectErrorBody = '{"error":"upstream_redirect_not_allowed"}';
const openAiTooLargeBody =
  '{"error":{"message":"Request body exceeds maximum normalization size","type":"invalid_request_error","param":null,"code":"request_body_too_large"}}';
const anthropicTooLargeBody =
  '{"type":"error","error":{"type":"invalid_request_error","message":"Request body exceeds maximum normalization size"}}';

const openAiSafeAnyOfBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"anyOf":[{"type":"object","properties":{"query":{"type":"string"}}},{"type":"object","properties":{"limit":{"type":"integer"}}}]}}}]}';
const openAiFlattenedBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer"}}}}}]}';
const openAiUnflattenableBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"anyOf":[{"type":"string"},{"type":"object","properties":{"query":{"type":"string"}}}]}}}]}';
const anthropicAnyOfBody =
  '{"model":"command-code","max_tokens":1024,"messages":[{"role":"user","content":"hello"}],"tools":[{"name":"lookup","input_schema":{"anyOf":[{"type":"object","properties":{"query":{"type":"string"}}},{"type":"object","properties":{"limit":{"type":"integer"}}}]}}]}';
const anthropicShapeOnOpenAiRouteBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"name":"lookup","input_schema":{"anyOf":[{"type":"object","properties":{"query":{"type":"string"}}},{"type":"object","properties":{"limit":{"type":"integer"}}}]}}]}';

Deno.test({
  name: "generic /upstream passes through 304 with conditional request headers",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const capture = createFetchCapture();
    const handler = createHandler(capture, () =>
      new Response(null, {
        status: 304,
        headers: {
          connection: "X-Response-Internal",
          "X-Response-Internal": "private",
          etag: '"models-v1"',
          "cache-control": "max-age=60",
        },
      }));
    const response = await handler(
      createGenericRequest("/upstream/command-code/v1/models", {
        method: "GET",
        headers: { "If-None-Match": '"models-v1"' },
      }),
    );
    const upstream = requireCapturedRequest(capture);

    assertEquals(response.status, 304, "304 response status");
    assertEquals(await response.text(), "", "304 response body");
    assertEquals(response.headers.get("etag"), '"models-v1"', "etag");
    assertEquals(
      response.headers.get("cache-control"),
      "max-age=60",
      "cache-control",
    );
    assertEquals(response.headers.get("connection"), null, "connection header");
    assertEquals(
      response.headers.get("x-response-internal"),
      null,
      "connection-nominated response header",
    );
    assertEquals(
      upstream.headers.get("if-none-match"),
      '"models-v1"',
      "conditional request header",
    );
    assertEquals(upstream.method, "GET", "upstream method");
    assertEquals(upstream.redirect, "manual", "upstream redirect policy");
    assertEquals(capture.fetchCalls, 1, "upstream fetch calls");
  },
});

Deno.test({
  name:
    "generic /upstream rejects every non-304 redirect status without forwarding",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const redirectStatuses = [300, 301, 302, 303, 305, 306, 307, 308];
    for (const status of redirectStatuses) {
      const capture = createFetchCapture();
      const handler = createHandler(
        capture,
        () =>
          new Response("upstream redirect body", {
            status,
            headers: {
              location: "https://redirect.example/next",
              "x-upstream-only": "must-not-forward",
            },
          }),
      );
      const response = await handler(
        createGenericRequest(
          "/upstream/command-code/v1/chat/completions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
        ),
      );

      assertEquals(response.status, 502, `redirect status ${status}`);
      assertEquals(
        await response.text(),
        redirectErrorBody,
        "redirect envelope",
      );
      assertEquals(response.headers.get("location"), null, "Location header");
      assertEquals(
        response.headers.get("x-upstream-only"),
        null,
        "upstream-only response header",
      );
      assertEquals(capture.fetchCalls, 1, `fetch count for status ${status}`);
    }
  },
});

Deno.test({
  name:
    "OpenAI chat completions flattens safe root anyOf in the forwarded request",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      openAiSafeAnyOfBody,
    );
    assertEquals(forwardedBody, openAiFlattenedBody, "forwarded OpenAI body");
  },
});

Deno.test({
  name: "OpenAI chat completions preserves unflattenable root anyOf bytes",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      openAiUnflattenableBody,
    );
    assertEquals(
      forwardedBody,
      openAiUnflattenableBody,
      "forwarded OpenAI unflattenable schema bytes",
    );
  },
});

Deno.test({
  name:
    "Anthropic messages preserves root anyOf bytes in the forwarded request",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/messages",
      anthropicAnyOfBody,
    );
    assertEquals(
      forwardedBody,
      anthropicAnyOfBody,
      "forwarded Anthropic schema bytes",
    );
  },
});

Deno.test({
  name: "OpenAI route does not normalize an Anthropic-shaped tool schema",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      anthropicShapeOnOpenAiRouteBody,
    );
    assertEquals(
      forwardedBody,
      anthropicShapeOnOpenAiRouteBody,
      "forwarded route-mismatched schema bytes",
    );
  },
});

Deno.test({
  name: "generic normalization forwards a body exactly at the 4 MiB limit",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES);
    const capture = createFetchCapture();
    const response = await createHandler(capture)(
      createGenericRequest("/upstream/command-code/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(MAX_NORMALIZATION_BODY_BYTES),
        },
        body,
      }),
    );
    const forwardedBody = await requireCapturedRequest(capture).text();

    assertEquals(response.status, 200, "4 MiB response status");
    assertEquals(capture.fetchCalls, 1, "4 MiB upstream fetch calls");
    assertEquals(
      utf8ByteLength(forwardedBody),
      MAX_NORMALIZATION_BODY_BYTES,
      "forwarded 4 MiB body byte length",
    );
    assert(forwardedBody === body, "forwarded 4 MiB body bytes changed");
  },
});

Deno.test({
  name:
    "OpenAI normalization rejects a valid Content-Length above 4 MiB before fetch",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    await assertOversizedBodyRejected({
      pathname: "/upstream/command-code/v1/chat/completions",
      body,
      expectedBody: openAiTooLargeBody,
      headers: { "Content-Length": String(utf8ByteLength(body)) },
    });
  },
});

Deno.test({
  name:
    "Anthropic normalization rejects a counted body above 4 MiB without Content-Length",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    let bodyCancelled = false;
    const requestBody = createOneChunkBodyStream(body, () => {
      bodyCancelled = true;
    });
    const request = createGenericRequest("/upstream/command-code/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });
    assertEquals(request.headers.get("content-length"), null, "Content-Length");
    await assertOversizedBodyRejected({
      request,
      expectedBody: anthropicTooLargeBody,
    });
    assert(bodyCancelled, "counted reader did not cancel the overflowing body");
  },
});

Deno.test({
  name:
    "normalization rejects actual overflow despite an underestimated Content-Length",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    let bodyCancelled = false;
    const requestBody = createBoundaryOverflowBodyStream(body, () => {
      bodyCancelled = true;
    });
    await assertOversizedBodyRejected({
      pathname: "/upstream/command-code/v1/chat/completions",
      body: requestBody,
      expectedBody: openAiTooLargeBody,
      headers: { "Content-Length": String(MAX_NORMALIZATION_BODY_BYTES) },
    });
    assert(bodyCancelled, "counted reader did not cancel actual overflow");
  },
});

Deno.test({
  name:
    "normalization counts bodies when Content-Length is malformed or duplicated",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    const headerCases = [
      new Headers({ "Content-Length": "not-a-number" }),
      (() => {
        const headers = new Headers();
        headers.append("Content-Length", String(MAX_NORMALIZATION_BODY_BYTES));
        headers.append("Content-Length", String(MAX_NORMALIZATION_BODY_BYTES));
        return headers;
      })(),
    ];

    for (const headers of headerCases) {
      let bodyCancelled = false;
      await assertOversizedBodyRejected({
        pathname: "/upstream/command-code/v1/chat/completions",
        body: createOneChunkBodyStream(body, () => {
          bodyCancelled = true;
        }),
        expectedBody: openAiTooLargeBody,
        headers,
      });
      assert(bodyCancelled, "invalid Content-Length was not counted");
    }
  },
});

Deno.test({
  name:
    "normalization never forwards partial bytes from an oversized recognized body",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    let bodyCancelled = false;
    const capture = await assertOversizedBodyRejected({
      pathname: "/upstream/command-code/v1/chat/completions",
      body: createBoundaryOverflowBodyStream(body, () => {
        bodyCancelled = true;
      }),
      expectedBody: openAiTooLargeBody,
    });
    assert(bodyCancelled, "oversized body was not cancelled");
    assertEquals(capture.request, undefined, "partial body forwarded upstream");
  },
});
