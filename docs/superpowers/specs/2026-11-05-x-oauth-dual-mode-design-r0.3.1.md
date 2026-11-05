# cf-ai-gw-relay — X OAuth Dual-Mode Design R0.3.1（F-001〜F-004 限定訂正）

- 基準日：2026-11-05（JST）
- Status：TARGETED_DOCUMENTARY_CORRECTION_CANDIDATE / HUMAN_OWNER_ADOPTION_PENDING / IMPLEMENTATION_BLOCKED
- Repository：`yohi/cf-ai-gw-relay`
- 原本（GitHub・変更なし）：`docs/superpowers/specs/2026-11-05-x-oauth-dual-mode-design-r0.3.md` @ `5ffc714c13a4050a1477052ecaa55ef9afafbab0`
- 訂正対象：R0.3本文。GitHubへの書込み・置換は未承認、未実施。
- Baseline：`master` @ `4ffa8d1e885277ef1400360ec0f826b5c5f4459d`
- 権限：`DOCUMENT_ONLY / NO_GITHUB_WRITE / NO_IMPLEMENTATION / NO_TEST_EXECUTION / NO_RUNTIME_CHANGE / NO_GATE_CHANGE / NO_REAL_OAUTH / NO_AUTO_FOLLOWUP`
- Findings：`F-001`（Bモデル一覧）、`F-002`（A資格情報移管）、`F-003`（OpenCode V2）、`F-004`（B内部認証）。追加の設計拡張は行わない。

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

BでNeonを経由するのはGatewayの既存Custom Provider設定とXの同一インターフェースを維持するための設計上の選択。GatewayからTunnelへ直接接続する簡素化案は考えられるが、今回の採択案・自動変更の対象外。モデル一覧のB経路は §7.2、クライアント識別子とwire上のモデルIDの対応は §8.1 とする。

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

### A専用：資格情報移管の許可と所有権（F-002）

Aの資格情報移管はOpenAIが**実際に許可したクライアント登録・ホスト関係・移管方法**が確定して初めて実施可能とする。ローカルOSS向け動的登録や自己管理VM向けSSH移管を、マネージドNeonへそのまま転用してよいと推定しない。登録時Client IDのユーザー／ワークスペース結合、ローカル`ext_agent_host_id`とNeon固有`ext_agent_host_id`の差異を保持する。Neonへの移管が許可されない、または公式手順が本プロトコルと矛盾する場合、**A_CREDENTIAL_HANDOFF_BLOCKED / DISABLED_BY_POLICY**として停止し、実装者の裁量で別の移管方式へ切り替えない。

許可が得られた場合に採用する**単一の移管プロトコル**は次のとおり。これは本プロジェクトの設計契約であり、OpenAIが承認した手順であるとの主張ではない。

