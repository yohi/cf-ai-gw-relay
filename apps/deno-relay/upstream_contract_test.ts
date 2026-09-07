import {
  assert,
  assertEquals,
  assertOversizedBodyRejected,
  captureForwardedBody,
  createBoundaryOverflowBodyStream,
  createFetchCapture,
  createGenericRequest,
  createHandler,
  createSizedJsonBody,
  createTrackedBoundaryOverflowBodyStream,
  createTrackedOneChunkBodyStream,
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

const nonCanonicalAnthropicAnyOfBody = `{
  "model": "command-code",
  "max_tokens": 9223372036854775807,
  "messages": [{"role": "user", "content": "日本語と\\n改行" }, {"role": "user", "content": 9007199254740993 }],
  "tools": [{
    "name": "lookup",
    "input_schema": {
      "anyOf": [
        { "type": "object", "properties": { "query": { "type": "string" } } },
        { "type": "object", "properties": { "limit": { "type": "integer" } } }
      ]
    }
  }]
}`;

const openAiBranchConstraintAnyOfBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"anyOf":[{"type":"object","properties":{"query":{"type":"string"}},"required":["query"]},{"type":"object","properties":{"limit":{"type":"integer"}}}]}}}]}';
const openAiRootConstraintAnyOfBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object","properties":{"query":{"type":"string"}},"anyOf":[{"type":"object","properties":{"query":{"type":"string"}}},{"type":"object","properties":{"limit":{"type":"integer"}}}]}}}]}';
const openAiExplicitObjectTypeAnyOfBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object","anyOf":[{"type":"object","properties":{"query":{"type":"string"}}},{"type":"object","properties":{"limit":{"type":"integer"}}}]}}}]}';
const openAiExplicitStringTypeAnyOfBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"string","anyOf":[{"type":"object","properties":{"query":{"type":"string"}}},{"type":"object","properties":{"limit":{"type":"integer"}}}]}}}]}';
const openAiNoAnyOfEmptyBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{}}}]}';
const openAiNoAnyOfNoTypeBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"properties":{"query":{"type":"string"}}}}}]}';
const openAiNoAnyOfCompletedBody =
  '{"model":"command-code","messages":[{"role":"user","content":"hello"}],"tools":[{"type":"function","function":{"name":"lookup","parameters":{"type":"object","properties":{"query":{"type":"string"}}}}}]}';

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
        headers: {
          "If-None-Match": '"models-v1"',
          "If-Modified-Since": "Wed, 04 Sep 2026 00:00:00 GMT",
        },
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
      "If-None-Match conditional request header",
    );
    assertEquals(
      upstream.headers.get("if-modified-since"),
      "Wed, 04 Sep 2026 00:00:00 GMT",
      "If-Modified-Since conditional request header",
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
    const locations = [
      "https://redirect.example/next",
      "https://api.commandcode.ai/provider/v2/chat/completions",
      "/relative/next",
    ];
    for (const status of redirectStatuses) {
      for (const location of locations) {
        const capture = createFetchCapture();
        const handler = createHandler(
          capture,
          () =>
            new Response("upstream redirect body", {
              status,
              headers: {
                location,
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
        assertEquals(
          response.headers.get("location"),
          null,
          `Location header for ${location}`,
        );
        assertEquals(
          response.headers.get("x-upstream-only"),
          null,
          "upstream-only response header",
        );
        assertEquals(
          capture.fetchCalls,
          1,
          `fetch count for status ${status}`,
        );
      }
    }
  },
});

Deno.test({
  name:
    "generic /upstream sends the original POST body exactly once on 307/308",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const postBody =
      '{"model":"command-code","messages":[{"role":"user","content":"hello"}]}';
    for (const status of [307, 308]) {
      const capture = createFetchCapture();
      const handler = createHandler(
        capture,
        () =>
          new Response("redirect", {
            status,
            headers: { location: "https://redirect.example/next" },
          }),
      );
      await handler(
        createGenericRequest("/upstream/command-code/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: postBody,
        }),
      );
      const upstream = requireCapturedRequest(capture);

      assertEquals(capture.fetchCalls, 1, `fetch count for status ${status}`);
      assertEquals(upstream.method, "POST", `upstream method for ${status}`);
      assertEquals(
        await upstream.text(),
        postBody,
        `POST body sent exactly once for ${status}`,
      );
    }
  },
});

