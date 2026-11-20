import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-ai.js';

(() => {
  const MODEL_NAME = 'gemini-3.5-flash';
  const SYSTEM_INSTRUCTION = [
    '你是繁體中文的習慣養成小幫手。回答要溫暖、清楚、精簡，優先給一個今天就能開始的小步驟。',
    '只有在使用者提供的資料中才可引用其習慣或排程；沒有附資料時，不要猜測。',
    '不提供醫療診斷、投資建議或危險行為指示；不要假裝已替使用者修改 App 資料。'
  ].join('\n');
  const listeners = new Set();
  let app = null;
  let model = null;
  let chat = null;
  let identity = 'account';
  let status = '尚未設定 App Check';
  let initialized = false;

  function setStatus(value) {
    status = value;
    listeners.forEach(listener => listener(status));
    window.RiriEnhancements?.setGeminiStatus(status);
  }

  function historyForGemini(messages) {
    return messages
      .filter(message => (message.role === 'user' || message.role === 'model') && (message.historyText || message.text))
      .slice(-40)
      .map(message => ({ role: message.role, parts: [{ text: message.historyText || message.text }] }));
  }

  function startChat(messages = []) {
    if (!model) throw new Error('Gemini 尚未就緒');
    chat = model.startChat({ history: historyForGemini(messages) });
  }

  async function initialize(firebaseApp, siteKey, userKey) {
    if (userKey) identity = String(userKey).toLowerCase();
    app = firebaseApp || app;
    if (!app) { setStatus('Firebase 尚未初始化'); return false; }
    if (!siteKey || siteKey === 'YOUR_RECAPTCHA_ENTERPRISE_SITE_KEY') {
      setStatus('待設定 Firebase AI Logic 與 App Check 網站金鑰');
      return false;
    }

    if (!initialized) {
      try {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(siteKey),
          isTokenAutoRefreshEnabled: true,
        });
        const ai = getAI(app, {
          backend: new GoogleAIBackend(),
          useLimitedUseAppCheckTokens: true,
        });
        model = getGenerativeModel(ai, {
          model: MODEL_NAME,
          systemInstruction: SYSTEM_INSTRUCTION,
          generationConfig: { temperature: 0.65, topP: 0.9, maxOutputTokens: 700 },
        });
        initialized = true;
      } catch (error) {
        setStatus(`Gemini 初始化失敗：${error?.message || '請檢查 Firebase App Check 設定。'}`);
        return false;
      }
    }

    const saved = readHistory();
    startChat(saved);
    setStatus('Gemini 已就緒');
    return true;
  }

  function historyKey() { return `riri-gemini-chat-v1:${identity}`; }

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(historyKey()) || '[]');
      return Array.isArray(value) ? value.slice(-40) : [];
    } catch { return []; }
  }

  function saveHistory(messages) {
    try { localStorage.setItem(historyKey(), JSON.stringify(messages.slice(-40))); }
    catch { setStatus('對話無法儲存在此瀏覽器；仍可繼續使用本次對話'); }
  }

  async function send(text, context, history) {
    if (!initialized || !model) throw new Error('Gemini 尚未就緒；請先完成 Firebase AI Logic 與 App Check 設定。');
    startChat(history || readHistory());
    const question = String(text || '').trim().slice(0, 1200);
    if (!question) throw new Error('請先輸入問題。');
    const contextBlock = context ? `\n\n使用者同意附上的所選日期習慣摘要（僅供回答，不得假設其他資料）：\n${JSON.stringify(context)}` : '';
    const historyText = `使用者問題：${question}${contextBlock}`;
    const result = await chat.sendMessage(historyText);
    const answer = result.response.text()?.trim();
    if (!answer) throw new Error('Gemini 沒有產生文字回覆，請換個問法再試。');
    return { answer, historyText };
  }

  function clear() {
    try { localStorage.removeItem(historyKey()); } catch { /* Local storage may be unavailable. */ }
    if (model) startChat([]);
  }

  function onStatus(listener) {
    listeners.add(listener);
    listener(status);
    return () => listeners.delete(listener);
  }

  window.RiriGeminiAssistant = {
    initialize, send, clear, readHistory, saveHistory, onStatus,
    get status() { return status; },
    get isReady() { return initialized && !!model; },
    get modelName() { return MODEL_NAME; },
  };
  document.dispatchEvent(new CustomEvent('riri-gemini-ready'));
})();