1. **管理境界**：通常の推論API／Cloudflare AI Gatewayを通さず、ローカルの単独移管CLI（送信者）からNeon Xの専用HTTPS管理面（受信者）へ直送する。管理面は`/_admin/v1/oauth/handoffs`配下のみ、OAuth許可ゲートが無効なら全操作を403で拒否。推論用`X_POC_API_KEY`／CF Gateway Tokenを管理認証に流用しない。専用のランダム256-bit以上の`X_HANDOFF_ADMIN_SECRET`をLocal CLIのOS資格情報ストアとNeonの実行環境Secretに別途配備し、`Authorization: Bearer`で認証する。サービス内部のToken管理権限はこの管理面に限定する。**固定された共通Secretの配備と失効はHuman Ownerの明示承認が必要**であり、共有Secretを置けない環境では移管を禁止する。
2. **準備（認証済み）**：`POST /_admin/v1/oauth/handoffs/prepare`、Bodyは`{mode:"A", client_id, issuer, subject, workspace_binding, local_host_id, neon_host_id}`（SecretやTokenなし）。Neonは許可条件と現在の同一アカウントIdentityを確認し、`handoff_id`（推測不能な128-bit以上）、使い捨て`challenge`、有効期限5分を返す。Neon固有の`neon_host_id`は事前に生成・保存済みであり、Local Host IDをコピーしない。`workspace_binding`は当該許可と資格情報で確実に検証できる識別子のみを使用し、取得できなければ照合不能としてSTOPする。
3. **送信側停止**：Local CLIは単一アカウントのRefreshを**永続的な移管ロック**で停止し、`TRANSFER_PREPARED`へ遷移する。以後、移管結果が確定するまでローカル側がRefresh・推論にTokenを使用しない。ローカル再起動後もロックは解除されない。
4. **Commit（認証済み）**：`POST /_admin/v1/oauth/handoffs/{handoff_id}/commit`（HTTPSのみ、Redirect禁止、JSON上限64 KiB）に、準備時`challenge`、同一の`client_id`／issuer／subject／workspace／両Host ID、Access Token、Refresh Token、必要なID Token、Granted Scopes、Token有効期限を含める。TLS 1.2以上で通信し、URL・Query・HTTPログ・Gatewayログ・TraceにTokenを含めない。これは**送信時HTTPS暗号化**であり、Neonのメモリ内では復号されたTokenを取り扱う（端点間でNeonから秘密を隠す方式ではない）。受信後はAES-256-GCMで暗号化してDBへ格納する。
5. **受信者の検証と確定**：Neonは`handoff_id`／challengeの一回性・期限、許可レコード、署名検証済みID Tokenのissuer／audience／subject、認可済みClient ID／scope／ワークスペース・Host結合を確認する。既存登録があれば**同じissuer・subject・workspace・Client ID**であることを厳密に照合し、不一致を409で拒否する。要求を単一DBトランザクションで一回だけ適用し、Token群・暗号化鍵バージョン・Token Version・移管Stateを不可分に保存する。`handoff_id`を一意キーとし、同一Commitの重送には同じ非秘密の確定Receiptを返し、異なるBody／Identityの再使用は409で拒否する。管理上の一回性はToken本文をログに残さず、管理DBに状態とHMAC化したBody識別子として保持する。
6. **Receiptと所有権移転**：Neonは`{handoff_id,state:"COMMITTED",credential_version,neon_host_id}`のみ返す。NeonはCommit直後に資格情報を`COMMITTED_PENDING_ACTIVATION`として保存するが、この状態では推論／Refreshを実施しない。Local CLIは確定Receipt（必要ならStatus APIで再取得）を確認後、ローカルの旧Tokenを削除し永続`TRANSFERRED`へ遷移する。**ローカルでRevocation Endpointを呼ばない**（Neonへ移したTokenを失効させ得るため）。その後、`POST /_admin/v1/oauth/handoffs/{handoff_id}/activate`（同管理認証、空Body、冪等）を呼び、Neonが状態を`ACTIVE`に切り替えた時点でRefresh所有者はNeonのみになる。Receiptを失った場合は双方停止を継続し、Status照会で回復する。未確定状態を成功扱いしない。
7. **結果不明と中断**：応答喪失・Timeout時はTokenを再取得・再Refreshせず、`GET /_admin/v1/oauth/handoffs/{handoff_id}`（同管理認証、非秘密の`PREPARED | COMMITTED_PENDING_ACTIVATION | ACTIVE | EXPIRED | FAILED`）で照会する。`COMMITTED_PENDING_ACTIVATION`なら確定Receiptとしてローカル側Token削除を確認後`activate`だけを再試行し、`ACTIVE`なら移管完了とする。`PREPARED`なら同一Commit内容のみ再送可能、`EXPIRED | FAILED`なら受信側未保存を確認した場合に限りローカルの旧所有権を復帰する。保存可否が不明なら`TRANSFER_UNCERTAIN`で両側停止・再認証判断とし、自動的なローカルRefresh再開を禁止する。
8. **失敗コードと監査**：管理認証失敗401、モード不許可403、アカウント／重複不整合409、期限切れ410、Body過大413、一時障害503。監査ログは`handoff_id`、段階、結果コード、時刻、生成時刻、匿名化した内部Account Record IDのみ。Access Token、Refresh Token、ID Token、Authorization Code、メールアドレス、Client Secret、Body、Authorizationヘッダーを記録しない。

Aの移管経路と通常推論経路を混同せず、Bでは上記管理APIを無効にする。`HOSTING_AUTH_A=UNCONFIRMED`の間はAPIを実装しても**常時403**で、実トークン移管は未実施とする。

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

