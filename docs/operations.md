# Operations

This guide covers monitoring, failure handling, protected acceptance, and
rollback for `cf-ai-gw-relay`.

## Operating Model

Cloudflare AI Gateway is the primary observability plane. The Deno relay is
intentionally minimal and stateless.

Operationally important invariants:

- no direct ChatGPT fallback;
- no retry loop in the plugin or relay;
- no relay cache;
- no relay payload persistence;
- credentials and payloads are not application-log material.

## Current Health Signals

Use the following signals together:

- GitHub Actions `Provision infrastructure` status
- GitHub Actions `Protected acceptance` status
- Deno Deploy deployment/runtime health
- Cloudflare AI Gateway request/error logs
- OpenCode client-visible errors

A successful infrastructure deployment does not prove the plugin is supported
for production use. The host-capability gate and protected acceptance remain
separate requirements.

## Failure Semantics

### Plugin activation failure

The plugin rejects unsupported or unavailable OpenCode host-version capability.

Because activation rejection alone cannot prevent a host from continuing the
original request, supported use requires an OpenCode host capability that blocks
the matching Codex request when activation fails.

Treat absence of that capability as a release blocker, not as permission for
direct fallback.

### Plugin configuration failure

Missing or invalid plugin configuration affects the matching ChatGPT Codex
request. Do not add fallback to the original ChatGPT URL.

Configuration errors must not include credential values or request payloads.

### Relay authentication failure

Current `/v1/responses` behavior:

- `RELAY_SECRET` unavailable or unusable -> `503`
- bad or missing `x-chatgpt-relay-authorization` -> `401`
- no upstream fetch before successful authentication

### Relay route mismatch

Anything other than `POST /v1/responses` currently returns `404`.

Do not diagnose `/upstream/*` returning `404` as a production incident: that
generic route is planned but not currently implemented.

### Upstream header timeout

The current relay uses a 30-second upstream connect/response-header timeout.

Before upstream headers are available, timeout returns:

```json
{ "error": "upstream_connect_or_header_timeout" }
```

with HTTP `504`.

### SSE idle timeout

For `text/event-stream`, the current relay uses a 120-second idle timer that
resets on each received upstream body chunk.

Once the downstream response has started, an idle timeout terminates the stream;
it cannot replace the already-sent response with a second HTTP status.

### Client cancellation

Client cancellation propagates upstream. It must not trigger retry or fallback.

## Observability and Data Handling

Cloudflare AI Gateway payload logging is controlled by the plugin configuration.
The current default is `true`.

If payload collection is not acceptable for the workload, set:

```text
RELAY_CF_AIG_COLLECT_LOG_PAYLOAD=false
```

and verify the corresponding Gateway behavior.

The plugin’s fixed metadata does not include agent, session, account ID, OAuth
credential, relay credential, prompt, or response contents.

## Protected Acceptance

Run `.github/workflows/acceptance.yml` manually against the
`protected-acceptance` Environment.

The workflow requires every configured acceptance variable/secret; missing
configuration fails the workflow instead of skipping it.

The current acceptance environment includes values for both the legacy relay and
future generic-provider acceptance. Until `/upstream/*` is implemented,
future-contract test coverage must not be described as implemented runtime
behavior.

For a supported release, protected acceptance should verify the
production-relevant path with real protected credentials and infrastructure,
including the behaviors that release claims to support.

## Incident Triage

When requests fail, classify the failure in this order:

1. **Support gate** — is the OpenCode host/version actually within the supported
   capability set?
2. **Plugin activation** — did host capability detection reject activation?
3. **Plugin configuration** — are required `RELAY_CF_*` and relay token values
   available?
4. **Gateway** — does Cloudflare AI Gateway show the request, authentication
   result, and Custom Provider routing?
5. **Relay authentication** — does the relay receive the expected bearer header?
6. **Relay route** — is the request exactly the implemented `/v1/responses`
   route?
7. **Upstream** — did ChatGPT return an error, connection failure, or timeout?
8. **Streaming** — did a client disconnect or SSE idle timeout end the stream?

Do not “fix” an incident by bypassing Gateway or relay.

## Rollback

The safest rollback depends on the changed layer.

### Plugin release

Use the package/release history to identify the last known-good plugin version.
A rollback must preserve the supported OpenCode range and fail-closed
constraints.

Do not roll back to a build whose behavior allows direct ChatGPT bypass.

### Relay / infrastructure

Re-deploy the last known-good repository revision through the controlled Deno
Deploy / provisioning workflow.

After rollback:

1. confirm the expected Deno production origin;
2. confirm the Cloudflare Custom Provider still points to the intended relay
   origin;
3. run relevant repository checks;
4. run protected acceptance when credentials and the support gate permit it;
5. inspect Gateway logs for the restored request path.

### Configuration

Restore the last known-good GitHub Environment variables/secrets or plugin
runtime configuration. Never copy secret values into issue comments, workflow
logs, or repository files while diagnosing.

## Change Safety

Operational changes that alter route matching, credential boundaries, header
sanitization, timeout semantics, redirect policy, body buffering, or fallback
behavior are specification changes. Update [../SPEC.md](../SPEC.md) first or in
the same change and add tests that enforce the new contract.

## Related Documentation

- [Technical specification](../SPEC.md)
- [Configuration](configuration.md)
- [Deployment](deployment.md)
