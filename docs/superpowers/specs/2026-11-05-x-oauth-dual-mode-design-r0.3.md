# cf-ai-gw-relay — X OAuth Dual-Mode Design R0.3

- 基準日：2026-11-05（JST）
- Status：DESIGN_CANDIDATE / HUMAN_OWNER_ADOPTION_PENDING
- Repository：`yohi/cf-ai-gw-relay`
- 想定リポジトリ配置先（未作成）：`docs/superpowers/specs/2026-11-05-x-oauth-dual-mode-design-r0.3.md`
- 権限：`DOCUMENT_ONLY / NO_GITHUB_WRITE / NO_RUNTIME_CHANGE / NO_REAL_OAUTH / NO_AUTO_FOLLOWUP`

## 1. 目的と成功条件

OpenCode V2からの個人用GPT推論をCloudflare AI Gatewayに集約し、利用者のChatGPTプランが正式に認可した範囲で公開Responses APIを利用する。OpenCode、`oc2`、Local OAuth Agentのライフサイクルは独立させる。

初期スコープは単一ユーザー・単一ChatGPTアカウント、`GET /v1/models`と`POST /v1/responses`、SSEと必要なTool Calling、暗号化資格情報管理、明示的なFail-Closedに限定する。Claude Adapter、複数アカウント、Chat Completions変換、従量課金への自動フォールバックは対象外。

成功条件は (1) Cloudflare Gateway経由の全推論が認証・観測可能である、(2) 適法・認可済みのOAuth経路のみ有効化される、(3) OpenCode V2の実際のResponsesリクエストが適切に処理される、(4) 失効・ロック・PC停止・トンネル断で直接接続や別課金経路へ切り替えない、の4点。設計完了と実OAuthの稼働完了は区別する。

## 2. 設計入力と証拠境界

既存のNeon FunctionsモックPoCでは、デプロイ、Bearer認証の拒否・成功、OpenAI互換モック、直接／Gateway経由SSE逐次配信、Gatewayログ保存、PostgreSQLのAES-256-GCM暗号化合成データ保存・単発CAS更新が実測PASS。Neon Freeで稼働したが、Functions Active/Waiting Capacity-Hoursおよび長期的な無料枠維持は未測定。実ChatGPT OAuth、実GPT推論、同時Refresh競合、OpenCode V2との実通信は未検証。

既存の規範仕様`SPEC.md`はIssue #28を上位権限とするC1（OpenCode所有OAuth、Deno Relay）を規定する。本R0.3は別途検討中の「X所有／Local Agent所有OAuth」案であり、既存C1の正式な変更・置換・採択を意味しない。`apps/deno-relay`やOpenCode Pluginには本タスクで触れない。

## 3. 方式比較と採用方針

| 方式 | OAuth資格情報とRefresh | 推論実行場所 | ローカルPC停止 | 重要な条件 |
| --- | --- | --- | --- | --- |
| **A：Neon管理（第一候補）** | Neon PostgreSQL＋Neon Functions | Neon→公開OpenAI API | 利用可能 | **ホスト型利用とローカルからの資格情報移行が明示的に許可されること** |
| **B：操作PC管理（代替候補）** | 操作PCのLocal OAuth Agent | Local Agent→公開OpenAI API | 利用不可 | **OSS/ローカル認証フローとNeon経由中継を含む利用形態が許可範囲に入ること** |
| C：OpenCode所有OAuth（既存C1） | OpenCode | 既存C1契約による | OpenCode稼働依存 | XがOAuthを管理する要件とは異なるため本案では不採用 |

**原則：A/Bはデプロイ時に一つを明示選択し、リクエスト単位の自動切替・フォールバックを禁止する。** Aが禁止・未許可ならBへ自動移行しない。A/Bのどちらも承認・有効化されない場合はモック／構造テストに留める。

### 共通入口

```
OpenCode V2（oc2とは独立）
  → Cloudflare AI Gateway（入口認証、メタデータログ）
  → Neon Functions X（X用Bearer認証、ルーティング、SSE中継）
     ├─ A：Neon GPT Adapter → https://api.openai.com/v1/responses
     └─ B：Cloudflare Access + Tunnel
            → 操作PC Local OAuth Agent → https://api.openai.com/v1/responses
```

BでNeonを経由するのはGatewayの既存Custom Provider設定とXの同一インターフェースを維持するための設計上の選択。GatewayからTunnelへ直接接続する簡素化案は考えられるが、今回の採択案・自動変更の対象外。

