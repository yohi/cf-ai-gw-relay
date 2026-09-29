# @yohi/cf-ai-gw-relay

OpenCode plugin that uses the built-in `openai` provider and the public
`provider.models` hook to route ChatGPT Codex requests through Cloudflare AI
Gateway and a fixed-upstream Deno Deploy relay. Requests fail closed; they never
bypass the Gateway.

Supported OpenCode version: `1.18.31`, pinned in `engines.opencode` and the
plugin host validation.
The plugin verifies the host version through the official `/global/health`
endpoint using `input.serverUrl` and fails closed when that capability is
unavailable.

The initial production mapping is:

```text
openai/gpt-5.6-luna
  -> model.api.id = gpt-5.6-luna
  -> @ai-sdk/openai 3.0.88 model gpt-5.6-luna
  -> wire-body model gpt-5.6-luna
```

The `provider.models` hook owns routing and sets the suffix-free
`model.api.url`:

```text
https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/custom-<slug>
```

The AI SDK appends `/responses`, which the Custom Provider maps to relay
`POST /v1/responses`. The `chat.headers` hook configures exactly these seven
control headers: `cf-aig-authorization`, `x-chatgpt-relay-authorization`,
`cf-aig-collect-log`, `cf-aig-collect-log-payload`, `cf-aig-metadata`,
`cf-aig-skip-cache`, and `cf-aig-max-attempts`. It does not replace OpenCode's
`Authorization` or `ChatGPT-Account-Id` headers.

OpenCode exclusively owns ChatGPT OAuth acquisition, interpretation, refresh,
and injection. The plugin and relay treat the resulting authorization as opaque
transport data and do not inspect, persist, or refresh OAuth contents. Relay
forwarding is direct and includes tools; managed residency is unsupported in the
initial scope. There is no direct fallback, retry loop, cache, or payload
persistence.

The generic `/upstream/*` relay contract remains planned and is not implemented.
The former fetch interposer, `installFetchInterposer()`, `buildGatewayUrl()`, and
request matching/rewrite logic are historical implementation details only, not an
active route or fallback.

See the repository root README for configuration, path mapping, and the release
checklist.