OpenCodeが保持するのはCloudflare AI Gateway用資格情報のみ。Cloudflare GatewayがX用APIキーを保持する。AのNeon管理面は別途`X_HANDOFF_ADMIN_SECRET`を使用し、推論面と分離する。BのNeonはCloudflare Access Service Tokenと**必須の独立内部HMAC鍵**を保持し、OpenAI OAuth Tokenは保持しない。Local Agentは対応する内部HMAC鍵をOAuth用Keyringと**独立**した`systemd --user`サービス専用credential（Owner限定権限）として保持する。内部鍵を省略してよい例外は認めない。X APIキーの保持者はNeon URLに直接接続可能であるため、「Gateway経由のみ」を暗号学的に保証するものではない。認証境界は管理・運用上分離する。

## 7. BのCloudflare Tunnel契約

操作PCの`cloudflared`が外向き接続を確立。Accessで保護された専用ホスト名をNeonが呼び、Cloudflare Access **Service Auth**ポリシーで専用Service Tokenだけを許可する。Neonの要求には`CF-Access-Client-Id`／`CF-Access-Client-Secret`を設定し、定期ローテーション・失効に対応する。

Local Agentは`127.0.0.1`にのみBindし、Cloudflare Tunnelの**許可ルートを`GET /internal/v1/models`と`POST /internal/v1/responses`の2つだけ**とする。OAuth Callback、Token表示、資格情報編集、Keyring解錠、管理API、一般的なHTTP Proxy、Health／Debug APIはTunnel側に公開しない。Tunnelだけではアクセス制限されないためCloudflare Accessを必須とし、さらに§7.1の独立したAgent内部HMAC認証を**すべての内部APIで必須**とする。

Neonからローカルへ接続できない場合は503相当のFail-Closed。Agentと`cloudflared`の独立した起動順序を許容し、再接続可能にするが、OpenCodeを自動起動しない。Neon→Tunnel→Agent→OpenAI→同じ経路のSSE戻りについて、最初のデータ到着・逐次性・中断伝播・エラーを検証する。Neon／Cloudflareの経路ではPrompt等のデータを中継するため、「トークンがローカルに残る」と「Promptがローカルに残る」を混同しない。

参考：
- https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/tunnel-useful-terms/

### 7.1 B内部認証プロトコル（F-004・必須）

**二重認証を必須**とする。第1層はCloudflare Accessの専用Service Authポリシー。Neonは専用`CF-Access-Client-Id`／`CF-Access-Client-Secret`を送る。第2層はAccessとは独立した**HMAC-SHA256共有鍵によるリクエスト署名**。Access通過だけではAgentが要求を受理してはならない。

