# 日日｜介面與功能優化規劃

## 現況與目標

目前的單頁原型已提供今日習慣、週檢視、七日回顧、基本提醒與目標欄位；使用者資料存於瀏覽器 `localStorage`。下一版應保留既有的溫和視覺與快速打卡，同時將週期計畫、個人偏好及外部同步改為可跨裝置使用的資料。

## 主要介面

| 頁面 | 規劃 | 重要互動 |
|---|---|---|
| 今日 | 顯示問候、今日進度、習慣卡與今日待辦；用顏色和圖示區分習慣（綠色圓點／重複圖示）及待辦（藍色方塊／單次圖示）。 | 點習慣卡進入單項追蹤頁；完成、跳過、補記時數與心情。 |
| 週檢視 | 以週為橫軸、習慣和待辦為列；每日格顯示排程、完成、跳過。提供「本週目標／預估投入／實際投入」。 | 每週期開始時手動勾選執行日期與時間，檢視 AI 建議後確認；可拖動日期或調整單次時數。 |
| 月曆 | 月格顯示每日完成率色階；點日查看當日習慣及待辦，提供完成／未完成／跳過圖例。 | 前後月切換；可切換習慣、待辦或全部。 |
| 回顧 | 週、月切換；圓餅圖呈現完成、未完成、跳過比例，另以趨勢圖看連續性和投入時數。 | 點圖例篩選記錄；明確將「未打卡」與「跳過」分開統計。 |
| 單項習慣 | 專屬詳情頁：總目標、週期小計畫、累積量、歷史完成日、心情／筆記、排程與提醒。 | 滾動調整未來計畫；已完成的歷史資料保留。 |
| 偏好設定 | 日間／夜間／跟隨系統、個人問候語、週起始日、提醒裝置、靈感主題與外部連結。 | 可預覽主題；各整合可個別中斷、重新授權及刪除同步資料。 |

## 週期目標與 AI 計畫

每個大計畫有目標量、單位、起訖日與每週可投入上限。開始每個週期時，使用者選定實際日期及可用時段；AI 僅依這些限制生成小計畫，呈現計算依據、每週投入時間、分段里程碑及緩衝週。使用者確認後才建立排程。若落後或修改可用時數，重新估算未來週期，不回寫已完成的紀錄。提供手動編輯和「不使用 AI」模式。

計畫計算應由確定性服務驗證 AI 建議：剩餘目標量 ÷ 剩餘週數得到最低週投入，並限制在使用者指定的可用時數內；不可行時回報缺口，不應承諾可達成。AI 輸入只包含使用者選擇提供的目標和偏好，不含 OAuth 憑證。

## 動態靈感與個人化

偏好頁可選藝術、科學、財經、設計等主題、語氣與每日呈現時段。首頁靈感卡標示來源、日期及「換一則／不感興趣」；優先顯示可追溯來源的每日內容。AI 可依主題整理摘要或提示，不製造新聞來源。偏好可隨時清除，靈感卡不阻擋打卡流程。

## 提醒策略

App 後端保存時區、提醒偏好與排程，推播以 APNs／FCM 發送到已登記的手機裝置；桌面瀏覽器使用 Web Push（需 HTTPS、Service Worker 與使用者授權）。Google 日曆提供額外的跨裝置提醒，不作為唯一提醒通道。提醒去重鍵為使用者、習慣、排程日期與提醒類型；支援勿擾時段及裝置管理。

## 外部整合與建議技術棧

- **前端**：沿用現有 HTML 原型逐步元件化；新 API 一律呼叫本 App 後端，瀏覽器不持有 Google／Notion access token。
- **後端**：Node.js + TypeScript + Fastify；Firebase ID Token 驗證可沿用現有登入，後端用 Firebase Admin 驗證並映射使用者。
- **資料庫**：PostgreSQL + Prisma，保存帳號偏好、習慣、每期排程、打卡、整合連線、外部 ID 與同步佇列。
- **背景工作**：Redis + BullMQ 處理同步、推播與重試；失敗工作保留在佇列供重試／人工檢視。
- **憑證**：資料庫只存 AES-GCM 加密後的 OAuth token；正式環境以雲端 KMS 封存資料加密金鑰及輪替，金鑰不可與資料庫同處。