## 4. OAuthの公式仕様とホスティング許可ゲート

Sign in with ChatGPTのOpen-source integrationは、ChatGPTプランでの利用を明示的に許可されたResponsesリクエストに利用するためのOAuth経路を公開している。対象はOSS・ローカルホスト型アプリであり、有料またはリモートホスト型アプリについてはOpenAIが別途関心表明・申請を案内している。**個人専用、localhostでのCallback、トークンをNeonに暗号化保存することのいずれも、リモートホスト型利用の許可を自動的に証明しない。** 私有リポジトリとしての開発形態がOSS向け案内の適用対象かも未確認。

公式参考：
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/token-reference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://developers.openai.com/siwc/request-client-id

### 許可ゲート（A/B別に判定）

- `HOSTING_AUTH_A=UNCONFIRMED`、`HOSTING_AUTH_B=UNCONFIRMED`を初期値とする。
- Aの有効化には、管理型Neon Functionsでの推論・Refresh・資格情報保管とローカル認証情報の安全な移行について、OpenAIの適用条件および必要な許可が具体的に確認できることを要求する。
- Bの有効化には、操作PC上のLocal Agentの実装・配布形態と、Cloudflare Gateway／Neonを介したリモート呼出しが対象の認可範囲に入ることを確認する。トークンがローカルに留まるだけでは十分ではない。
- 正式な承認・制約・Client登録方式・必要なHost IDの扱いを記録し、Human Ownerが当該モードを明示承認した場合にのみ `OAUTH_MODE=A` または `B` の実資格情報機能を有効にする。
- 上記条件がない場合、動作状態は`DISABLED_BY_POLICY`でFail-Closed。未承認の実トークン登録・推論は行わない。

## 5. 初回OAuth認証・アカウント同定

対象の公式OSSフローが利用許可された場合の実装契約：

1. 実行ホストごとに安定した`ext_agent_host_id`を生成・永続化する。PCとNeonは同一ホストとして扱わない。初回認証でOSS動的登録が許可された場合のみ`client_id=dynamic_agent_client`を使用し、認可レスポンスに含まれる発行済み`oaiapp_...` Client IDを保存する。ホスト型向けに異なる正式な登録方式が指定される場合はその方式を優先する。
2. 操作PCで`127.0.0.1` Loopback Listener（`http://127.0.0.1:<port>/auth/callback`）を起動。`state`、OIDC `nonce`、PKCE verifier／S256 challengeを試行単位で新規生成し、同一Redirect URIでコード交換する。`localhost`へホスト名を置換しない。
3. 公開された認可URL`https://auth.openai.com/api/accounts/authorize`で本人のブラウザ認証と同意を実施。OSS対象での要求スコープは`openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`、resourceは`https://api.openai.com/v1`。
4. Callbackの`state`および発行済みClient IDの一致を確認したうえで、`https://auth.openai.com/api/accounts/oauth/token`へAuthorization Code＋PKCEで交換。ID TokenをOpenAIのJWKSで署名検証し、issuer、audience、nonce、期限、subjectを照合する。
5. Token応答の**実際に付与された**scopeを評価する。`chatgpt.tokens.use.direct`が無い場合は推論禁止。アカウント同一性が異なる認可情報で既存レコードを上書きしない。
6. Aでは**利用許可確認後に限り**、公式に許容された安全な方法でNeonへ資格情報を転送する。VMガイドのSSHコピー手順を、管理型Neonにも無条件適用できるとは見なさない。BではトークンをPC外へ出さない。

Access Tokenの標準有効期間は1時間、Refresh Tokenは30日・成功時にローテーションされる。更新可能な最早時刻として`earliest_refresh_at`も保持し、期限だけでなく公式の更新制約に従う。Refreshでは発行済みClient ID、`grant_type=refresh_token`、`resource`を使い、`scope`は送らない。RevocationはOpenID DiscoveryのEndpointを使用する。

## 6. セキュリティ・認証状態

### 共通状態機械

`DISABLED_BY_POLICY` →（明示承認）→ `UNLINKED` →（OAuth完了と権限確認）→ `ACTIVE`。その他、`CREDENTIAL_LOCKED`（Bのみ）、`REFRESHING`、`TEMPORARY_UNAVAILABLE`、`REAUTH_REQUIRED`、`DISCONNECTED`を定義する。`ACTIVE`以外の状態で推論しない。ただし実行時の`REFRESHING`では同一セッションの後続要求を待機または期限内の有効Access Tokenで処理する方針を実装計画で明文化し、更新競合を起こさない。

