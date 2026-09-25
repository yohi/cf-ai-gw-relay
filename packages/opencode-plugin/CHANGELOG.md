# Changelog

## [0.4.0](https://github.com/yohi/cf-ai-gw-relay/compare/v0.3.1...v0.4.0) (2026-09-25)


### Features

* add OpenCode provider model routing ([95a9eec](https://github.com/yohi/cf-ai-gw-relay/commit/95a9eec3462624b3646e0cd76f9705813d867e81))
* add OpenCode provider model routing ([7ae1405](https://github.com/yohi/cf-ai-gw-relay/commit/7ae14055e898a8ca136680ef172a545fdfeba716))
* add OpenCode provider model routing ([3ca6265](https://github.com/yohi/cf-ai-gw-relay/commit/3ca62659ba3d233bb2aed4b2c7b1b34ab7dbc531))
* hook型をルートから公開 ([9d62ee9](https://github.com/yohi/cf-ai-gw-relay/commit/9d62ee92f044447a290abc773afab545b9a104a7))
* inject Gateway control headers through OpenCode ([d68e39f](https://github.com/yohi/cf-ai-gw-relay/commit/d68e39f5cbec2b214949a336f18641c0b7cdf436))
* inject Gateway control headers through OpenCode ([c9f9db3](https://github.com/yohi/cf-ai-gw-relay/commit/c9f9db3a57d2b35bc52df0ce015a0acf98131140))
* inject Gateway control headers through OpenCode ([edf9887](https://github.com/yohi/cf-ai-gw-relay/commit/edf9887eb9045ada0cde558d1e836a9e90409d7c))


### Bug Fixes

* OpenAIモデル一覧を維持 ([ff180c1](https://github.com/yohi/cf-ai-gw-relay/commit/ff180c1bb2588986e9d8f0fb184bb6264e17f07b))
* preserve provider model metadata ([21adf18](https://github.com/yohi/cf-ai-gw-relay/commit/21adf182efe1ef6ad163d1728da819fdda2e0ce9))

## [0.3.1](https://github.com/yohi/cf-ai-gw-relay/compare/v0.3.0...v0.3.1) (2026-09-08)


### Bug Fixes

* **opencode-plugin:** health検証を公式endpointに限定 ([4b80d2c](https://github.com/yohi/cf-ai-gw-relay/commit/4b80d2c91904cccd5a1410cc2ceaf298ac516b6c))
* **opencode-plugin:** OpenCode互換性宣言をpeerDependenciesからengines.opencodeへ移行 ([645eeaf](https://github.com/yohi/cf-ai-gw-relay/commit/645eeafebfae815088af8e85bd7b6ed59512c91d))
* **opencode-plugin:** ホスト能力検証と公開依存を整合 ([0a68810](https://github.com/yohi/cf-ai-gw-relay/commit/0a68810448085a119935936a119a34a5458f5852))
* **opencode-plugin:** 公式health endpointで対応範囲を検証 ([99728a0](https://github.com/yohi/cf-ai-gw-relay/commit/99728a021a1f655bbbd1959904cd51ceae2d1fb0))
* OpenCode互換性宣言とホスト検証を修正 ([ed3c8e5](https://github.com/yohi/cf-ai-gw-relay/commit/ed3c8e5b444c415906659f00c4f37d8727433efd))

## [0.3.0](https://github.com/yohi/cf-ai-gw-relay/compare/v0.2.1...v0.3.0) (2026-09-08)


### Features

* runtime環境変数をRELAY_CFへ統一 ([bd93c04](https://github.com/yohi/cf-ai-gw-relay/commit/bd93c04cf66cbda3b254d404204dd13c6de3c90f))
* runtime環境変数をRELAY_CFへ統一 ([43c4d8d](https://github.com/yohi/cf-ai-gw-relay/commit/43c4d8d8ed8499bf231937b49352e157d783d787))

## [0.2.1](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/compare/v0.2.0...v0.2.1) (2026-09-08)


### Bug Fixes

* Custom Provider slugをrelay-chatgptに統一 ([148c83f](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/148c83ffd339d7de886931d24d3f920667d4e8d7))

## [0.2.0](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/compare/v0.1.0...v0.2.0) (2026-08-25)


### Features

* Codexリクエスト書き換えを追加 ([a0153a3](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/a0153a3a6dfe791049acc3ef72af46aa77d8706a))
* fetchインターポーザーとプラグインエントリを追加 ([b6a7a06](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/b6a7a0698c34c43d2129408c55e80a3a6ef6069d))
* fetchインターポーザーを追加 ([21326eb](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/21326ebb34145705ffba82963c1a72b0b8f12325))
* Gateway URL構築とCodexリクエスト判定を追加 ([df73ea2](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/df73ea20c6fe730c4015db167e40c5f16e32ee9e))
* GitHub Packages向け自動リリースを追加 ([05b1583](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/05b1583a48c09debc73d8278df20a89c60e345ec))
* GitHub Packages向け自動リリースを追加 ([2f5f7be](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/2f5f7be4dc7eaa64b4dd879b7d612b1f9a2dfe3f))
* プラグインエントリポイントを追加 ([45e1a1b](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/45e1a1bb9ba00a282650b4ab7efe2ff440f0d49d))
* プラグインコアモジュールを追加 ([7bcdd4f](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/7bcdd4fe8227494367f6d6b8d6444529950d6d45))
* ホストバージョン判定とエラー型を追加 ([6562415](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/656241533d224c2567261695e1af010b52adc723))
* 設定解決モジュールを追加 ([519c1b6](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/519c1b6439f9a6337f662dd2c2296daba64f7740))


### Bug Fixes

* Codexリクエストのorigin判定を厳密化 ([c55832c](https://github.com/yohi/opencode-cloudflare-ai-gateway-chatgpt/commit/c55832c1d084eb437fd675679122ead1a7996eb4))
