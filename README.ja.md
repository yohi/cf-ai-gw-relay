# cf-ai-gw-relay

[English](README.md)

OpenCode の ChatGPT Codex 通信を、直接フォールバックさせずに Cloudflare AI
Gateway と固定アップストリームの Deno Deploy relay 経由でルーティングします。

`cf-ai-gw-relay` は OpenCode plugin と小規模な Deno Deploy relay
で構成されます。ChatGPT subscription traffic の Codex request / response stream
を維持しながら、Cloudflare AI Gateway
を可観測性・ポリシー境界として利用するためのプロジェクトです。

> [!WARNING]
> **現在、production での supported use は blocked です。** Plugin は OpenCode
> `1.18.31` を対象とし、fail-closed な activation
> には、本プロジェクトが必要とする host-version capability と request-blocking
> capability が OpenCode 側で提供されることも必要です。Release artifact
> が存在していても、必要 capability が利用可能になり protected acceptance suite
> が成功するまでは、production での supported use として扱わないでください。

## このリポジトリの構成

- `packages/opencode-plugin` — npm package `@yohi/cf-ai-gw-relay`
- `apps/deno-relay` — 固定アップストリームの Deno Deploy egress relay
- `.github/scripts` — infrastructure provisioning helper

2つの runtime deliverable は runtime code を共有しません。両者の結合境界は
[SPEC.md](SPEC.md) の HTTP contract です。

## Quick Start

現在 supported end-user use が blocked のため、最小の supported path
はリポジトリ検証です。

### 必要環境

- Deno 2.x
- Node.js 22 と npm

### Relay と provisioning helper の検証

```bash
deno test apps/deno-relay .github/scripts
deno fmt --check
deno lint
```

### OpenCode plugin の検証

```bash
cd packages/opencode-plugin
npm ci --legacy-peer-deps
npm run typecheck
npm test
npm run build
```

すべての test、type check、format check、lint、package build
がエラーなく完了すれば成功です。

## Features

- OpenCode の built-in `openai` provider と public `provider.models` hook
  を使い、 `openai/gpt-5.6-luna` を Cloudflare AI Gateway Custom Provider 経由に
  ルーティングします。
- `chat.headers` hook で Gateway と relay の control header を設定します。
- OpenCode が所有する OAuth、account、residency、body stream、abort signal の
  header は変更せず、Plugin は residency header を追加・推測しません。
- Gateway credential と relay credential を分離します。
- Fail-closed で動作し、意図的な ChatGPT 直接 fallback を行いません。
- Deno relay は stateless かつ runtime dependency なしです。
- Relay 自身で payload を永続化せず、可観測性を Cloudflare AI Gateway
  に委譲します。
- 現行の public hook path と、将来の固定 provider `/upstream/*` relay contract
  を分離して定義します。「legacy」は削除済みの fetch interposer
  に限って使用します。

## Architecture Overview

```text
OpenCode built-in ChatGPT OAuth
  -> OpenCode provider.models hook
  -> model.api.url (suffix-free Gateway Custom Provider URL)
  -> Cloudflare AI Gateway Custom Provider
  -> AI SDK appends /responses
  -> Deno Deploy relay
  -> https://chatgpt.com/backend-api/codex/responses
```

Plugin は routing と Gateway control header の層です。Cloudflare AI Gateway が
observability plane、relay が現行 path の固定 ChatGPT upstream への最小 egress
transport です。

OpenCode builtin `cloudflare-ai-gateway` provider
はこの経路の外です。本プロジェクトは ChatGPT subscription traffic を Cloudflare
native `openai/*` / `anthropic/*` passthrough traffic に変換しません。

## 現在の Request Path

Plugin は対象 model の route として、suffix-free の次の URL を設定します。

```text
https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/custom-{provider-slug}
```

`/responses` は AI SDK が追加し、Custom Provider が relay route に対応付けます。
Production mapping は `openai/gpt-5.6-luna` -> `gpt-5.6-luna` ->
`@ai-sdk/openai 3.0.88` -> wire-body model `gpt-5.6-luna` です。

現在の relay が受け付けるのは次です。

```text
POST /v1/responses
```

固定 upstream は次です。

```text
https://chatgpt.com/backend-api/codex/responses
```

その他の relay route は `404` です。

Relay は request / response body を直接 forwarding し、tools を含む内容を変換
しません。Managed residency は initial scope では未サポートです。
`x-openai-internal-codex-residency` または `X-OpenAI-Fedramp` を含む request は
upstream request の前に拒否します。Fallback、retry loop、cache、payload
persistence はありません。

Generic `/upstream/<provider-slug>/*` relay は
**計画済みですが未実装**です。Normative contract は [SPEC.md](SPEC.md)
を参照してください。

## 重要な Configuration

| 設定                               | 用途                                           |
| ---------------------------------- | ---------------------------------------------- |
| `RELAY_CF_ACCOUNT_ID`              | Cloudflare account ID。Plugin で必須           |
| `RELAY_CF_GATEWAY_ID`              | AI Gateway ID。Plugin で必須                   |
| `RELAY_CF_AIG_TOKEN`               | Gateway authentication token                   |
| `RELAY_SECRET`                     | Relay 共通 bearer secret                       |
| `RELAY_CF_PROVIDER_SLUG`           | Custom Provider slug。既定 `relay-chatgpt`     |
| `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` | Payload logging。`true` / `false`、既定 `true` |

優先順位、既定値、test-only 設定、provisioning、acceptance 設定は
[Configuration](docs/configuration.md) を参照してください。GitHub Packages からの
Plugin の導入と `opencode.json[c]` の記載方法も説明しています。

## Documentation

- [SPEC.md](SPEC.md) — normative architecture、HTTP
  contract、invariant、security semantics、compatibility、将来 generic relay
  contract
- [Configuration](docs/configuration.md) — 人間向けの完全な configuration
  reference
- [Deployment](docs/deployment.md) — Deno Deploy、Cloudflare AI
  Gateway、provisioning、release workflow
- [Operations](docs/operations.md) — monitoring、failure、protected
  acceptance、rollback
- [AGENTS.md](AGENTS.md) — AI coding agent 向け repository-specific instruction
- [Plugin changelog](packages/opencode-plugin/CHANGELOG.md) — plugin release
  history

`REQUIREMENTS_AI_GATEWAY_RELAY.md` は旧リンク互換用の pointer
として残します。技術仕様の正本は `SPEC.md` です。

## Development

```text
apps/deno-relay/             Deno Deploy relay
packages/opencode-plugin/    OpenCode plugin package
.github/scripts/             infrastructure provisioning helpers
```

`apps/deno-relay` と `.github/scripts` は repository root から Deno
を使用し、`packages/opencode-plugin` 内では npm を使用します。

実装上の制約と検証要件は [AGENTS.md](AGENTS.md) に従ってください。

## Deployment / Operations

詳細手順は README に重複させません。

- [Deployment guide](docs/deployment.md)
- [Operations guide](docs/operations.md)

## License

MIT。詳細は [LICENSE](LICENSE) を参照してください。
