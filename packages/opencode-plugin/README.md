# @yohi/cloudflare-ai-gateway-chatgpt

OpenCode plugin that routes ChatGPT Codex requests through Cloudflare AI Gateway
and a fixed-upstream Deno Deploy relay. Requests fail closed; they never bypass
the gateway.

Supported OpenCode range: `>=1.18.20 <2`, declared in `engines.opencode`.
The plugin verifies the host version through the official `/global/health`
endpoint using `input.serverUrl` and fails closed when that capability is
unavailable.

See the repository root README for configuration, path mapping, and the release
checklist.