Deno.test({
  name:
    "generic /upstream resolves path and credentials for the command-code preset",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const providerApiKey = "provider-api-key";
    const capture = createFetchCapture();
    const response = await createHandler(capture)(
      createGenericRequest("/upstream/command-code/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${providerApiKey}`,
        },
        body: openAiSafeAnyOfBody,
      }),
    );
    const upstream = requireCapturedRequest(capture);

    assertEquals(response.status, 200, "generic route response status");
    assertEquals(
      upstream.url,
      "https://api.commandcode.ai/provider/v1/chat/completions",
      "upstream URL for command-code preset",
    );
    assertEquals(
      upstream.headers.get("authorization"),
      `Bearer ${providerApiKey}`,
      "provider Authorization is forwarded",
    );
    assertEquals(
      upstream.headers.get("x-relay-authorization"),
      null,
      "relay Authorization is not forwarded",
    );
    assertEquals(capture.fetchCalls, 1, "upstream fetch calls");
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
  name:
    "OpenAI chat completions does not flatten anyOf with branch-level constraints",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      openAiBranchConstraintAnyOfBody,
    );
    assertEquals(
      forwardedBody,
      openAiBranchConstraintAnyOfBody,
      "forwarded branch-constrained schema bytes",
    );
  },
});

Deno.test({
  name:
    "OpenAI chat completions does not flatten anyOf with root-level object constraints",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      openAiRootConstraintAnyOfBody,
    );
    assertEquals(
      forwardedBody,
      openAiRootConstraintAnyOfBody,
      "forwarded root-constrained schema bytes",
    );
  },
});

Deno.test({
  name:
    "OpenAI chat completions flattens safe root anyOf when root type is explicitly object",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      openAiExplicitObjectTypeAnyOfBody,
    );
    assertEquals(
      forwardedBody,
      openAiFlattenedBody,
      "forwarded explicit object type schema",
    );
  },
});

Deno.test({
  name:
    "OpenAI chat completions does not flatten anyOf when root type is not object",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      openAiExplicitStringTypeAnyOfBody,
    );
    assertEquals(
      forwardedBody,
      openAiExplicitStringTypeAnyOfBody,
      "forwarded non-object root type schema bytes",
    );
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
    "OpenAI chat completions completes missing type and empty properties when no root anyOf",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedEmpty = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      openAiNoAnyOfEmptyBody,
    );
    assertEquals(
      forwardedEmpty,
      openAiNoAnyOfCompletedBody,
      "forwarded empty parameters completion",
    );

    const forwardedNoType = await captureForwardedBody(
      "/upstream/command-code/v1/chat/completions",
      openAiNoAnyOfNoTypeBody,
    );
    assertEquals(
      forwardedNoType,
      openAiNoAnyOfCompletedBody,
      "forwarded missing type completion",
    );
  },
});

const anthropicNoAnyOfEmptyBody =
  '{"model":"command-code","max_tokens":1024,"messages":[{"role":"user","content":"hello"}],"tools":[{"name":"lookup","input_schema":{}}]}';
const anthropicNoAnyOfNoTypeBody =
  '{"model":"command-code","max_tokens":1024,"messages":[{"role":"user","content":"hello"}],"tools":[{"name":"lookup","input_schema":{"properties":{"query":{"type":"string"}}}}]}';

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
  name:
    "Anthropic messages preserves non-canonical JSON bytes including UTF-8, escapes, and large integers",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedBody = await captureForwardedBody(
      "/upstream/command-code/v1/messages",
      nonCanonicalAnthropicAnyOfBody,
    );
    assertEquals(
      forwardedBody,
      nonCanonicalAnthropicAnyOfBody,
      "forwarded non-canonical Anthropic schema bytes",
    );
  },
});