- 鍵の所有：Neon FunctionのSecretと、Local Agentの`systemd --user`専用credential（`LoadCredential`で渡すOwner限定の権限制限ファイル）に、同一の256-bit以上のランダム`X_AGENT_HMAC_KEY`を配備する。OAuth Tokenは従来どおりSecret Serviceに分離して保存し、KeyringがロックされてもHMAC認証だけは検証可能にする。鍵はX推論APIキー・Access Service Token・OAuth Token・A用管理Secretから完全に独立。鍵素材はソース／`.env`のGit管理／HTTPログに置かない。鍵は`key_id`で識別する。
- 署名対象：HTTP Method（大文字）、**パス**（Queryは禁止）、`Content-Type`、`X-X-Request-Id`、Unix秒`X-X-Timestamp`、128-bit以上の`X-X-Nonce`、および受信した**生Body bytesのSHA-256（小文字16進64桁）**を、UTF-8のLF区切りでこの順序に連結し、HMAC-SHA256のbase64url（Paddingなし）で署名する。`GET`のBodyは空文字列とする。BodyのJSON整形・再Serialize前に署名検証を行い、署名対象と推論内容を不可分にする。
- 必須ヘッダー：`X-X-Key-Id`、`X-X-Timestamp`、`X-X-Nonce`、`X-X-Request-Id`、`X-X-Signature`。AgentはKey ID・署名・時計差（±60秒以内）を定数時間比較を用いて検証する。余分なQuery・未許可パスは拒否する。
- Replay防止：Agentローカルの永続的なNonce表（SQLite等、`key_id + nonce`を一意制約）に認証成功のNonceを原子的に記録し、**少なくとも120秒**保持する。同じNonceは再起動後も再利用不可。時計逆行・Nonce保存失敗はFail-Closed。Clock skew上限を超えた要求は拒否する。
- Body上限：`POST`は256 KiB（262,144 bytes）、`GET`は空Body必須。`Content-Length`の申告と受信実Bytes双方で上限判定する。`Content-Type: application/json`のみ受理、`GET`の応答・内部エラーにも`Cache-Control: no-store`を付与する。
- ローテーション：Human Owner承認に基づき`key_id`を新規発行、Neon/Agent双方に新旧鍵を短時間併存（最長10分）、新鍵での通信確認後に旧鍵を削除する。失効時は即時拒否。同期に失敗した場合はBを停止し、旧鍵へ自動的に復帰しない。Access Service Tokenも別途ローテーションし、共有や使い回しを禁止する。
- ステータス：内部認証失敗401 `internal_unauthorized`、認証済みだが権限外403 `internal_forbidden`、replay409 `replayed_request`、Body過大413 `request_too_large`、未許可Route404 `not_found`。成功時でもKeyring未解錠なら423 `credential_locked`。秘密値や生Bodyをエラーに含めない。
- Access応答が302/HTMLログイン画面、401、403の場合、Neonは`redirect: manual`で**追従しない**。これらをモデルJSON／SSEとして透過転送せず、外部へ502 `bridge_access_failed`を返す。Agent内部HMACの401/403/409も外部へ502 `bridge_auth_failed`を返し、リクエストを上流OpenAIに送らない。

**署名規約**：`METHOD\nPATH\nCONTENT-TYPE\nREQUEST-ID\nTIMESTAMP\nNONCE\nBODY-SHA256-HEX`。ここで`\n`は単一LF文字、各フィールド値にCR/LFは許容しない。`GET`は`CONTENT-TYPE`を空文字列とする。プロキシ・Runtimeが書き換えるHostやContent-Lengthは署名対象とせず、Queryを禁止して曖昧なCanonicalizationを除く。署名ヘッダーはNeon→Agent間の内部用で、外部OpenCodeへ公開しない。

### 7.2 Bモデル一覧の唯一の経路（F-001）

```
OpenCode V2 --GET /v1/models--> Cloudflare AI Gateway
  --GET /v1/models--> Neon X
  --GET /internal/v1/models (Access Service Token + 必須HMAC)--> Local Agent
  --GET https://api.openai.com/v1/models (ローカルOAuth Bearer)--> OpenAI
```

- **Local Agent**がOAuth Tokenの唯一の利用主体。ローカルKeyringを解錠でき、`chatgpt.tokens.use.direct`等のGranted Scopesが有効であり、公式ホスト型利用許可ゲートが満たされた場合だけOpenAIモデル一覧を取得する。Token RefreshもAgentが排他的に管理する。`visibility == "list"`の`models[]`だけを抽出し、順序を維持して`{models:[{slug,display_name,visibility:"list"}]}`を返す。`slug`が空、重複、許可外なら返さない。
- **Neon X**はOAuth Token／Refresh Tokenを受け取らず、内部リストを公開用OpenAI互換`{object:"list",data:[{id:slug,object:"model",owned_by:"x-chatgpt"}]}`へ変換する。`slug`を改名・推測しない。クライアントのModel IDと公開`id`の照合は§8.1に従う。非認可・存在不明のモデルを追加しない。初期設計はモデル一覧のキャッシュなしとし、Agentが利用不能なら古いリストを成功応答として返さない。
- **拒否処理**：Keyring LOCKED→Agent 423→Neon 503 `credential_locked`。Agent停止／Tunnel断／Timeout→Neon 503 `agent_unavailable`。Access拒否・Redirect→Neon 502 `bridge_access_failed`。Agent内部認証失敗→Neon 502 `bridge_auth_failed`。OpenAI 401／Refresh不可→Agent 503 `reauth_required`、Neonも503。OpenAI 403→Neon 403 `model_access_denied`、429→Neon 429 `subscription_usage_limit`、上流5xx→Neon 502 `model_catalog_upstream_error`。いずれも秘密情報・生Bodyを返さない。
- **推論時の再認可**：Neonの事前モデル一覧取得はセキュリティ境界ではない。`POST /internal/v1/responses`でLocal AgentがモデルSlugの許可を**改めて検証**し、非認可・未知モデルを403 `model_not_authorized`で拒否する。Neon側も内部許可結果を元に外部403 `model_not_authorized`とする。固定のハードコードした存在未確認モデルを代替として返さない。
- この経路は**設計のみ**であり、実際にGETモデル一覧がB経由で動いた証拠はない。実OAuth許可が確認できない間は、実アカウントのモデル一覧取得を行わない。