### A（Neon）の秘密情報

AES-256-GCM、鍵バージョン、レコード固有Nonce、アカウント／Client IDに紐付く認証付き付加データ（AAD）を使用。資格情報・発行済みClient ID・OAuth subject・Granted scopes・expires_at・earliest_refresh_at・version・Refresh状態を保管する。暗号鍵はDBから分離したNeon側のシークレット管理に置く。秘密値をGitHub、Gatewayログ、Neonログ、URL、エラー本文、バックアップ資料へ露出させない。DB PoCの単発CAS成功は、本番のRefresh競合制御が実証済みであることを意味しない。

Refreshの二重実行を防ぐため、DBで所有者・期限・fencing tokenを持つ排他的Refreshリースを取得し、**ネットワークRefresh前に**単一実行者を決定する。成功時はToken群とVersionを同一トランザクションで原子的に置換し、他の更新者はCAS失敗で書き戻さない。ネットワーク結果不明／ローテーション後DB保存失敗時は危険な再Refreshを禁止して`REAUTH_REQUIRED`または調査を要する停止状態にする。失効・権限拒否・一時障害を区別する。

### B（操作PC）の秘密情報

Local AgentはSecret Service互換のOS資格情報ストア（GNOME Keyring等）を第一候補とする。`systemd --user`でユーザーログイン時に起動し、`oc2`・OpenCodeの起動終了とは無関係に稼働する。デフォルトでは`linger`を有効にせず、ユーザーログアウト後の常時稼働は必須としない。

GUIログインでKeyring解錠済みなら追加パスフレーズを要求しない。自動ログイン・SSHのみではKeyringが施錠状態となり得るため`CREDENTIAL_LOCKED`でFail-Closed。TPM2自動解錠・平文保存・`oc2`からの秘密情報読取は初期スコープ外。OS資格情報ストアは同一ユーザー権限の悪意あるプロセスからの完全隔離を保証しない。

### 資格情報の分離

OpenCodeが保持するのはCloudflare AI Gateway用資格情報のみ。Cloudflare GatewayがX用APIキーを保持。Bの場合、NeonはさらにCloudflare Access Service Token（および任意のAgent用独立認証鍵）を保持するが、OpenAI OAuth Tokenは保持しない。X APIキーの保持者はNeon URLに直接接続可能であるため、「Gateway経由のみ」を暗号学的に保証するものではない。認証境界は管理・運用上分離する。

## 7. BのCloudflare Tunnel契約

操作PCの`cloudflared`が外向き接続を確立。Accessで保護された専用ホスト名をNeonが呼び、Cloudflare Access **Service Auth**ポリシーで専用Service Tokenだけを許可する。Neonの要求には`CF-Access-Client-Id`／`CF-Access-Client-Secret`を設定し、定期ローテーション・失効に対応する。

Local Agentは`127.0.0.1`にのみBindし、専用の内部推論パス（例：`POST /internal/v1/responses`）と最小限の非機密ヘルス確認だけを提供する。OAuth Callback、Token表示、認証情報編集、Keyring解錠などの管理APIはTunnel側のホスト名・ルートに公開しない。Tunnelだけではアクセス制限されないためAccessを必須とし、Local Agent側でも独立した内部認証、最大Bodyサイズ、リプレイ抑止、明示的なパス許可を実装する。

Neonからローカルへ接続できない場合は503相当のFail-Closed。Agentと`cloudflared`の独立した起動順序を許容し、再接続可能にするが、OpenCodeを自動起動しない。Neon→Tunnel→Agent→OpenAI→同じ経路のSSE戻りについて、最初のデータ到着・逐次性・中断伝播・エラーを検証する。Neon／Cloudflareの経路ではPrompt等のデータを中継するため、「トークンがローカルに残る」と「Promptがローカルに残る」を混同しない。

参考：
- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/tunnel-useful-terms/

## 8. Responses APIとOpenCode互換契約

外部公開は`GET /v1/models`、`POST /v1/responses`を必須とし、GatewayのCustom Providerで追加・除去され得る`/v1`プレフィックスは**実測に基づき定義済みの別名のみ**許可する。意図しない任意パスへの代理送信はしない。初期はStreaming必須とし、非Streaming入力を勝手に変更しない。

