# Gemini 習慣小幫手設定

## 功能與資料範圍

網頁透過 Firebase AI Logic 的 Gemini Developer API 呼叫 `gemini-3.5-flash`，不在前端放置 Gemini API key。使用者勾選同意後才可送出問題；每次提問與同一對話前文會傳給 Google Gemini。若勾選「附上所選日期摘要」，才會另外傳送該日習慣名稱、時間、完成狀態與待辦標題及狀態；之前附過的摘要會留在對話前文，直到清除對話為止。私人小記、登入憑證、Email 不會放進摘要。對話紀錄存在目前瀏覽器的 localStorage，可由聊天窗清除。

## Firebase 專案設定

1. 在已登入 Firebase CLI 的環境執行：

   ```bash
   cd firebase-ai
   npx -y firebase-tools@latest init ailogic
   ```

   這會在 Firebase 專案啟用 Gemini Developer API。目錄中的 `.firebaserc` 已指向網站目前使用的 Firebase 專案 `1072776614801`。

2. 在 Firebase Console 的 **App Check** 為網站 Web App 註冊 **reCAPTCHA Enterprise**，取得對應的公開 site key。確認 AI Logic App Check 的要求已設定後，將 site key 放入 `index.html` 的 `window.FIREBASE_APP_CHECK_SITE_KEY`。

3. 部署 GitHub Pages 後，使用者登入並開啟「AI 小幫手」。在 Firebase AI Logic 啟用及 App Check 完成前，介面會顯示待設定狀態，送出按鈕保持停用。

## 目前的設定限制

本工作環境有 Node.js，但沒有 npm／Firebase CLI，因此無法替你執行 `init ailogic`；也沒有取得 reCAPTCHA Enterprise site key。這兩項必須先在 Firebase 專案完成，Gemini 才會實際回覆。網站的 Firebase 登入網域也必須先加入 Firebase Authentication 的授權網域清單。