## 8. Responses APIとOpenCode互換契約

外部公開は`GET /v1/models`、`POST /v1/responses`を必須とし、GatewayのCustom Providerで追加・除去され得る`/v1`プレフィックスは**実測に基づき定義済みの別名のみ**許可する。意図しない任意パスへの代理送信はしない。初期はStreaming必須とし、非Streaming入力を勝手に変更しない。

利用可能モデルは選択した方式のOAuth資格情報を用いて`GET https://api.openai.com/v1/models`の`models[]`／`visibility == "list"`／`slug`から取得し、XのOpenAI互換モデル一覧へ明示的に変換する。AではNeon側OAuth Token、BではLocal Agent側OAuth Tokenのみを使用する（§7.2）。固定した存在未確認のモデルをサポート済みとして返さない。

`POST https://api.openai.com/v1/responses`へは当該モードのOAuth Bearer Tokenで送信する。公式のChatGPTプラン経路ではHTTPリクエストに`store:false`、`stream:true`、全履歴を含む配列`input`を必須とする。**Xは、入力でこの条件が満たされない場合、黙って改変して送信せず422で拒否する**（ただし検証された無害な正規化が個別承認された場合のみ例外）。`previous_response_id`によるHTTP会話継続は使用しない。system roleの明示的`message`入力など拒否される形式を送らない。

公式Preview制限に列挙された未対応フィールド（例：`background`、`conversation`、`max_output_tokens`、`max_tool_calls`、`metadata`、`prompt`、`temperature`、`top_p`、`truncation`、`user`）は初期仕様で拒否する。例外・許容フィールドは公式仕様の変化と、OpenCode V2の実送信Bodyに基づき最小限で定義する。Tool Callingは許可された構成のみ通し、未知のHosted Toolを捏造して変換しない。

SSEはフレーム順序・イベント種別を保持し、`response.completed`を正常完了とする。`response.failed`、`response.incomplete`、HTTPエラー、途中切断は成功と扱わない。クライアント切断はX→（BではAgent）→上流へ伝播。SSE開始後のエラーはHTTPステータス変更ができないため、ストリーム失敗として記録・終了処理する。履歴をサーバー側に恒久保存せず、クライアントから各要求に必要な文脈を送る。

認証・Admissionエラーの401/403、利用上限429、サービス一時利用不可503を区別し、OpenAIから返る公式エラーコードおよびRequest IDを秘匿情報を除いて記録する。追加課金のAPIキー経路・ChatGPT非公開`backend-api`経路・別モードへの黙示的フォールバックは一切行わない。

### 8.1 OpenCode V2接続責務（F-003）

OpenCode V2の**新しい**設定体系を対象にし、旧OpenCodeの`provider`／`npm`／`@ai-sdk/openai`設定をV2の実装契約に流用しない。公式V2設定の`providers`へ独立Provider ID **`x-chatgpt`** を追加し、Responses専用Runtime Package **`@opencode/ai/providers/openai-compatible/responses`** を指定する。`settings.baseURL`はCloudflare AI Gateway Custom ProviderのResponsesリクエストが`POST /v1/responses`に到達するよう設定する。`settings.transport="http"`、`settings.encoding="none"`を要求し、WebSocket・zstd・非Streamingは初期対象外。通常の`openai/*`、`cf-ai-gw-relay/*`、`oc2`の認証ストアや内部Providerは変更しない。