Deno.test({
  name:
    "Anthropic messages preserves no-root-anyOf input_schema bytes unchanged",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const forwardedEmpty = await captureForwardedBody(
      "/upstream/command-code/v1/messages",
      anthropicNoAnyOfEmptyBody,
    );
    assertEquals(
      forwardedEmpty,
      anthropicNoAnyOfEmptyBody,
      "forwarded empty Anthropic input_schema bytes",
    );

    const forwardedNoType = await captureForwardedBody(
      "/upstream/command-code/v1/messages",
      anthropicNoAnyOfNoTypeBody,
    );
    assertEquals(
      forwardedNoType,
      anthropicNoAnyOfNoTypeBody,
      "forwarded missing-type Anthropic input_schema bytes",
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
    "generic normalization uses a counted reader for a body below the 4 MiB limit",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = '{"model":"command-code","messages":[],"tools":[]}';
    const capture = createFetchCapture();
    const { body: requestBody, metrics } = createTrackedOneChunkBodyStream(
      body,
      () => undefined,
    );
    const response = await createHandler(capture)(
      createGenericRequest("/upstream/command-code/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      }),
    );
    const forwardedBody = await requireCapturedRequest(capture).text();

    assertEquals(response.status, 200, "below-limit response status");
    assertEquals(capture.fetchCalls, 1, "below-limit upstream fetch calls");
    assertEquals(forwardedBody, body, "forwarded below-limit body");
    assertEquals(
      metrics.pullCount,
      1,
      "counted reader should pull the small body once",
    );
    assertEquals(
      metrics.pulledBytes,
      utf8ByteLength(body),
      "counted reader should meter pulled bytes",
    );
  },
});

Deno.test({
  name:
    "OpenAI normalization rejects a valid Content-Length above 4 MiB before reading the body",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    let bodyCancelled = false;
    const { body: requestBody, metrics } = createTrackedOneChunkBodyStream(
      body,
      () => {
        bodyCancelled = true;
      },
    );
    await assertOversizedBodyRejected({
      pathname: "/upstream/command-code/v1/chat/completions",
      body: requestBody,
      expectedBody: openAiTooLargeBody,
      headers: { "Content-Length": String(utf8ByteLength(body)) },
    });
    assert(bodyCancelled, "early 413 did not cancel the body stream");
    assertEquals(metrics.pullCount, 0, "early 413 pulled body chunks");
    assertEquals(metrics.pulledBytes, 0, "early 413 pulled body bytes");
  },
});

Deno.test({
  name:
    "Anthropic normalization rejects a counted body above 4 MiB without Content-Length",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    let bodyCancelled = false;
    const { body: requestBody } = createTrackedOneChunkBodyStream(
      body,
      () => {
        bodyCancelled = true;
      },
    );
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
    "normalization rejects actual overflow after pulling the overflowing chunk",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    let bodyCancelled = false;
    const { body: requestBody, metrics } =
      createTrackedBoundaryOverflowBodyStream(
        body,
        () => {
          bodyCancelled = true;
        },
      );
    await assertOversizedBodyRejected({
      pathname: "/upstream/command-code/v1/chat/completions",
      body: requestBody,
      expectedBody: openAiTooLargeBody,
      headers: { "Content-Length": String(MAX_NORMALIZATION_BODY_BYTES) },
    });
    assert(bodyCancelled, "counted reader did not cancel actual overflow");
    assert(
      metrics.pulledBytes >= MAX_NORMALIZATION_BODY_BYTES + 1,
      "counted reader should pull the overflowing chunk before cancellation",
    );
  },
});

Deno.test({
  name:
    "normalization rejects bodies when Content-Length is missing, malformed, duplicated, or underestimated",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 1);
    const headerCases = [
      {
        label: "missing",
        headers: new Headers({ "Content-Type": "application/json" }),
      },
      {
        label: "malformed",
        headers: new Headers({ "Content-Length": "not-a-number" }),
      },
      (() => {
        const headers = new Headers();
        headers.append("Content-Length", String(MAX_NORMALIZATION_BODY_BYTES));
        headers.append("Content-Length", String(MAX_NORMALIZATION_BODY_BYTES));
        headers.set("Content-Type", "application/json");
        return { label: "duplicated", headers };
      })(),
      {
        label: "underestimated",
        headers: new Headers({
          "Content-Length": String(MAX_NORMALIZATION_BODY_BYTES),
        }),
      },
    ];

    for (const { label, headers } of headerCases) {
      let bodyCancelled = false;
      const { body: requestBody, metrics } = createTrackedOneChunkBodyStream(
        body,
        () => {
          bodyCancelled = true;
        },
      );
      await assertOversizedBodyRejected({
        pathname: "/upstream/command-code/v1/chat/completions",
        body: requestBody,
        expectedBody: openAiTooLargeBody,
        headers,
      });
      assert(bodyCancelled, `${label} Content-Length was not counted`);
      assertEquals(
        metrics.pulledBytes,
        utf8ByteLength(body),
        `${label} Content-Length counted reader pulled bytes`,
      );
    }
  },
});

Deno.test({
  name:
    "normalization never forwards partial bytes from an oversized recognized body",
  ignore: true, // requires generic /upstream/* handler implementation
  fn: async () => {
    const body = createSizedJsonBody(MAX_NORMALIZATION_BODY_BYTES + 303);
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