利用可能モデルはOAuthで許可された`GET https://api.openai.com/v1/models`の`models[]`と`visibility`から取得し、XのOpenAI互換モデル一覧へ明示的に変換する。固定した存在未確認のモデルをサポート済みとして返さない。

`POST https://api.openai.com/v1/responses`へは当該モードのOAuth Bearer Tokenで送信する。公式のChatGPTプラン経路ではHTTPリクエストに`store:false`、`stream:true`、全履歴を含む配列`input`を必須とする。`previous_response_id`によるHTTP会話継続は使用しない。system roleの明示的`message`入力など拒否される形式を送らない。

公式Preview制限に列挙された未対応フィールド（例：`background`、`conversation`、`max_output_tokens`、`max_tool_calls`、`metadata`、`prompt`、`temperature`、`top_p`、`truncation`、`user`）は初期仕様で拒否する。例外・許容フィールドは公式仕様の変化と、OpenCode V2の実送信Bodyに基づき最小限で定義する。Tool Callingは許可された構成のみ通し、未知のHosted Toolを捏造して変換しない。

SSEはフレーム順序・イベント種別を保持し、`response.completed`を正常完了とする。`response.failed`、`response.incomplete`、HTTPエラー、途中切断は成功と扱わない。クライアント切断はX→（BではAgent）→上流へ伝播。SSE開始後のエラーはHTTPステータス変更ができないため、ストリーム失敗として記録・終了処理する。履歴をサーバー側に恒久保存せず、クライアントから各要求に必要な文脈を送る。

認証・Admissionエラーの401/403、利用上限429、サービス一時利用不可503を区別し、OpenAIから返る公式エラーコードおよびRequest IDを秘匿情報を除いて記録する。追加課金のAPIキー経路・ChatGPT非公開`backend-api`経路・別モードへの黙示的フォールバックは一切行わない。

## 9. テストと受入条件

### モック実装の受入条件（実OAuth不要）

1. A/Bの明示選択と未承認時の`DISABLED_BY_POLICY`を検証。
2. Cloudflare Gateway経由で想定どおりのモデル・Responses I/Fが利用できること、未認証要求を拒否することを検証。X用APIキーの漏えい時までNeon URLへの直接接続を暗号学的に遮断できるとの主張はしない。
3. BのAccess Service Token／Agent独立認証の成功・拒否、Agent停止・Tunnel断・Keyring施錠をモック検証。
4. 両方式でSSE順序、キャンセル、上限、Timeout、上流エラーの伝播を検証。
5. Refresh成功・ローテーション・同時更新・不確定結果のFail-Closedを模擬試験。実トークンを使わない。
6. OpenCode V2の実送信Request Bodyを取得し、許可フィールド、モデル名、Tool Callingとの互換を特定。互換変換は確認された差分だけに限定。

### 実OAuthを有効化できる受入条件（別途承認必須）

7. 選択したモードの公式利用許可条件が確認・記録済み。
8. Human Ownerが認証開始・資格情報登録・該当環境の有効化を明示承認。
9. 公式経路でOAuth取得、同一アカウント確認、Refresh、切断／失効が動作。
10. 公開Responses APIへの実推論がSSEで成功し、Cloudflare Gatewayへログが保存される。
11. Free枠およびセキュリティ境界を運用条件に反映する。

上記7〜10は現時点で未実施・未承認。モックのPASSを実OAuthのPASSとして扱わない。

## 10. 残余リスク・停止条件・Owner判断

未解決：Aのリモートホスト型許可、BのローカルOSS適用とリモート経由アクセスの許可、OpenCode V2の具体的な互換差分、Bの通信経路の実測、Refresh競合制御の実装、Neon Functions Freeの長期消費量。

重大な許可不足、認証境界の破綻、OAuth Token漏えい、誤課金経路への切替、実際に観測された不可逆なRefresh Token競合があれば該当機能を停止し、無関係なモック開発まで自動停止しない。

今回の成果物は**設計案R0.3のみ**。Human Ownerによる採択判断を次のCheckpointとする。承認なしにGitHub Commit/Push、Neon/Cloudflare設定変更、実OAuth認証、Implementation Plan作成、実装・テスト、追加独立レビューを開始しない。採択されても後続作業は別途指定された範囲のみ。