**クライアント認証境界**：OpenCodeが所持できるのはCF AI Gateway Tokenだけで、`cf-aig-authorization: Bearer <CF_AIG_TOKEN>`をGatewayへ送る。Xの推論用APIキーはCloudflare Custom Providerに設定し、Neonへ注入する。OpenCodeのOAuth Token／X管理Secret／Access Service Token／B内部HMAC鍵をクライアントへ持ち込まない。V2 Providerが任意の`Authorization`ヘッダーを付ける場合、その値が誤ってNeon／上流OpenAIへ伝播しないことを必須検証とする。秘密を重複で無関係なヘッダーへ入れたり、Gatewayに誤設定することを許容しない。

**モデルID対応**（構成契約）：

| 層 | 規約 | 例（文字列は説明用。実アカウントでの存在証明ではない） |
| --- | --- | --- |
| OpenCodeの選択モデル | `x-chatgpt/<local_model_key>` | `x-chatgpt/coding` |
| V2の`providers.x-chatgpt.models[local_model_key].modelID` | 実際に許可された`slug`を指定 | `gpt-EXAMPLE-authorized-slug` |
| Xへ送るResponses Body | `model: <authorized_slug>` | `gpt-EXAMPLE-authorized-slug` |
| BのLocal Agent→OpenAI | 上記と同一`slug`を使用 | `gpt-EXAMPLE-authorized-slug` |

Xは`model`値を外部／内部の許可済みSlugと照合し、OpenCode固有のProvider Prefix／ローカルAliasを推測して取り除かない。モデル定義は`GET /v1/models`で得たSlugを元に、**明示的に更新**する。OpenCode V2の`providers`静的モデル定義が自動的に動的Catalogと同期すると仮定しない。Alias→Slugの誤りは404 `model_not_found`、存在するが認可外は403 `model_not_authorized`でFail-Closed。

**処理責務**：OpenCodeのResponses専用Runtimeは会話履歴の選択・統合、ツール定義、入力生成、SSEパース／Tool Callingへのイベント受け渡しを担当する。Xは許可モデル、Body上限、`store:false`／`stream:true`、配列`input`、許可されたTool Calling形式・フィールドを検証し、必要な認証情報と転送経路を付加する。Xは旧Backend APIへ翻訳せず、無条件のChat Completions互換変換を行わない。**上流のOAuth TokenをOpenCodeへ返さない。** SSEの`response.completed`のみ成功とし、`response.failed`／`response.incomplete`／途中切断を失敗・未完了とする。SSE接続後の障害はHTTP 200成功として記録しない。AbortはNeonからB AgentとOpenAIまで伝播させる。

**限定wire検証が必須**：現時点ではOpenCode V2実送信Body／Headerが**NOT_OBSERVED**であり、互換性のPASSは主張できない。Implementation Plan作成前に、固定するOpenCode V2実行バージョンとPackageを記録し、**実OAuthなし・ローカルモック受信先**に対して1回の限定プロトコル観測を実施する。確認対象はURL／HTTPメソッド／認証Header／不要なAuthorizationの有無、`model`、`store`、`stream`、`input`配列と履歴保持、reasoningやcache/metadata等の追加フィールド、Function Tool宣言とtool call結果、SSE終了イベント、client abort。秘密は合成値のみ用い、本文は公開しない。**観測で不整合があれば、その差分に限る変換方針と受入条件をImplementation Plan着手前に確定する**。対応不能なwire差分があれば`OPEN_CODE_V2_WIRE_BLOCKED`として実装計画を開始せず、通常の`openai/*`へ自動迂回しない。

公式参照（V2）：https://opencode.ai/v2/docs/providers/

## 9. テストと受入条件

### モック実装の受入条件（実OAuth不要）