從目前原型升級時，先提供一次性的本機資料匯入：使用者確認後將 `localStorage` 習慣、狀態、小記與目標送到登入中的帳號，保留原項目 ID 以利去重；匯入成功才切換讀寫到伺服器，讓舊資料不會因換裝置而消失。

### Google 日曆

使用伺服器端 OAuth 2.0 授權碼流程，scope 僅請求 `https://www.googleapis.com/auth/calendar.events`。排程固定且規律時建立含 RRULE 的系列事件；使用者每期手選日期時，將該期日期展開成獨立事件，避免 RRULE 排出未選日期。資料庫保存 Google event/instance ID；打卡時更新對應 occurrence 描述或顏色。首次連結需取得 refresh token（`access_type=offline`，必要時 `prompt=consent`）。

### Notion

優先採 Notion OAuth，讓使用者選擇授權的工作區和目標資料庫；不要把 Integration Token 放入前端。每一筆「習慣週期執行紀錄」寫成一個 database page，資料庫至少包含：習慣名稱（Title）、執行頻率（Select）、預計累積時數（Number）、完成狀態（Status 或 Checkbox）、執行日期（Date）。另建議加上 App Sync Key（Rich text）以便重試去重。用戶資料仍以 App 為主；初版採 App → Notion 單向寫入，後續雙向同步須以版本時間戳、來源欄位和衝突佇列處理。

## 資料模型要點

`Habit`（目標及週期設定）→ `ScheduleOccurrence`（每期實際排定日期、時數和狀態）→ `IntegrationRecord`（Google event 或 Notion page 對照）。`SyncOutbox` 使用唯一冪等鍵記錄待同步工作與重試狀態。Notion 的長期紀錄宜為每次執行各一列，避免單一習慣頁覆寫歷史。

## 分階段交付

1. **基礎**：主題／個人化設定、習慣詳情頁、待辦與習慣視覺區分、週期目標資料結構。
2. **規劃與回顧**：週期日期選擇、可編輯的小計畫、月曆、完成／未完成率圖表與時數回顧。
3. **整合**：後端帳號映射、Google OAuth 與日曆事件、Notion OAuth 與資料庫選擇、同步狀態中心及重試佇列。
4. **提醒與內容**：Web Push／手機推播、靈感主題和每日內容來源。

## API 建議

- `GET /integrations/google/start`、`GET /integrations/google/callback`
- `GET /integrations/notion/start`、`GET /integrations/notion/callback`
- `GET /integrations/notion/databases`、`PUT /integrations/notion/database`
- `POST /habits/:habitId/schedule` 建立／更新已確認排程
- `POST /occurrences/:id/complete` 更新完成狀態並新增同步工作
- `GET /integrations/status` 顯示連線及同步狀態

## 速率限制與失敗處理

Notion API 約 3 requests/sec/connection，Google 依專案／使用者配額限制。工作佇列按 provider 和使用者做併發節流；遇到 429／暫時性 5xx 依 `Retry-After` 或帶 jitter 的指數退避，並設重試上限。永久 4xx（權限、欄位 schema 不符）標示需使用者處理，不無限重試。Google 用穩定事件 ID 防止重複插入；Notion 頁面以 App Sync Key 查找後更新／略過，因 Notion 建頁沒有通用 idempotency header。所有操作寫入 outbox，提供重播與人工重新同步。

## 上線前決策

Google OAuth 需設定 OAuth consent screen、授權網域與 callback URL；正式發佈時依 Google 驗證要求完成敏感 scope 審查。Notion OAuth 需建立公開／內部 integration 並設定 redirect URI。確認資料保留期限、使用者解除連線時是否刪除外部事件，以及日曆事件是寫入主日曆或專屬日曆。
