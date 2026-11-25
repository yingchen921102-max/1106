import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-ai.js';

(() => {
  const MODEL_NAME = 'gemini-3.8-flash';
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

  async function suggestPlan(input) {
    if (!initialized || !model) throw new Error('Gemini 尚未就緒；請先完成 Firebase AI Logic 與 App Check 設定。');
    const prompt = [
      '請根據下方目標資料，為繁體中文使用者規劃每週或每月投入時間，並提供三個循序漸進的小步驟。',
      '若 totalTargetHours 有數值，必須沿用；若為 null，請根據目標名稱與子目標估算合理的總工作時數。',
      '優先依期限、每週可投入時數、每週頻率這三項中已知的兩項，推算另一項；若三項都已知，請檢查是否可行並說明。不要超過總工作時數。',
      '若沒有提供期限，請以每週可投入時數與頻率估算完成週數；若沒有提供每週可投入時數，請依期限與頻率算出每週建議投入時數。',
      '每次練習分鐘數依本期所選日期均分。時數以 0.25 小時為單位，頻率以每週次數表示。',
      '只回傳 JSON，格式：{"totalTargetHours":數字,"hoursPerPeriod":數字,"sessionsPerWeek":數字,"estimatedWeeks":數字,"milestones":["步驟一","步驟二","步驟三"],"reason":"一句話說明"}。',
      '每個步驟少於 70 個字，不要假設使用者沒有提供的背景。',
      `目標資料：${JSON.stringify(input)}`,
    ].join('\n');
    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(text || '{}');
    const suppliedTotalHours = Number(input.totalTargetHours);
    const totalTargetHours = Number.isFinite(suppliedTotalHours) && suppliedTotalHours > 0
      ? suppliedTotalHours
      : Number(parsed.totalTargetHours);
    const periodCount = Math.max(1, Number(input.periodsLeft) || 12);
    const hoursPerPeriod = Number.isFinite(Number(parsed.hoursPerPeriod))
      ? Number(parsed.hoursPerPeriod)
      : totalTargetHours / periodCount;
    const availableWeeklyHours = Number(input.weeklyAvailableHours) || 0;
    const deadlineWeeks = periodCount * (input.periodUnit === '月' ? 4.345 : 1);
    const sessionsPerWeek = Number.isFinite(Number(parsed.sessionsPerWeek))
      ? Number(parsed.sessionsPerWeek)
      : Math.max(0, Number(input.sessionsPerWeek) || 0);
    const estimatedWeeks = Number.isFinite(Number(parsed.estimatedWeeks))
      ? Number(parsed.estimatedWeeks)
      : availableWeeklyHours > 0 ? totalTargetHours / availableWeeklyHours : deadlineWeeks;
    if (!Number.isFinite(totalTargetHours) || totalTargetHours <= 0 || totalTargetHours > 10000) {
      throw new Error('Gemini 回傳的目標總時數不合理，請檢查目標或子目標描述。');
    }
    if (!Number.isFinite(hoursPerPeriod) || hoursPerPeriod < 0 || hoursPerPeriod > totalTargetHours) {
      throw new Error('Gemini 回傳的時數不合理，已改用本機免費估算。');
    }
    if (!Number.isFinite(sessionsPerWeek) || sessionsPerWeek < 0 || sessionsPerWeek > 14 || !Number.isFinite(estimatedWeeks) || estimatedWeeks < 0 || estimatedWeeks > 5200) {
      throw new Error('Gemini 回傳的頻率或完成週數不合理，請再試一次。');
    }
    if (!Array.isArray(parsed.milestones) || parsed.milestones.length !== 3 || !parsed.milestones.every(item => typeof item === 'string' && item.trim() && item.length <= 70)) {
      throw new Error('Gemini 計畫格式不完整，已改用本機免費估算。');
    }
    return { totalTargetHours, hoursPerPeriod, sessionsPerWeek, estimatedWeeks, milestones: parsed.milestones.map(item => item.trim()), reason: String(parsed.reason || '').slice(0, 160) };
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
    initialize, send, suggestPlan, clear, readHistory, saveHistory, onStatus,
    get status() { return status; },
    get isReady() { return initialized && !!model; },
    get modelName() { return MODEL_NAME; },
  };
  document.dispatchEvent(new CustomEvent('riri-gemini-ready'));
})();
