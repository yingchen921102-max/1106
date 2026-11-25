# Gemini 習慣小幫手設定

## 功能與資料範圍

網頁透過 Firebase AI Logic 的 Gemini Developer API 呼叫 `gemini-3.8-flash`，不在前端放置 Gemini API key。使用者勾選同意後才可送出問題；每次提問與同一對話前文會傳給 Google Gemini。若勾選「附上所選日期摘要」，才會另外傳送該日習慣名稱、時間、完成狀態與待辦標題及狀態；之前附過的摘要會留在對話前文，直到清除對話為止。私人小記、登入憑證、Email 不會放進摘要。對話紀錄存在目前瀏覽器的 localStorage，可由聊天窗清除。

## Firebase 專案設定

Firebase AI Logic 已於 2026-11-24 啟用在專案 `project-4997808708120673764` 的 Web App `1:1072776614801:web:def1dce6986c3ae92d0030`（顯示名稱：習慣養成系統）。`firebase-ai/.firebaserc` 會使用此 Project ID。

### App Check 網站驗證

已在 Google Cloud 建立 **Web、score-based** reCAPTCHA Enterprise 金鑰，允許網域 `yingchen921102-max.github.io`，並已註冊到 Firebase App Check 的網站 Web App。公開 site key 已填入 `index.html` 的 `window.FIREBASE_APP_CHECK_SITE_KEY`。

App Check token TTL 為 1 小時，最低有效風險分數為 0.5。

Firebase Console 管理頁：https://console.firebase.google.com/project/project-4997808708120673764/appcheck/apps

Site key 是網站公開設定值；App Check debug token 則是秘密，不可寫入或提交到程式碼。

`gemini-assistant.js` 使用 `gemini-3.8-flash` 和 limited-use App Check tokens。仍需在瀏覽器載入網站、確認 AI 小幫手顯示已就緒，並送出問題確認 Gemini 有回覆。

### CLI 初始化紀錄

Firebase AI Logic 已由 CLI provisioning 啟用。一般 `firebase init ailogic` 流程在此環境無法顯示 Web App 選擇選單，因此使用同一個 Firebase CLI provisioning API，指定上方已核對的 Web App ID 完成設定。

一般初始化指令如下（在 `firebase-ai` 目錄執行）：

   ```bash
   cd firebase-ai
   npx -y firebase-tools@latest init ailogic
   ```

## 驗證紀錄

- Firebase AI Logic、reCAPTCHA Enterprise 與 Firebase App Check API 均已啟用；Web App 的 App Check 設定已確認使用 score-based 金鑰，僅允許 `yingchen921102-max.github.io`。
- 一次性 App Check debug token 的簽發與交換成功，測試後已撤銷，沒有保留 debug token。
- Gemini `gemini-3.8-flash` 請求已送達 Firebase AI Logic，但 Google 回覆 HTTP 500「模型目前需求量高」。重試仍遇到相同錯誤；短時間重試亦觸及免費層每分鐘 5 次限制。因此尚未確認模型成功產生文字，需等服務恢復後再測。
- 本機網站設定已更新，尚未推送至 GitHub Pages。
