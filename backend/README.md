# 日日整合後端骨架

此資料夾提供 Fastify + TypeScript + PostgreSQL/Prisma 的伺服器端 OAuth 與 API 範例。前端用既有 Firebase 登入取得 ID token，對受保護 API 傳 `Authorization: Bearer <Firebase ID token>`；Google／Notion OAuth token 僅由後端交換、加密及保存。

API CORS 僅允許 `.env` 的 `APP_ORIGIN`（只填 origin，不含 `/1106/` 路徑），OAuth 回跳首頁使用 `APP_BASE_URL`（可含 GitHub Pages 子路徑），並只接受指定方法與 Authorization／Content-Type 標頭。

## 開發啟動

1. 複製 `.env.example` 為 `.env` 並填入本機設定；`.env` 已排除在 Git 之外。
2. 建立 PostgreSQL、Redis，設定 Firebase Admin Application Default Credentials。
3. 安裝依賴後執行 `npm run db:generate`、`npm run db:migrate`、`npm run dev`。
4. 在 Google Cloud OAuth 用戶端及 Notion integration 登記 `.env` 中完全相同的 redirect URI。

## App 裡的 API 網址要填什麼

此專案目前只有後端原始碼，尚未部署成公開服務，所以目前沒有可填的 API 網址。App 設定頁的網址欄位要填「已部署後端服務的根網址」，例如 `https://riri-api-xxxxx-uc.a.run.app`；不要填 Google Calendar、Notion 網址，也不要把 `/health` 加在最後。

目前連結的 Firebase 專案尚未啟用 Cloud Run、Cloud SQL、Memorystore Redis 或 Secret Manager，Firebase 專案也沒有綁定計費帳戶；Google Calendar 和 Notion 的後端 OAuth 用戶端憑證亦未設定。因此不能直接產生可用的服務網址。Cloud Run/資料庫/佇列部署需先確認計費方案與月費預算，再建立必要的雲端資源和 OAuth 憑證。

取得網址前，必須先備妥 PostgreSQL、Redis、Firebase Admin 身分、Google OAuth 用戶端、Notion OAuth integration，以及部署環境中的密鑰。部署服務後，瀏覽 `https://你的服務網址/health` 應回傳 `{"ok":true}`。接著把服務根網址貼回 App，按「測試網址」並看到「API 正常」，再按儲存。

後端要使用：

- `APP_ORIGIN=https://yingchen921102-max.github.io`（僅 origin，不含 `/1106/`）
- `APP_BASE_URL=https://yingchen921102-max.github.io/1106`（含 App 子路徑）
- Google OAuth redirect URI：`https://你的服務網址/integrations/google/callback`
- Notion OAuth redirect URI：`https://你的服務網址/integrations/notion/callback`

OAuth client secret、Firebase Admin 憑證、資料庫密碼和 `TOKEN_ENCRYPTION_KEY_BASE64` 都要放在部署平台的 Secret Manager，不能貼進 App 網頁或提交到 GitHub。這份原型後端的 token 加密僅供開發示範；正式服務需先採用雲端 KMS 與受管理的資料庫／佇列。

## OAuth 與 API

- Google 只要求 `calendar.events`，使用授權碼與 offline access；state 為隨機值，只存其雜湊並在 10 分鐘後失效。
- 前端使用受保護的 `GET /integrations/{google|notion}/authorize-url` 取得授權網址，再由瀏覽器導向供應商；Google 週排程與月排程分別由 `POST /integrations/google/schedules` 建立 RRULE 系列或單次事件。
- `POST /integrations/google/occurrences/complete` 及 `POST /integrations/notion/occurrences` 將打卡更新放入 outbox 佇列。
- Notion 用 OAuth 建立連線，`GET /integrations/notion/databases` 列出使用者已授權資料庫，再用 `PUT /integrations/notion/database` 選擇目標；後端會驗證欄位名稱與型別。
- Google 固定週期範例見 `src/calendar.ts`；使用者每期自選日期應建立單次 occurrence 事件。完成同步需用 series ID 找出該日期的 instance，再更新 instance，勿修改整個系列。
- Notion page 寫入與狀態更新範例見 `src/notion.ts`。目標資料庫欄位名稱需與程式 mapping 一致，並新增 `App Sync Key`（Rich text）作為重試去重鍵。
- `GET /integrations/status` 回傳連線設定與各同步狀態筆數，不包含任何憑證。

Notion 完成欄位若使用 Checkbox，只能呈現完成／未完成；「跳過」仍保留在 App 的紀錄中。選用 Status 欄位時可區分待開始、已完成、跳過。

## 進入正式環境前

`src/vault.ts` 的環境 AES key 僅供開發示範。正式環境應改為雲端 KMS envelope encryption（每 token 使用 data key，資料庫存 ciphertext、nonce、wrapped data key、KMS key version），設金鑰輪替與存取稽核。需再加入同源限制、OAuth callback rate limit、授權解除／token 撤銷、Notion 資料庫欄位驗證、Outbox worker 消費邏輯、資料保留策略與雙向同步衝突處理。

`src/queue.ts` 建立持久重試工作；建立 outbox row 後以 row ID 做 job ID 呼叫 `enqueueSync`。`src/worker.ts` 提供三種核心工作（建立 Google 每週系列、完成狀態更新、Notion occurrence upsert），成功時將 row 標為 `SUCCEEDED`，失敗時記錄錯誤；超出 8 次後標記 `FAILED`。以 `npm run worker` 啟動工作處理器。Notion 429 的 `Retry-After` 和 Google 429／rateLimitExceeded 由 `src/retry.ts` 處理，短重試之後再交由佇列退避重試。

`src/outbox.ts` 的 `persistProviderSync(tx, input)` 可在 Prisma 交易內 upsert `SyncOutbox`（`idempotencyKey` 唯一），交易提交後呼叫 `dispatchProviderSync(row)`；兩者也可用於獨立同步的便利方法 `enqueueProviderSync`。若佇列不可用，outbox row 保留，排程器可掃描 `PENDING` rows 並重新 enqueue。重新 enqueue 使用 outbox row ID 作 job ID，避免建立重複工作。完成率或排程變更時，應在同一資料庫交易中保存 App 狀態與 outbox，再派送工作，確保 App 資料不會因第三方短暫故障而遺失。
