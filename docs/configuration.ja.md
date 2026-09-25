# 設定

[English](configuration.md)

> [!NOTE]
> この文書は [英語版](configuration.md) の日本語訳です。内容に差異がある場合は、英語版を正とします。

この文書は `cf-ai-gw-relay` の利用者向け設定リファレンスです。規範となる
protocol の動作は [../SPEC.md](../SPEC.md) で定義しています。

## Plugin の実行時設定

Plugin は OpenCode の実行環境変数と、任意の Plugin 設定を読み取ります。

| 値 | 環境変数 | Plugin 設定 | 既定値 | 必須 |
| --- | --- | --- | --- | --- |
| Cloudflare account ID | `RELAY_CF_ACCOUNT_ID` | — | — | はい |
| AI Gateway ID | `RELAY_CF_GATEWAY_ID` | — | — | はい |
| Gateway token | `RELAY_CF_AIG_TOKEN` | `apiKey` | — | はい |
| Relay token | `RELAY_SECRET` | `relayToken` | — | はい |
| Custom Provider slug | `RELAY_CF_PROVIDER_SLUG` | `providerSlug` | `relay-chatgpt` | いいえ |
| Gateway payload logging | `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` | `collectLogPayload` | `true` | いいえ |
| Gateway base origin | `RELAY_CF_AIG_BASE_URL` | — | `https://gateway.ai.cloudflare.com` | いいえ。test 専用 override |
| Gateway test mode | `RELAY_CF_AIG_TEST_MODE` | — | 未設定 | いいえ。test 専用 |

### GitHub Packages からインストール

OpenCode は `opencode.json` または `opencode.jsonc` に記載された npm Plugin
をインストールします。ユーザーの npm 設定ファイル (`~/.npmrc`) に、`@yohi`
scope の認証を設定してください。

```ini
@yohi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

OpenCode の起動環境に `GITHUB_PACKAGES_TOKEN` を設定してください。この値には
GitHub Personal Access Token (classic) を使用し、`read:packages` 権限と対象の
repository / package へのアクセス権限が必要です。token の値を
`opencode.json[c]`、`.npmrc`、または commit 対象のファイルに記載しないでください。

OpenCode の設定に Plugin を登録し、routing 対象の model を設定します。

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@yohi/cf-ai-gw-relay@0.4.0"],
  "model": "openai/gpt-5.6-luna",
  "provider": {
    "openai": {
      "models": {
        "gpt-5.6-luna": {
          "name": "GPT-5.6 Luna"
        }
      }
    }
  }
}
```

この version は記載例です。GitHub Packages に公開済みの version を指定して
ください。Plugin は routing 対象の `openai/gpt-5.6-luna` が
`provider.openai.models` に定義されていることを必要とし、その model の API URL を
Gateway route に書き換えます。model 定義がない場合、Plugin の初期化に失敗します。
また、Plugin の実行には OpenCode process の環境に runtime 設定も必要です。例:

```sh
export RELAY_CF_ACCOUNT_ID="<cloudflare-account-id>"
export RELAY_CF_GATEWAY_ID="<gateway-id>"
export RELAY_CF_AIG_TOKEN="<gateway-token>"
export RELAY_SECRET="<relay-secret>"
opencode
```

任意の環境変数は上の表を参照してください。production での supported use は
[../SPEC.md](../SPEC.md) に記載された host capability の条件を満たすまで
有効になりません。

### 優先順位

Gateway token:

1. `RELAY_CF_AIG_TOKEN`
2. Plugin 設定 `apiKey`

Relay token:

1. `RELAY_SECRET`
2. Plugin 設定 `relayToken`

Provider slug:

1. `RELAY_CF_PROVIDER_SLUG`
2. Plugin 設定 `providerSlug`
3. `relay-chatgpt`

Payload logging:

1. `RELAY_CF_AIG_COLLECT_LOG_PAYLOAD`
2. Plugin 設定 `collectLogPayload`
3. `true`

### 検証

`RELAY_CF_ACCOUNT_ID` と `RELAY_CF_GATEWAY_ID` は空でない値にしてください。

Gateway token と relay token は、空でない文字列として解決される必要があります。

`RELAY_CF_AIG_COLLECT_LOG_PAYLOAD` を設定する場合、値は `true` または `false`
に限ります。Plugin 設定 `collectLogPayload` を指定する場合は boolean 型が必要です。
任意の文字列を boolean に変換する処理は行いません。

Payload logging の既定値は `true` です。この設定により Gateway で payload が収集
されるため、無効にしない場合のプライバシーへの影響に注意してください。

`RELAY_CF_AIG_BASE_URL` は production 用の override ではありません。次の条件を
満たす場合に限り受け付けます。

```text
RELAY_CF_AIG_TEST_MODE=true
```

さらに、指定する URL の origin が次と完全に一致する必要があります。

```text
https://gateway.test.invalid
```

その他の base URL override はすべて拒否されます。

## Relay の実行時設定