1. A/Bの明示選択と未承認時の`DISABLED_BY_POLICY`を検証。
2. Cloudflare Gateway経由で想定どおりのモデル・Responses I/Fが利用できること、未認証要求を拒否することを検証。X用APIキーの漏えい時までNeon URLへの直接接続を暗号学的に遮断できるとの主張はしない。
3. BのAccess Service Token／Agent独立認証の成功・拒否、Agent停止・Tunnel断・Keyring施錠をモック検証。
4. 両方式でSSE順序、キャンセル、上限、Timeout、上流エラーの伝播を検証。
5. Refresh成功・ローテーション・同時更新・不確定結果のFail-Closedを模擬試験。実トークンを使わない。
6. **Implementation Plan作成前の限定観測**として、§8.1の固定バージョン・合成Tokenによるwire Captureを実施する（**この文書訂正Taskでは実施しない**）。受理・拒否・限定変換を確定する。

### F-001〜F-004 の文書上の受入契約（このTaskでは実行しない）

| Finding | モック／限定検証で確認すること | 現時点の状態 |
| --- | --- | --- |
| F-001 Bモデル一覧 | Keyring解錠・施錠、Agent停止、Tunnel断、Access 302/401/403、OpenAI 401/403/429/5xx、未知Slug、catalog→`data[]`変換、OAuthがNeonに非流入 | 設計契約定義済み／実行NOT_RUN |
| F-002 A移管 | 403 Policy Gate、管理認証401、challenge一回性、同一主体Identity、重送の冪等性、異なるBodyの409、応答喪失Status照会、`COMMITTED_PENDING_ACTIVATION`→`ACTIVE`、二重Refresh禁止、ローカルToken削除とRevocation禁止 | 設計契約定義済み／実OAuth移管BLOCKED |
| F-003 OpenCode V2 | Provider package、Gateway Token header、modelID→Slug、Body/store/stream/input/tool/SSE/Abortの合成値wire観測 | 実Body未取得、Implementation Plan前の限定観測必須 |
| F-004 B内部認証 | Service Auth拒否、必須HMAC、Body改竄、Timestamp±60秒、Nonce再利用／再起動後のReplay、256KiB上限、Access Redirect非追従、内部Route Allowlist、Key rotation | 設計契約定義済み／実行NOT_RUN |

この受入表は実装計画・テストの**仕様入力**であり、今回のTaskでテスト実行やImplementation Plan作成を認めるものではない。両文書間の乖離検証はImplementation Planが未作成のため**NOT_APPLICABLE**、将来計画作成時の完了条件としてのみ引き継ぐ。

### 実OAuthを有効化できる受入条件（別途承認必須）

7. 選択したモードの公式利用許可条件が確認・記録済み。
8. Human Ownerが認証開始・資格情報登録・該当環境の有効化を明示承認。
9. 公式経路でOAuth取得、同一アカウント確認、Refresh、切断／失効が動作。
10. 公開Responses APIへの実推論がSSEで成功し、Cloudflare Gatewayへログが保存される。
11. Free枠およびセキュリティ境界を運用条件に反映する。

上記7〜10は現時点で未実施・未承認。モックのPASSを実OAuthのPASSとして扱わない。

## 10. 残余リスク・停止条件・Owner判断

未解決：AのマネージドNeon利用許可と正式なホストID／Client ID移管適合性、BのローカルOSS適用とNeon経由アクセスの許可、OpenCode V2の実際のProvider/Header/Responses wire差分（NOT_OBSERVED）、BのTunnel/Access/HMAC経路の実測（NOT_RUN）、Refresh競合制御の実装（NOT_IMPLEMENTED）、Neon Functions Freeの長期消費量（NOT_MEASURED）。これらを観測済み失敗と同一視しない。

重大な許可不足、認証境界の破綻、OAuth Token漏えい、誤課金経路への切替、実際に観測された不可逆なRefresh Token競合があれば該当機能を停止し、無関係なモック開発まで自動停止しない。

今回の成果物は**R0.3→R0.3.1 限定文書訂正版のみ**。F-001〜F-004の設計上の責務・停止条件を定義したが、Document Readinessは**HUMAN_OWNER_DECISION_PENDING**、Implementation Readinessは**BLOCKED**。Human Ownerによる採択判断を次のCheckpointとする。承認なしにGitHub Commit/Push、Neon/Cloudflare設定変更、実OAuth認証、Implementation Plan作成、実装・テスト、追加独立レビューを開始しない。採択されても後続作業は別途指定された範囲のみ。