現在実装されている relay が読み取る環境変数は次のとおりです。

| 環境変数 | 用途 |
| --- | --- |
| `RELAY_SECRET` | Cloudflare Custom Provider と relay で共有する bearer secret |

`RELAY_SECRET` が未設定、空、または空白文字だけの場合、現在の relay は request
の処理時に `503` を返します。

現在の実装では timeout 値は固定です。upstream 接続 / response header の timeout は
30 秒、SSE idle timeout は 120 秒です。

### 将来の汎用 relay 設定

計画中の `/upstream/*` contract では、将来、次の設定を定義します。

| 環境変数 | 計画中の既定値 | 状態 |
| --- | ---: | --- |
| `UPSTREAM_HEADER_TIMEOUT_MS` | `30000` | 未実装 |
| `SSE_IDLE_TIMEOUT_MS` | `120000` | 未実装 |

現在の relay がこれらの環境変数を使用すると想定して設定しないでください。将来の
検証 contract は [../SPEC.md](../SPEC.md) で定義しています。

`MAX_NORMALIZATION_BODY_BYTES` は環境変数ではなく、4 MiB の固定実装定数として
計画されています。

## Infrastructure provisioning の設定

`.github/workflows/provision.yml` は `production` GitHub Environment で実行されます。

### Variables

| 名前 | この repository での代表値 | 用途 |
| --- | --- | --- |
| `DENO_DEPLOY_APP` | `cf-ai-gw-relay` | Deno Deploy app slug |
| `CLOUDFLARE_GATEWAY_ID` | `relay-gateway` | AI Gateway ID |
| `CLOUDFLARE_PROVIDER_SLUG` | `relay-chatgpt` | Custom Provider slug |
| `CLOUDFLARE_ACCOUNT_ID` | account ごとの値 | Cloudflare account ID |

`workflow_dispatch` の入力値では Deno app、Gateway ID、provider slug を上書き
できます。入力値と対応する設定済み variable の両方がない場合、provisioning は
変更を行う前に検証エラーで終了します。

### Secrets

| 名前 | 用途 |
| --- | --- |
| `DENO_DEPLOY_TOKEN` | Deno Deploy API の認証 |
| `RELAY_SECRET` | deploy 済み app に設定する relay bearer secret |
| `CLOUDFLARE_API_TOKEN` | AI Gateway の reconciliation に使う Cloudflare API 認証 |

`CLOUDFLARE_ACCOUNT_ID` は workflow の設定に応じて variable または secret として
指定できます。

runtime 用の Plugin 設定 `RELAY_CF_*` と provisioning 用の設定 `CLOUDFLARE_*` は
別の設定領域です。両者の名前を揃えるために変更しないでください。

## 保護された acceptance の設定

`.github/workflows/acceptance.yml` は `protected-acceptance` GitHub Environment を
使用します。

必要な値:

| 名前 | 種別 | 用途 |
| --- | --- | --- |
| `RELAY_ACCEPTANCE_ORIGIN` | variable | relay への直接 acceptance 接続先 |
| `RELAY_ACCEPTANCE_RELAY_SECRET` | secret | relay への直接 acceptance 認証 |
| `RELAY_ACCEPTANCE_GATEWAY_BASE_URL` | variable | 実際の AI Gateway base path |
| `RELAY_ACCEPTANCE_MODEL` | variable | acceptance で使用する model |
| `RELAY_ACCEPTANCE_GATEWAY_TOKEN` | secret | Gateway credential |
| `RELAY_ACCEPTANCE_COMMAND_CODE_API_KEY` | secret | Command Code provider credential |

必要な値がない場合、workflow は意図的に失敗します。

保護された acceptance は GitHub-hosted `ubuntu-latest` 上で実行され、既存の OAuth
以外の Gateway、relay、provider 制御のみを使います。検証するのは Gateway / relay
境界の status class に限られます。OpenCode の install や起動、認証情報 store の
読み取りは行わず、実際の OAuth request を検証したとは扱いません。OpenCode OAuth
の取得、保存、refresh、注入は利用者の local OpenCode 1.18.31 runtime だけが行い、
CI、この repository、relay に渡されることはありません。repository は payload、
raw probe、OpenCode credential を保存しません。Gateway payload logging は
Cloudflare Gateway 側で制御されるため、運用者は Gateway 上の retention と access
policy を適用し、確認してください。

## Credential の境界

次の credential を相互に使い回さないでください。

- ChatGPT access token — upstream 認証用。OpenCode が提供します。
- Gateway token — Cloudflare AI Gateway への request 認証用。
- Relay secret — Gateway から relay への認証用。
- Cloudflare provisioning API token — infrastructure 管理専用。
- Deno Deploy token — deployment 管理専用。
- Command Code API key — 保護された acceptance / 将来の provider 認証用。

実際の credential 値を repository や設定例に commit しないでください。

## 関連ドキュメント

- [技術仕様](../SPEC.md)
- [Deployment](deployment.md)
- [Operations](operations.md)
