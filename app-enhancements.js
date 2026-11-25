(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const app = window.RiriApp;
  if (!app) return;

  const identity = String(window.HABIT_USER_KEY || 'account').toLowerCase();
  const preferencesKey = `riri-preferences-v1:${identity}`;
  const tasksKey = `riri-tasks-v1:${identity}`;
  const safeLoad = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const savePreferences = () => localStorage.setItem(preferencesKey, JSON.stringify(preferences));
  const saveTasks = () => localStorage.setItem(tasksKey, JSON.stringify(tasks));
  const preferences = safeLoad(preferencesKey, {
    theme: 'system', displayName: window.HABIT_DISPLAY_NAME || '我的帳戶', topic: '藝術', topics: ['藝術創作']
  });
  let tasks = safeLoad(tasksKey, []);
  let calendarMode = 'week';
  let calendarCursor = new Date();
  let reviewMode = 'week';
  let reviewRange = null;
  let detailHabitId = null;
  let detailPreviousView = 'today';
  let pendingPlanDates = null;
  let detailSuggestion = null;
  let pendingPlanHours = null;
  let pendingPlanMilestones = null;
  let pendingHabitEdit = null;
  let initialized = false;

  const pad = n => String(n).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const fromKey = key => new Date(`${key}T12:00:00`);
  const addDays = (date, amount) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
  const escapeHTML = app.escapeHTML;
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const topicPrompts = {
    '藝術創作': ['把眼前一件物品畫成三條線，留下最重要的形狀。', '用五分鐘記錄今天最有感覺的一個畫面。', '用文字、顏色或聲音，替今天的心情做一張小作品。'],
    '心理與自我成長': ['寫下一件今天做得不錯的小事，練習看見自己的努力。', '把最近煩惱的事分成「我能影響」和「暫時不能影響」兩欄。', '給明天的自己留一句具體而溫柔的提醒。'],
    '閱讀與寫作': ['讀兩頁書，摘下一句讓你停下來想一想的話。', '用三句話記錄今天學到的事：事實、感受、下一步。', '挑一個主題自由寫五分鐘，不必急著修改。'],
    '科學探索': ['把今天的一個「為什麼」寫下來，找一個可信來源開始查證。', '用自己的話解釋一個剛學到的概念。', '觀察一個生活現象，先提出假設，再想一個驗證方法。'],
    '科技與 AI': ['找一個重複的小任務，想想科技可以如何替你省下一步。', '讀一則科技消息，分清楚已經發生的事和對未來的預測。', '試用一個新工具十分鐘，記下它真正解決了什麼問題。'],
    '財經與理財': ['選一個常見經濟指標，弄懂它代表什麼、又不代表什麼。', '檢視一筆近期支出，想想它是否符合你重視的事。', '讀財經消息時，找出數字的來源與比較基準，再形成看法。'],
    '職涯與工作': ['把手邊工作拆成最小的下一步，先專注完成十五分鐘。', '記下一項本週學到、下次可以重複使用的工作方法。', '寫下今天最有成就感的一刻，以及它需要哪些能力。'],
    '商業與創業': ['想想你常使用的一項服務，它替人解決了什麼麻煩？', '把一個點子寫成「誰遇到什麼問題，我能怎麼幫忙」。', '觀察一家小店，留意它如何讓顧客願意再次回來。'],
    '設計與靈感': ['挑一個今天用過的介面，想想它讓哪件事更容易。', '把一件麻煩的小事拆成三步，看看哪一步可以更順手。', '找一個喜歡的設計，記下它如何照顧使用者的需要。'],
    '健康與運動': ['起身活動三分鐘，伸展肩頸或走一小段路。', '今天多留意一次身體訊號，安排一小段休息。', '把運動目標縮到容易開始的五分鐘，再決定要不要繼續。'],
    '瑜伽與冥想': ['坐好一分鐘，慢慢數十次呼吸，不需要改變任何感受。', '做一個舒服的伸展，停留在不勉強的範圍。', '短暫放下螢幕，留意身體和周圍的三個聲音。'],
    '美食與料理': ['用手邊食材做一道簡單料理，記下你最喜歡的味道。', '吃下一餐時放慢一點，留意食物的香氣與口感。', '挑一種常用食材，看看它還能有什麼新的搭配。'],
    '旅行與文化': ['找一個陌生城市，花五分鐘了解它的一項日常文化。', '聽一首不同語言的歌，記下最吸引你的一個聲音。', '用一張照片或幾句話記錄你所在地方的生活風景。'],
    '自然與環境': ['出門時留意一種植物、雲或鳥，觀察它一分鐘。', '今天少用一件一次性用品，看看替代方式是否可行。', '打開窗戶感受天氣，寫下一個你注意到的自然變化。'],
    '電影與音樂': ['聽一首歌，專心找出一個以前沒留意的樂器或聲音。', '回想一個喜歡的電影場景，它為什麼讓你記得？', '用一段旋律或一句台詞描述今天的心情。'],
    '生活整理': ['整理桌面一個小角落，讓明天開始時少一個阻礙。', '把一件待辦事縮小成兩分鐘能完成的版本。', '替常用物品找一個固定位置，減少下一次尋找時間。'],
    '語言學習': ['學三個和今天生活有關的單字，試著各造一句話。', '聽一段短音檔，先抓大意，再回頭找一個不懂的片語。', '用正在學的語言寫一句今天的日記。'],
    '時事與社會': ['讀一則公共議題報導，找出不同立場各自關心的事。', '看到一項新資訊時，先確認日期、來源和原始資料。', '挑一個社會議題，寫下你還想了解的一個問題。']
  };
  const topicIcons = {
    '藝術創作':'🎨','心理與自我成長':'🌱','閱讀與寫作':'📚','科學探索':'🔬','科技與 AI':'🤖','財經與理財':'💰',
    '職涯與工作':'💼','商業與創業':'🚀','設計與靈感':'✏️','健康與運動':'🏃','瑜伽與冥想':'🧘','美食與料理':'🍲',
    '旅行與文化':'🧳','自然與環境':'🌿','電影與音樂':'🎬','生活整理':'🧺','語言學習':'🗣️','時事與社會':'📰'
  };
  const topicInspiration = {
    '藝術創作': { lines: ['先觀察一個細節，靈感常從注意開始。', '創作不必一次到位，先留下第一筆。', '換一種材料，也許就換一個看法。'], link: 'https://artsandculture.google.com/', linkLabel: '逛逛 Google Arts & Culture' },
    '心理與自我成長': { lines: ['照顧自己的節奏，也是前進。', '不用一次解決所有事，先處理能改變的一小步。', '情緒值得被看見，不必急著修正。'], link: 'https://greatergood.berkeley.edu/', linkLabel: '閱讀幸福與心理學文章' },
    '閱讀與寫作': { lines: ['讀到一句喜歡的話，停下來想想它為何打動你。', '寫作不必先有結論，先把觀察留下來。', '每天讀一小段，也是在替想像力留空間。'], link: 'https://www.gutenberg.org/', linkLabel: '探索免費電子書' },
    '科學探索': { lines: ['好奇心，從一個可以查證的問題開始。', '先觀察，再提問；答案會更清楚。', '世界不缺奇妙的事，只缺多看一眼。'], link: 'https://science.nasa.gov/', linkLabel: '探索 NASA 科學內容' },
    '科技與 AI': { lines: ['好工具的價值，是讓重要的事更容易。', '新科技值得好奇，也值得多問一句：證據在哪裡？', '試用工具時，留意它替你省下了哪一步。'], link: 'https://ai.google.dev/', linkLabel: '查看 Google AI 開發資源' },
    '財經與理財': { lines: ['理解風險與時間，比追逐短期消息更重要。', '看見一個數字時，也看看它的來源和比較基準。', '理財的第一步，可以是弄清楚一筆錢去了哪裡。'], link: 'https://www.investor.gov/', linkLabel: '閱讀免費投資者教育資料' },
    '職涯與工作': { lines: ['職涯的下一步，可能是今天練熟的一項能力。', '把大任務縮小，讓開始比等待完美容易。', '記下今天學到的方法，下次就能走得更穩。'], link: 'https://www.onetonline.org/', linkLabel: '探索職業與所需技能' },
    '商業與創業': { lines: ['好點子先說清楚：幫誰解決什麼問題？', '觀察人們真正需要什麼，常比急著想答案更有用。', '一個小實驗，也能替大想法找到方向。'], link: 'https://ecorner.stanford.edu/', linkLabel: '收聽 Stanford 創業分享' },
    '設計與靈感': { lines: ['好設計讓有用的事更容易被看見。', '試著少一個步驟，看看體驗會不會更順。', '靈感不只來自漂亮，也來自貼心。'], link: 'https://m3.material.io/', linkLabel: '瀏覽 Material Design 指引' },
    '健康與運動': { lines: ['規律比強度更容易長久。', '今天多活動幾分鐘，也是在照顧未來的自己。', '休息和運動一樣，都是健康的一部分。'], link: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity', linkLabel: '閱讀 WHO 身體活動資訊' },
    '瑜伽與冥想': { lines: ['慢下來，也是一種練習。', '不用改變此刻的感受，先陪自己呼吸幾次。', '給身體一點空間，讓注意力回到當下。'], link: 'https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/relaxation/', linkLabel: '閱讀放鬆練習建議' },
    '美食與料理': { lines: ['用手邊食材重新搭配，熟悉的味道也會有新發現。', '慢慢品嚐一口，留意香氣、口感和心情。', '一道簡單料理，也可以成為照顧自己的方式。'], link: 'https://www.nhs.uk/healthier-families/recipes/', linkLabel: '瀏覽免費食譜' },
    '旅行與文化': { lines: ['理解一個地方，可以先從它的日常生活開始。', '旅行不只看風景，也是在練習用不同角度觀看。', '一段文化故事，常藏在普通的一天裡。'], link: 'https://www.unesco.org/en/culture', linkLabel: '探索 UNESCO 文化主題' },
    '自然與環境': { lines: ['留心一小處自然，也能改變一天的視角。', '觀察一種植物或鳥，試著記住它的樣子。', '照顧環境，可以從今天少浪費一樣東西開始。'], link: 'https://www.inaturalist.org/observations', linkLabel: '看看世界各地的自然觀察' },
    '電影與音樂': { lines: ['一段旋律或一個鏡頭，可能替心情找到語言。', '專心聽一首歌，試著發現以前沒注意的聲音。', '喜歡一部作品時，想想它讓你記得的是什麼。'], link: 'https://folkways.si.edu/', linkLabel: '聆聽 Smithsonian Folkways 音樂' },
    '生活整理': { lines: ['整理空間，先替明天減少一個小阻力。', '留下真正需要的東西，也是在留出餘裕。', '兩分鐘能完成的小整理，也算一次重新開始。'], link: 'https://www.notion.so/templates/category/personal-productivity', linkLabel: '看看免費個人整理範本' },
    '語言學習': { lines: ['每天用一句新語言，讓學習走進生活。', '說錯也沒關係，練習本來就是靠修正前進。', '把新單字放進自己的句子，記憶會更有溫度。'], link: 'https://www.bbc.co.uk/learningenglish/', linkLabel: '使用 BBC 免費英語學習資源' },
    '時事與社會': { lines: ['理解一件事，別忘了看看數字背後的背景。', '讀新聞時，先確認日期、來源和原始資料。', '不同立場可以並存，先弄清楚各自在關心什麼。'], link: 'https://ourworldindata.org/', linkLabel: '查看全球議題與資料' },
  };
  const legacyTopicNames = { '藝術': '藝術創作', '財經': '財經與理財', '科學': '科學探索', '設計': '設計與靈感' };
  const legacyTopics = Array.isArray(preferences.topics) ? preferences.topics : [preferences.topic || '藝術創作'];
  preferences.topics = [...new Set(legacyTopics.map(topic => legacyTopicNames[topic] || topic).filter(topic => Object.hasOwn(topicPrompts, topic)))];
  if (!preferences.topics.length) preferences.topics = ['藝術創作'];
  delete preferences.topic;

  function getPeriod(unit, date) {
    const start = new Date(date);
    if (unit === 'month') start.setDate(1);
    else {
      const offset = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - offset);
    }
    start.setHours(12, 0, 0, 0);
    const end = unit === 'month' ? new Date(start.getFullYear(), start.getMonth() + 1, 0, 12) : addDays(start, 6);
    return { unit, start, end, key: `${unit}:${dateKey(start)}` };
  }

  function datesInPeriod(period) {
    const days = [];
    for (let current = new Date(period.start); current <= period.end; current = addDays(current, 1)) days.push(new Date(current));
    return days;
  }

  function scheduledOn(habit, date) {
    const period = getPeriod(habit.cycleUnit || 'week', date);
    const plan = habit.plans?.[period.key];
    return plan ? plan.dates.includes(dateKey(date)) : (habit.days || []).includes(date.getDay());
  }

  function dateFacts(date) {
    const key = dateKey(date);
    const scheduled = app.habits.filter(habit => scheduledOn(habit, date));
    const doneHabits = scheduled.filter(habit => app.statusOf(habit, key) === 'done').length;
    const skippedHabits = scheduled.filter(habit => app.statusOf(habit, key) === 'skip').length;
    const openHabits = scheduled.length - doneHabits - skippedHabits;
    const dueTasks = tasks.filter(task => task.dueDate === key);
    const doneTasks = dueTasks.filter(task => task.done).length;
    return {
      date, key, scheduled, done: doneHabits + doneTasks, skipped: skippedHabits,
      open: openHabits + dueTasks.length - doneTasks, total: scheduled.length + dueTasks.length,
      taskCount: dueTasks.length, doneTasks, dueTasks
    };
  }

  function addInterface() {
    if (!$('#inspirationCard')) {
      $('#summary')?.insertAdjacentHTML('afterend', `<section id="inspirationCard" class="card inspiration-card" aria-live="polite"><div><div class="inspiration-eyebrow">今日小練習 · <span id="inspirationTopic">藝術</span></div><p class="inspiration-text" id="inspirationText"></p><div class="inspiration-source" id="inspirationSource">依偏好主題每日輪替的練習提示</div><div class="mobile-theme-detail"><p id="mobileInspirationQuote"></p><a id="mobileInspirationLink" href="https://artsandculture.google.com/" target="_blank" rel="noopener noreferrer">延伸探索免費資源 →</a></div></div><div class="inspiration-actions"><button class="quiet-btn" id="nextInspiration" type="button">換一則</button><button class="quiet-btn" id="topicSettings" type="button">選擇靈感主題</button></div></section>`);
    }
    if (!$('#taskPanel')) {
      $('.content-grid')?.insertAdjacentHTML('afterend', `<section id="taskPanel" class="card task-panel"><div class="task-heading"><h2>今日待辦</h2><span id="taskCount" class="month"></span></div><form class="task-form" id="taskForm"><input id="taskTitle" maxlength="100" required aria-label="待辦內容" placeholder="新增一件今天想完成的事"><input id="taskDueDate" type="date" required aria-label="到期日"><button class="primary" type="submit">＋ 加入待辦</button></form><div class="task-list" id="taskList"></div></section>`);
    }
    const form = $('#habitForm');
    if (form && !$('#cycleUnit')) {
      $('#dayChoices')?.insertAdjacentHTML('afterend', `<div class="period-settings"><div class="field"><label for="cycleUnit">目標週期</label><select id="cycleUnit" class="setting-select"><option value="week">每週</option><option value="month">每月</option></select></div><div class="field"><label for="periodTargetHours">每週可學習時數（選填）</label><input id="periodTargetHours" class="period-target" type="number" min="0.25" step="0.25" placeholder="例如每週 8 小時"></div><p class="form-hint">每週可投入時數、目標期限與每週頻率可互相推算。若只設定子目標，Gemini 會先估總工作量；每期日期可在目標頁調整。</p></div>`);
    }
    if (!$('#habitDetailView')) {
      $('#alternateView')?.insertAdjacentHTML('afterend', `<section id="habitDetailView" class="detail-shell"><div class="heading-row"><div><div class="eyebrow">YOUR ROUTINE, YOUR PACE</div><h1 id="detailHeading" class="detail-title"></h1><p class="detail-subtitle">每期安排可以調整，已完成的紀錄會保留。</p></div><button class="secondary" id="detailBack" type="button">← 返回</button></div><div id="detailContent"></div></section>`);
    }
    if (!$('#openGeminiAssistant')) {
      $('.top-actions')?.insertAdjacentHTML('beforeend', `<button class="gemini-launch" id="openGeminiAssistant" type="button" aria-haspopup="dialog" aria-controls="geminiAssistantPanel">✦ AI 小幫手</button>`);
    }
    if (!$('#geminiAssistantPanel')) {
      document.body.insertAdjacentHTML('beforeend', `<aside class="gemini-panel" id="geminiAssistantPanel" role="dialog" aria-label="習慣 AI 小幫手" hidden><header class="gemini-header"><span class="gemini-mark">✦</span><div class="gemini-heading"><strong>習慣 AI 小幫手</strong><small id="geminiStatus">正在載入 Gemini…</small></div><button class="gemini-icon-button" id="clearGeminiChat" type="button" title="清除本機對話">清除</button><button class="gemini-icon-button" id="closeGeminiAssistant" type="button" aria-label="關閉 AI 小幫手">×</button></header><div class="gemini-privacy">使用 Google Gemini 回答。每次提問與本對話前文會傳給 Gemini；勾選後才附上所選日期的習慣與待辦。若前文曾附摘要，也會一起傳送。對話存在此瀏覽器，可隨時清除。</div><div class="gemini-messages" id="geminiMessages" role="log" aria-live="polite" aria-relevant="additions text"></div><div class="gemini-quick-prompts"><button type="button" data-gemini-prompt="請根據我所選日期的習慣安排，幫我挑一個現在最容易開始的小步驟。" data-gemini-context="true">幫我開始今天</button><button type="button" data-gemini-prompt="請把我目前的目標拆成一個本週可完成的小步驟。" data-gemini-context="true">拆解一個小目標</button><button type="button" data-gemini-prompt="如果我最近進度落後，請給我一個溫和且實際的調整方式。" data-gemini-context="true">調整進度</button></div><label class="gemini-option"><input id="geminiShareContext" type="checkbox"><span>附上所選日期的習慣、待辦與完成狀態</span></label><label class="gemini-consent"><input id="geminiConsent" type="checkbox"><span>我了解提問與本對話前文會傳送給 Google Gemini</span></label><form class="gemini-form" id="geminiForm"><textarea id="geminiInput" rows="2" maxlength="1200" placeholder="問我習慣安排或目標…" aria-label="輸入問題"></textarea><button class="primary" id="geminiSend" type="submit" disabled>送出</button></form></aside>`);
      renderGeminiMessages();
    }
  }

  function assistantContext() {
    const date = app.selectedDate;
    const key = dateKey(date);
    const habits = app.habits.filter(habit => scheduledOn(habit, date)).slice(0, 40).map(habit => ({
      name: habit.name,
      time: habit.time || '',
      plannedMinutes: Number(habit.plans?.[getPeriod(habit.cycleUnit || 'week', date).key]?.plannedMinutes || habit.duration || 30),
      status: app.statusOf(habit, key) === 'done' ? '已完成' : app.statusOf(habit, key) === 'skip' ? '已跳過' : '未完成',
      goal: habit.goal?.name || undefined,
      targetHours: habit.goal?.trackHours ? Number(habit.goal.targetHours || 0) : undefined,
      completedHours: habit.goal?.trackHours ? Number(app.goalStats(habit)?.hours || 0) : undefined,
    }));
    const dayTasks = tasks.filter(task => task.dueDate === key).slice(0, 40).map(task => ({ title: task.title, status: task.done ? '已完成' : '未完成' }));
    return { date: key, habits, tasks: dayTasks };
  }

  function renderGeminiMessages() {
    const container = $('#geminiMessages');
    if (!container) return;
    const history = window.RiriGeminiAssistant?.readHistory?.() || [];
    container.replaceChildren();
    if (!history.length) {
      const welcome = document.createElement('div');
      welcome.className = 'gemini-bubble model';
      welcome.textContent = '嗨！我可以陪你拆解目標、安排習慣，或一起想想如何重新開始。';
      container.append(welcome);
    } else {
      history.slice(-40).forEach(message => {
        if (message.role !== 'user' && message.role !== 'model') return;
        const bubble = document.createElement('div');
        bubble.className = `gemini-bubble ${message.role}`;
        bubble.textContent = message.text || '';
        if (message.role === 'user' && message.hasContext) {
          const badge = document.createElement('small');
          badge.className = 'gemini-context-badge';
          badge.textContent = '已附所選日期摘要';
          bubble.append(badge);
        }
        container.append(bubble);
      });
    }
    container.scrollTop = container.scrollHeight;
  }

  function setGeminiStatus(message) {
    const label = $('#geminiStatus');
    if (label && message) label.textContent = message;
    const ready = window.RiriGeminiAssistant?.isReady === true;
    const send = $('#geminiSend');
    if (send) send.disabled = !ready || !$('#geminiConsent')?.checked;
  }

  function geminiErrorText(error) {
    const message = String(error?.message || '目前無法連線 Gemini，請稍後再試。');
    if (/PERMISSION_DENIED|403/i.test(message)) return 'Firebase AI Logic 或 App Check 尚未啟用，請確認 Firebase 專案設定。';
    if (/RESOURCE_EXHAUSTED|429|quota/i.test(message)) return 'Gemini 使用量暫時達到上限，請稍後再試。';
    if (/network|fetch|failed to fetch/i.test(message)) return '連線 Gemini 失敗，請檢查網路後再試。';
    return message.slice(0, 300);
  }

  async function sendGeminiMessage() {
    const assistant = window.RiriGeminiAssistant;
    const input = $('#geminiInput');
    const consent = $('#geminiConsent');
    const sendButton = $('#geminiSend');
    const container = $('#geminiMessages');
    const question = input?.value.trim();
    if (!question) return;
    if (!consent?.checked) { app.toast('請先確認 Gemini 對話資料的傳送說明。'); consent?.focus(); return; }
    if (!assistant || !assistant.isReady) { app.toast('Gemini 尚未完成 Firebase 設定。'); return; }

    const history = assistant.readHistory();
    const context = $('#geminiShareContext')?.checked ? assistantContext() : null;
    const userBubble = document.createElement('div');
    userBubble.className = 'gemini-bubble user';
    userBubble.textContent = question;
    if (context) {
      const badge = document.createElement('small'); badge.className = 'gemini-context-badge'; badge.textContent = '已附所選日期摘要';
      userBubble.append(badge);
    }
    const pending = document.createElement('div'); pending.className = 'gemini-bubble model pending'; pending.textContent = 'Gemini 正在思考…';
    container.append(userBubble, pending);
    container.scrollTop = container.scrollHeight;
    input.value = '';
    input.disabled = true;
    sendButton.disabled = true;
    try {
      const result = await assistant.send(question, context, history);
      history.push({ role: 'user', text: question, historyText: result.historyText, hasContext: !!context });
      history.push({ role: 'model', text: result.answer, historyText: result.answer });
      assistant.saveHistory(history);
      const answer = document.createElement('div'); answer.className = 'gemini-bubble model'; answer.textContent = result.answer;
      pending.replaceWith(answer);
    } catch (error) {
      pending.classList.add('error');
      pending.textContent = geminiErrorText(error);
    } finally {
      input.disabled = false;
      sendButton.disabled = !consent.checked || !assistant.isReady;
      input.focus();
      container.scrollTop = container.scrollHeight;
    }
  }

  function applyTheme() {
    const theme = preferences.theme || 'system';
    const useDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = useDark ? 'dark' : 'light';
  }

  function renderInspiration(forceRefresh = false) {
    const topics = preferences.topics.length ? preferences.topics : ['藝術創作'];
    const today = new Date();
    const dayIndex = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
    const topic = topics[((dayIndex % topics.length) + topics.length) % topics.length];
    const list = topicPrompts[topic];
    const feature = topicInspiration[topic] || topicInspiration['藝術創作'];
    const offset = Number(sessionStorage.getItem('riri-inspiration-offset') || 0);
    $('#inspirationTopic').textContent = topic;
    $('#inspirationText').textContent = list[(dayIndex + offset) % list.length];
    $('#inspirationSource').textContent = `每日從 ${topics.length} 個興趣主題輪替 · 今日原創靈感`;
    $('#sidebarInspirationIcon').textContent = topicIcons[topic] || '✦';
    $('#sidebarInspirationTopic').textContent = topic;
    const featuredLine = feature.lines[(dayIndex + offset + 1) % feature.lines.length];
    $('#sidebarInspirationQuote').textContent = featuredLine;
    const resourceLink = $('#sidebarInspirationLink');
    resourceLink.href = feature.link;
    resourceLink.textContent = `${feature.linkLabel} →`;
    $('#mobileInspirationQuote').textContent = featuredLine;
    const mobileResourceLink = $('#mobileInspirationLink');
    mobileResourceLink.href = feature.link;
    mobileResourceLink.textContent = `${feature.linkLabel} →`;
    const topicsKey = topics.join('|');
    const requestKey = `${dateKey(today)}:${topicsKey}:${topic}:${offset}`;
    const responseKey = `riri-ai-inspiration:${identity}:${requestKey}`;
    const cached = safeLoad(responseKey, null);
    if (!forceRefresh && cached?.text) {
      $('#inspirationText').textContent = cached.text;
      $('#inspirationSource').textContent = cached.source || 'AI 每日靈感';
      return;
    }
  }

  function renderTasks() {
    const selected = dateKey(app.selectedDate);
    const list = tasks.filter(task => task.dueDate === selected).sort((a, b) => Number(a.done) - Number(b.done));
    $('#taskCount').textContent = `${list.filter(task => task.done).length} / ${list.length} 完成`;
    $('#taskDueDate').value = selected;
    $('#taskList').innerHTML = list.length ? list.map(task => `<div class="task-row ${task.done ? 'done' : ''}"><input type="checkbox" data-task-toggle="${escapeHTML(task.id)}" ${task.done ? 'checked' : ''} aria-label="完成待辦"><span class="task-name">${escapeHTML(task.title)}</span><span class="task-type">待辦</span><button class="task-remove" type="button" data-task-remove="${escapeHTML(task.id)}" aria-label="刪除待辦">×</button></div>`).join('') : `<div class="empty-state">這天沒有待辦，先留點空間給自己。</div>`;
  }

  function renderPlannedHabitCards(habitsForDate) {
    const container = $('#habitList');
    if (!container) return;
    if (habitsForDate.length && !$('.habit', container)) container.innerHTML = '';
    const wanted = new Set(habitsForDate.map(habit => habit.id));
    $$('.habit', container).forEach(card => {
      const id = card.querySelector('[data-id]')?.dataset.id;
      if (!wanted.has(id)) card.remove();
    });
    const existing = new Set($$('.habit', container).map(card => card.querySelector('[data-id]')?.dataset.id));
    for (const habit of habitsForDate) {
      if (existing.has(habit.id)) continue;
      const state = app.statusOf(habit);
      const progress = app.goalStats(habit);
      const card = document.createElement('article');
      card.className = 'card habit';
      card.innerHTML = `<div class="habit-icon ${escapeHTML(habit.tone || '')}">${escapeHTML(habit.icon || '✨')}</div><div class="habit-main"><div class="habit-title clickable-title" role="button" tabindex="0" title="開啟習慣專屬頁面">${escapeHTML(habit.name)}</div><div class="habit-meta"><span class="time">◷ ${escapeHTML(habit.time || '')}</span><span>· ${Number(habit.duration || 30)} 分鐘</span><span class="kind-label habit">習慣</span></div>${progress ? `<div class="goal-card"><div class="goal-card-top"><span class="goal-card-name">🎯 ${escapeHTML(habit.goal?.name || '目標')}</span><span class="goal-card-percent">${progress.pct}%</span></div><div class="bar"><i style="width:${progress.pct}%"></i></div></div>` : ''}</div><div class="habit-actions"><button class="state-btn ${state === 'done' ? 'done' : state === 'skip' ? 'skip' : ''}" data-action="${state === 'open' ? 'done' : 'open'}" data-id="${escapeHTML(habit.id)}">${state === 'done' ? '✓ 已完成' : state === 'skip' ? '↷ 今天跳過' : '○ 未完成'}</button>${state === 'open' ? `<button class="state-btn" data-action="skip" data-id="${escapeHTML(habit.id)}">跳過</button>` : ''}</div><div class="habit-extra"><div class="habit-tools"><button class="tool-btn" data-action="edit" data-id="${escapeHTML(habit.id)}">✎ 編輯</button>${habit.goal ? `<button class="tool-btn" data-action="goal" data-id="${escapeHTML(habit.id)}">🎯 目標進度</button>` : ''}${habit.notesEnabled ? `<button class="tool-btn" data-action="note" data-id="${escapeHTML(habit.id)}">♡ 記一筆</button>` : ''}</div></div>`;
      container.append(card);
    }
    if (!habitsForDate.length) container.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--muted)">這天沒有安排習慣。新增一個小小練習吧。</div>';
  }

  function renderToday() {
    if (!$('#taskPanel')) return;
    applyTheme();
    const firstName = (preferences.displayName || '朋友').trim().split(/\s+/)[0] || '朋友';
    const greeting = app.selectedDate.toDateString() === app.today.toDateString()
      ? `${app.today.getHours() < 12 ? '早安' : app.today.getHours() < 18 ? '午安' : '晚安'}，${firstName}。`
      : `${app.selectedDate.getMonth() + 1} 月 ${app.selectedDate.getDate()} 日的習慣`;
    $('#greeting').textContent = greeting;
    $$('.habit-title').forEach(title => { title.classList.add('clickable-title'); title.setAttribute('role', 'button'); title.setAttribute('tabindex', '0'); title.setAttribute('title', '開啟習慣專屬頁面'); });
    renderTasks();
    renderInspiration();
    const dayHabits = app.habits.filter(habit => scheduledOn(habit, app.selectedDate));
    const dayTasks = tasks.filter(task => task.dueDate === dateKey(app.selectedDate));
    renderPlannedHabitCards(dayHabits);
    const done = dayHabits.filter(habit => app.statusOf(habit) === 'done').length + dayTasks.filter(task => task.done).length;
    const total = dayHabits.length + dayTasks.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    $('#progressPercent').textContent = `${pct}%`;
    $('#progressRing').style.background = `conic-gradient(var(--green) ${pct * 3.6}deg,#edf0e9 0deg)`;
    $('#doneCount').textContent = done;
    $('#leftCount').textContent = Math.max(0, total - done);
    $('#progressText').textContent = total ? (done === total ? '今天的安排都完成了！' : done ? `已完成 ${done} 個小目標` : '開始今天的小小練習') : '今天留了一點空白';
    $('#progressSub').textContent = `${dayHabits.length} 個習慣 · ${dayTasks.length} 件待辦`;
    $('#habitCountLabel').textContent = `${dayHabits.length} 個習慣 · ${dayHabits.filter(habit => app.statusOf(habit) === 'done').length} 個完成`;
    const next = dayHabits.find(habit => app.statusOf(habit) === 'open');
    $('#nextHabit').innerHTML = next ? `<div class="next-item"><span class="next-time">${escapeHTML(next.time || '')}</span><span class="next-icon">${escapeHTML(next.icon || '✨')}</span><div><div class="next-name">${escapeHTML(next.name)}</div><div class="next-sub">${Number(next.duration || 30)} 分鐘的小練習</div></div></div>` : '<div class="empty-state">今日安排都完成了 ✨</div>';
  }

  function toolbar(active, modeKey, onChange, rangeText) {
    const custom = modeKey === 'review' ? `<button type="button" class="${active === 'custom' ? 'active' : ''}" data-mode="custom" data-mode-key="review">自訂區間</button>` : '';
    return `<div class="view-toolbar"><div class="segmented"><button type="button" class="${active === 'week' ? 'active' : ''}" data-mode="week" data-mode-key="${modeKey}">週</button><button type="button" class="${active === 'month' ? 'active' : ''}" data-mode="month" data-mode-key="${modeKey}">月</button>${custom}</div><button class="quiet-btn" type="button" data-step="-1" data-mode-key="${modeKey}">‹</button><button class="quiet-btn" type="button" data-step="1" data-mode-key="${modeKey}">›</button><button class="quiet-btn" type="button" data-today="true" data-mode-key="${modeKey}">今天</button><span class="range-label">${escapeHTML(rangeText)}</span></div>`;
  }

  function renderWeekBoard() {
    const range = getPeriod('week', calendarCursor);
    const days = datesInPeriod(range);
    const cols = days.map(date => {
      const facts = dateFacts(date);
      const habitEvents = facts.scheduled.map(habit => `<button class="event-chip habit ${app.statusOf(habit, facts.key) === 'done' ? 'done' : ''}" type="button" data-open-habit="${escapeHTML(habit.id)}"><strong>${escapeHTML(habit.time || '')} · 習慣</strong>${escapeHTML(habit.icon)} ${escapeHTML(habit.name)}</button>`).join('');
      const taskEvents = facts.dueTasks.map(task => `<div class="event-chip task"><strong>待辦</strong><label><input type="checkbox" data-task-toggle="${escapeHTML(task.id)}" ${task.done ? 'checked' : ''}> ${escapeHTML(task.title)}</label></div>`).join('');
      return `<div class="week-day"><div class="week-day-head ${dateKey(date) === dateKey(app.today) ? 'today' : ''}">${weekdayNames[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}${dateKey(date) === dateKey(app.today) ? ' · 今天' : ''}</div>${habitEvents}${taskEvents || '<small class="muted">—</small>'}</div>`;
    }).join('');
    const label = `${range.start.getFullYear()}年${range.start.getMonth() + 1}月${range.start.getDate()}日–${range.end.getMonth() + 1}月${range.end.getDate()}日`;
    return `${toolbar('week', 'calendar', null, label)}<div class="calendar-legend"><span><i class="legend-dot"></i>習慣</span><span><i class="legend-dot task-dot"></i>待辦</span><span class="month">點習慣可開啟追蹤</span></div><div class="week-board">${cols}</div>`;
  }

  function renderMonthBoard() {
    const first = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1, 12);
    const rangeStart = addDays(first, -((first.getDay() + 6) % 7));
    const cells = Array.from({ length: 42 }, (_, index) => {
      const date = addDays(rangeStart, index);
      const facts = dateFacts(date);
      const pct = facts.total ? Math.round(facts.done / facts.total * 100) : 0;
      const outside = date.getMonth() !== first.getMonth();
      return `<button class="month-cell ${outside ? 'outside' : ''} ${dateKey(date) === dateKey(app.today) ? 'today' : ''} ${dateKey(date) === dateKey(app.selectedDate) ? 'selected' : ''}" type="button" data-select-date="${dateKey(date)}"><b>${date.getDate()}</b><small>${facts.total ? `${pct}% 完成` : '無安排'}${facts.taskCount ? ` · ${facts.taskCount} 待辦` : ''}</small><i><span style="width:${pct}%"></span></i></button>`;
    }).join('');
    return `${toolbar('month', 'calendar', null, `${first.getFullYear()}年${first.getMonth() + 1}月`)}<div class="month-board">${weekdayNames.map((name, index) => `<div class="month-weekday">${weekdayNames[(index + 1) % 7]}</div>`).join('')}${cells}</div>`;
  }

  function renderReview() {
    const todayKey = dateKey(app.today);
    let period;
    if (reviewMode === 'custom') {
      if (!reviewRange) reviewRange = { start: dateKey(addDays(app.today, -29)), end: todayKey };
      let start = fromKey(reviewRange.start);
      let end = fromKey(reviewRange.end);
      if (reviewRange.start > reviewRange.end) { [start, end] = [end, start]; }
      if (dateKey(end) > todayKey) end = fromKey(todayKey);
      period = { start, end };
    } else period = reviewMode === 'month' ? getPeriod('month', calendarCursor) : getPeriod('week', calendarCursor);
    const dates = datesInPeriod(period).filter(date => dateKey(date) <= todayKey);
    const rows = dates.map(dateFacts);
    const done = rows.reduce((sum, row) => sum + row.done, 0);
    const skipped = rows.reduce((sum, row) => sum + row.skipped, 0);
    const unfinished = rows.reduce((sum, row) => sum + row.open, 0);
    const total = done + skipped + unfinished;
    const donePct = total ? done / total * 100 : 0;
    const skippedPct = total ? skipped / total * 100 : 0;
    const donut = `conic-gradient(var(--green) 0 ${donePct}%, #d6a55c ${donePct}% ${donePct + skippedPct}%, #d7ddd5 ${donePct + skippedPct}% 100%)`;
    const label = reviewMode === 'month' ? `${period.start.getFullYear()}年${period.start.getMonth() + 1}月` : `${period.start.getMonth() + 1}/${period.start.getDate()}–${period.end.getMonth() + 1}/${period.end.getDate()}`;
    const dailyRows = rows.slice().reverse().map(row => `<div class="daily-review-row"><span>${row.date.getMonth() + 1}/${row.date.getDate()}（${weekdayNames[row.date.getDay()]}）</span><div class="daily-review-bar"><i style="width:${row.total ? row.done / row.total * 100 : 0}%"></i></div><b>${row.total ? Math.round(row.done / row.total * 100) : 0}%</b></div>`).join('');
    const rangeControls = reviewMode === 'custom' ? `<div class="review-range"><label>開始日期<input id="reviewStart" type="date" value="${dateKey(period.start)}" max="${todayKey}"></label><span>至</span><label>結束日期<input id="reviewEnd" type="date" value="${dateKey(period.end)}" max="${todayKey}"></label></div>` : '';
    const weekdayTotals = Array.from({ length: 7 }, (_, day) => {
      const group = rows.filter(row => row.date.getDay() === day);
      const groupTotal = group.reduce((sum, row) => sum + row.total, 0);
      const groupDone = group.reduce((sum, row) => sum + row.done, 0);
      return { day, count: group.length, total: groupTotal, done: groupDone, pct: groupTotal ? Math.round(groupDone / groupTotal * 100) : 0 };
    }).filter(group => group.total);
    const weekdayRows = weekdayTotals.map(group => `<div class="weekday-review-row"><span>${weekdayNames[group.day]}曜日 <small>${group.count} 天 · ${group.total} 項</small></span><div class="daily-review-bar"><i style="width:${group.pct}%"></i></div><b>${group.pct}%</b></div>`).join('');
    return `${toolbar(reviewMode, 'review', null, label)}${rangeControls}<div class="review-overview"><div class="donut" style="background:${donut}"><div class="donut-center"><b>${total ? Math.round(done / total * 100) : 0}%</b><span>完成率</span></div></div><div class="legend-list"><div class="legend-row"><i class="legend-swatch" style="background:var(--green)"></i>已完成 <b>${done}</b></div><div class="legend-row"><i class="legend-swatch" style="background:#d6a55c"></i>跳過 <b>${skipped}</b></div><div class="legend-row"><i class="legend-swatch" style="background:#d7ddd5"></i>未完成 <b>${unfinished}</b></div><small class="muted">統計截至今天；未來排程不計入未完成率。</small></div></div><h3 class="section-label">星期表現</h3><div class="weekday-review">${weekdayRows || '<div class="empty-state">所選期間還沒有排程紀錄。</div>'}</div><h3 class="section-label">每日完成率</h3>${dailyRows || '<div class="empty-state">這段期間還沒有排程紀錄。</div>'}`;
  }

  function renderSettings() {
    const option = (value, label, selected) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`;
    const selectedTopics = new Set(preferences.topics);
    const topicChoices = Object.keys(topicPrompts).map(topic => `<label class="interest-chip"><input type="checkbox" data-interest-topic="${escapeHTML(topic)}" ${selectedTopics.has(topic) ? 'checked' : ''}><span class="interest-icon">${topicIcons[topic]}</span><span>${escapeHTML(topic)}</span></label>`).join('');
    return `<div class="settings-section"><h3>外觀與個人化</h3><label class="setting-row"><span>顯示模式<small>選擇日間、夜間或跟隨裝置設定</small></span><select class="setting-select" id="themeSetting">${option('system', '跟隨系統', preferences.theme)}${option('light', '日間模式', preferences.theme)}${option('dark', '夜間模式', preferences.theme)}</select></label><label class="setting-row"><span>首頁稱呼<small>用你喜歡的名字問候你</small></span><input id="displayNameSetting" class="setting-input" maxlength="24" value="${escapeHTML(preferences.displayName || '')}"></label></div><section class="settings-section inspiration-preferences" id="inspirationPreferences" aria-labelledby="inspirationPreferencesTitle"><h3 id="inspirationPreferencesTitle">每日靈感主題</h3><p class="settings-lead">選擇你感興趣的方向，首頁小練習與側欄靈感卡會同步更新主題句子和免費延伸資源。</p><div class="interest-grid">${topicChoices}</div><p class="interest-selection-count" id="interestSelectionCount" aria-live="polite">目前選取 ${preferences.topics.length} 個主題，至少保留一個。</p><small class="form-hint">內容為原創主題提示並連結免費資源，不會擷取 Reddit、X、Pinterest 或小紅書的貼文。</small></section><div class="settings-section"><h3>提醒</h3><label class="setting-row"><span>瀏覽器通知<small>在目前裝置顯示提醒；需要瀏覽器允許通知</small></span><button class="state-btn" id="settingsNotify">${'Notification' in window && Notification.permission === 'granted' ? '已允許' : '設定通知'}</button></label></div><div class="settings-section"><h3>資料與服務</h3><p class="free-tier-note">習慣、計畫與筆記保存在此瀏覽器，不需要另外設定 API 網址或付費伺服器。AI 計畫會使用現有 Gemini 服務；若暫時無法連線，仍可使用本機免費時數估算。</p><p class="free-tier-note">Google 日曆與 Notion 需要額外的安全整合伺服器，因此目前不會顯示在免費版介面中。</p></div>`;
  }

  function renderHabitIndex() {
    if (!app.habits.length) return '<div class="empty-state">還沒有習慣。新增第一個習慣後，這裡會整理所有追蹤項目。</div>';
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const rows = app.habits.map(habit => {
      const stats = app.goalStats(habit);
      const days = [...(habit.days || [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(day => `週${dayNames[day]}`).join('、') || '未設定';
      return `<button class="habit-index-row" type="button" data-open-habit="${escapeHTML(habit.id)}"><span class="habit-index-icon">${escapeHTML(habit.icon || '✨')}</span><span class="habit-index-main"><b>${escapeHTML(habit.name)}</b><small>${escapeHTML(habit.time || '未設定時間')} · ${escapeHTML(days)}</small></span><span class="habit-index-goal"><small>目標</small><b>${escapeHTML(habit.goal?.name || '尚未設定')}</b></span><span class="habit-index-progress"><b>${stats ? `${stats.pct}%` : '—'}</b><small>${stats ? '目標進度' : '尚無目標'}</small></span><span class="habit-index-arrow">查看追蹤 →</span></button>`;
    }).join('');
    return `<div class="habit-index-intro">共 ${app.habits.length} 個習慣。選取任一項目，可查看週期計畫、目標、完成紀錄、執行方式與相關資源。</div><div class="habit-index-table">${rows}</div>`;
  }

  function renderAlternate() {
    const view = $('.nav button.active')?.dataset.view || 'today';
    if (!$('#alternateView') || !$('#altContent')) return;
    $('#todayView').style.display = view === 'today' ? '' : 'none';
    $('#alternateView').style.display = view === 'today' ? 'none' : '';
    $('#habitDetailView').classList.remove('active');
    const details = {
      habits: ['習慣總表', '集中檢視每個習慣的週期、目標與累積進度。', '所有習慣'],
      calendar: ['行事曆', '依週或月查看習慣與待辦安排。', '週期安排'],
      review: ['成效回顧', '看見已完成、跳過與未完成的比例。', '完成率統計'],
      settings: ['偏好設定', '依照你的生活方式調整日日。', '外觀、提醒與整合']
    };
    const [title, description, panel] = details[view] || details.calendar;
    $('#altTitle').textContent = title;
    $('#crumbName').textContent = title;
    $('#altDescription').textContent = description;
    $('#altPanelTitle').textContent = panel;
    $('#altAdd').style.display = view === 'settings' ? 'none' : '';
    if (view === 'habits') $('#altContent').innerHTML = renderHabitIndex();
    else if (view === 'calendar') $('#altContent').innerHTML = calendarMode === 'week' ? renderWeekBoard() : renderMonthBoard();
    else if (view === 'review') $('#altContent').innerHTML = renderReview();
    else if (view === 'settings') $('#altContent').innerHTML = renderSettings();
  }

  function updatePlanEstimate(habit, selectedCount) {
    const sessionsPerPeriod = Math.max(1, habit.days?.length || 1) * (habit.cycleUnit === 'month' ? 4.35 : 1);
    const currentGoal = habit.goal ? app.goalStats(habit) : null;
    const goalWorkload = habit.goal?.trackHours
      ? Number(habit.goal.targetHours || 0)
      : Number(habit.goal?.estimatedTargetHours || 0);
    const hasGoalWorkload = goalWorkload > 0;
    const remaining = hasGoalWorkload
      ? Math.max(0, goalWorkload - (habit.goal?.trackHours ? (currentGoal?.hours || 0) : 0))
      : null;
    const period = getPeriod(habit.cycleUnit || 'week', app.today);
    const deadline = habit.goal?.date ? fromKey(habit.goal.date) : null;
    const interval = habit.cycleUnit === 'month' ? 30.44 : 7;
    const periodsLeft = deadline ? Math.max(1, Math.ceil((deadline - period.start) / (interval * 86400000))) : (habit.cycleUnit === 'month' ? 3 : 12);
    const routineHours = Math.max(0.25, Number(habit.duration || 30) * sessionsPerPeriod / 60);
    const weeklyAvailableHours = Number(habit.periodTargetHours) || null;
    const availableHours = weeklyAvailableHours === null ? null : weeklyAvailableHours * (habit.cycleUnit === 'month' ? 4.35 : 1);
    const suggestedHours = remaining === null
      ? (availableHours || routineHours)
      : Math.round(remaining / periodsLeft * 100) / 100;
    const capacityHours = availableHours;
    const feasible = capacityHours === null || suggestedHours <= capacityHours;
    const suggestedSessionMinutes = selectedCount ? Math.round(suggestedHours * 60 / selectedCount) : 0;
    return { targetHours: hasGoalWorkload ? goalWorkload : routineHours, suggestedHours, suggestedSessionMinutes, remaining, periodsLeft, capacityHours, feasible, hasGoalWorkload };
  }

  function openDetail(id) {
    const habit = app.habits.find(item => item.id === id);
    if (!habit) return;
    detailHabitId = id;
      pendingPlanDates = null;
    detailSuggestion = null;
    pendingPlanHours = null;
    pendingPlanMilestones = null;
    detailPreviousView = $('.nav button.active')?.dataset.view || 'today';
    $('#todayView').style.display = 'none';
    $('#alternateView').style.display = 'none';
    $('#habitDetailView').classList.add('active');
    $$('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === detailPreviousView));
    $('#detailHeading').textContent = `${habit.icon || '✨'} ${habit.name}`;
    $('#crumbName').textContent = habit.name;
    renderDetail();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showView(view) {
    $$('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === view));
    $('#habitDetailView').classList.remove('active');
    $('#todayView').style.display = view === 'today' ? '' : 'none';
    $('#alternateView').style.display = view === 'today' ? 'none' : '';
    app.render();
    if (view === 'review') $('#altContent').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function openInspirationSettings() {
    showView('settings');
    const section = $('#inspirationPreferences');
    if (!section) { app.toast('偏好設定載入中，請再試一次。'); return; }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('[data-interest-topic]', section)?.focus({ preventScroll: true });
    app.toast('已開啟每日靈感主題設定。');
  }

  async function requestAiPlan() {
    const habit = app.habits.find(item => item.id === detailHabitId);
    if (!habit) return;
    if (!pendingPlanDates.length) { app.toast('先選擇本期執行日期，再產生計畫。'); return; }
    const estimate = updatePlanEstimate(habit, pendingPlanDates.length);
    const goal = habit.goal || {};
    const goalScope = [goal.name || habit.name, ...(goal.milestones || []).map(item => item.text)].filter(Boolean).join('\n');
    const unitName = habit.cycleUnit === 'month' ? '月' : '週';
    const explanation = estimate.remaining === null
      ? `依每期可投入時數與習慣頻率，先安排每${unitName} ${estimate.suggestedHours.toFixed(1)} 小時。`
      : `剩餘 ${estimate.remaining.toFixed(1)} 小時，分配到 ${estimate.periodsLeft} 個${unitName}期，建議每${unitName}投入 ${estimate.suggestedHours.toFixed(1)} 小時。`;
    detailSuggestion = { ...estimate, explanation, milestones: [], source: '本機免費估算' };
    if (!$('#planAiConsent')?.checked) {
      renderDetail();
      app.toast(estimate.hasGoalWorkload
        ? '本機時數已估算；若要 Gemini 拆解或微調計畫，請先勾選資料使用同意。'
        : '請先勾選資料使用同意，Gemini 才能依目標與子目標估算總時數。');
      return;
    }
    const assistant = window.RiriGeminiAssistant;
    if (!assistant?.isReady || typeof assistant.suggestPlan !== 'function') {
      renderDetail();
      app.toast(estimate.hasGoalWorkload
        ? 'Gemini 目前無法連線；你仍可手動安排本期時數與日期。'
        : 'Gemini 目前尚未就緒；習慣已可儲存，子目標總時數需要 Gemini 估算後才能排程。');
      return;
    }
    const button = $('#requestAiPlan');
    if (button) { button.disabled = true; button.textContent = '正在整理…'; }
    try {
      const result = await assistant.suggestPlan({
        goalName: habit.goal?.name || habit.name,
        totalTargetHours: habit.goal?.trackHours ? Number(habit.goal.targetHours || 0) : null,
        goalScope,
        completedHours: habit.goal?.trackHours ? Math.max(0, Number(app.goalStats(habit)?.hours || 0)) : 0,
        periodUnit: unitName,
        periodsLeft: estimate.periodsLeft,
        sessionsPerPeriod: pendingPlanDates.length,
        weeklyAvailableHours: habit.periodTargetHours || null,
        sessionsPerWeek: habit.days?.length || 0,
        sessionMinutes: estimate.suggestedSessionMinutes,
        deadline: habit.goal?.date || '',
      });
      const remainingHours = Math.max(0, result.totalTargetHours - (habit.goal?.trackHours ? Number(app.goalStats(habit)?.hours || 0) : 0));
      const weeklyBudget = Number(habit.periodTargetHours) || 0;
      const periodBudget = weeklyBudget * (habit.cycleUnit === 'month' ? 4.35 : 1);
      const suggestedHours = remainingHours > 0
        ? Math.min(remainingHours, Math.round((!habit.goal?.date && periodBudget > 0 ? periodBudget : remainingHours / estimate.periodsLeft) * 100) / 100)
        : 0;
      const minimumHours = suggestedHours > 0 ? Math.max(0.25, suggestedHours * 0.5) : 0;
      const maximumHours = Math.min(remainingHours || result.totalTargetHours, Math.max(suggestedHours, suggestedHours * 1.5, minimumHours));
      const withinRange = result.hoursPerPeriod >= minimumHours && result.hoursPerPeriod <= maximumHours;
      detailSuggestion.targetHours = result.totalTargetHours;
      detailSuggestion.sessionsPerWeek = result.sessionsPerWeek;
      detailSuggestion.estimatedWeeks = result.estimatedWeeks;
      detailSuggestion.suggestedHours = withinRange ? Math.round(result.hoursPerPeriod * 100) / 100 : suggestedHours;
      detailSuggestion.suggestedSessionMinutes = Math.round(detailSuggestion.suggestedHours * 60 / pendingPlanDates.length);
      detailSuggestion.remaining = remainingHours;
      detailSuggestion.hasGoalWorkload = true;
      detailSuggestion.feasible = estimate.capacityHours === null || detailSuggestion.suggestedHours <= estimate.capacityHours;
      pendingPlanHours = detailSuggestion.suggestedHours;
      pendingPlanMilestones = result.milestones.join('\n');
      detailSuggestion.milestones = result.milestones;
      detailSuggestion.explanation = `Gemini 預估總工作量 ${result.totalTargetHours.toFixed(1)} 小時；建議每${unitName}投入 ${detailSuggestion.suggestedHours.toFixed(1)} 小時、每週 ${result.sessionsPerWeek.toFixed(1)} 次，約 ${result.estimatedWeeks.toFixed(1)} 週完成${result.reason ? `。${result.reason}` : ''}${withinRange ? '' : '（每期時數依期限與剩餘工作量重新計算）'}`;
      detailSuggestion.source = 'Gemini 目標時數估算＋本機排程驗算';
      app.toast('計畫建議已更新，可檢視並調整後儲存。');
    } catch (error) {
      detailSuggestion.source = 'Gemini 暫時無法使用，保留本機免費估算';
      app.toast(error?.message || 'Gemini 暫時無法使用，免費估算已保留。');
    }
    renderDetail();
  }

  function renderDetail() {
    const habit = app.habits.find(item => item.id === detailHabitId);
    if (!habit) return;
    const period = getPeriod(habit.cycleUnit || 'week', app.today);
    const persisted = habit.plans?.[period.key];
    const dates = datesInPeriod(period);
    if (pendingPlanDates === null) pendingPlanDates = persisted?.dates || dates.filter(date => (habit.days || []).includes(date.getDay())).map(dateKey);
    const estimate = updatePlanEstimate(habit, pendingPlanDates.length);
    const stats = app.goalStats(habit) || { pct: 0, hours: 0 };
    const goal = habit.goal || {};
    const suggestedTotal = detailSuggestion?.targetHours ?? goal.estimatedTargetHours ?? null;
    const totalHours = goal.trackHours ? Number(goal.targetHours || 0) : (Number(suggestedTotal) || null);
    const remainingHours = totalHours === null ? null : Math.max(0, totalHours - (goal.trackHours ? stats.hours : 0));
    const historyKeys = [...new Set([...Object.keys(habit.states || {}), ...Object.keys(habit.notes || {}), ...Object.keys(goal.logs || {})])].sort((a, b) => b.localeCompare(a)).slice(0, 14);
    const statusLabels = { done: '✓ 完成', skip: '↷ 跳過' };
    const historyRows = historyKeys.map(key => {
      const state = habit.states?.[key]; const note = habit.notes?.[key] || {}; const log = goal.logs?.[key] || {};
      return `<div class="goal-log"><span>${escapeHTML(key)} · ${escapeHTML(statusLabels[state] || '小記')}</span><span>${escapeHTML(note.mood || '')}${Number(log.minutes) ? ` ${Number(log.minutes)} 分鐘` : ''} ${escapeHTML(note.text || log.note || '')}</span></div>`;
    }).join('');
    const tracking = habit.tracking || {};
    const resourceRows = (tracking.resources || []).map(value => {
      let href = '';
      try { const url = new URL(value); if (['https:', 'http:'].includes(url.protocol)) href = url.href; } catch { /* Keep non-URL resource notes as plain text. */ }
      return `<li>${href ? `<a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(value)}</a>` : escapeHTML(value)}</li>`;
    }).join('');
    const trackingRows = (tracking.logs || []).map(log => `<div class="goal-log"><span>${escapeHTML(log.date || '')}</span><span>${escapeHTML(log.text || '')}</span></div>`).join('');
    const unitName = period.unit === 'month' ? '本月' : '本週';
    const savedHours = Number(persisted?.targetHours);
    const planHours = detailSuggestion?.suggestedHours ?? pendingPlanHours ?? (Number.isFinite(savedHours) ? savedHours : estimate.suggestedHours);
    const planMilestones = detailSuggestion?.milestones?.length ? detailSuggestion.milestones : (persisted?.milestones || []);
    const milestoneDraft = pendingPlanMilestones ?? planMilestones.join('\n');
    const selectedDateButtons = dates.map(date => {
      const key = dateKey(date);
      const selected = pendingPlanDates.includes(key);
      const completed = app.statusOf(habit, key) === 'done';
      return `<button class="period-date" type="button" data-plan-date="${key}" aria-pressed="${selected}" aria-label="${date.getMonth() + 1} 月 ${date.getDate()} 日，週${weekdayNames[date.getDay()]}${selected ? '，已排程' : '，未排程'}"><span>${date.getMonth() + 1}/${date.getDate()}</span><small>週${weekdayNames[date.getDay()]}${completed ? ' · ✓ 已完成' : ''}</small></button>`;
    }).join('');
    const plannerHint = detailSuggestion?.explanation || (remainingHours !== null
      ? `尚需 ${remainingHours.toFixed(1)} 小時，依 ${estimate.periodsLeft} 個${period.unit === 'month' ? '月' : '週'}期平均分配。${goal.date ? ` 目標期限 ${goal.date}。` : ' 未設定期限時先以 12 週／3 個月規劃。'}`
      : goal.trackMilestones
        ? '此目標以子目標追蹤。勾選同意後，Gemini 會參考目標名稱與子目標估算總工作時數，再依期限、每週可投入時數與執行頻率安排。'
        : `依習慣頻率估算每期 ${estimate.suggestedHours.toFixed(1)} 小時。`);
    const capacityHint = estimate.capacityHours !== null && planHours > estimate.capacityHours
      ? `目前每期上限為 ${estimate.capacityHours.toFixed(1)} 小時，低於目標進度所需時數；可調整期限或投入上限。`
      : '你可以編輯本期時數與日期；按「儲存本期計畫」後才會套用。';
    $('#detailContent').innerHTML = `
      <section class="card detail-hero goal-overview">
        <div class="goal-overview-main">
          <span class="eyebrow">大目標 · ${goal.date ? `期限 ${escapeHTML(goal.date)}` : '尚未設定期限'}</span>
          <h2 class="goal-overview-title">${escapeHTML(goal.name || habit.name)}</h2>
          <p class="detail-subtitle">${escapeHTML(habit.icon || '✨')} ${escapeHTML(habit.name)} · ${period.unit === 'month' ? '每月' : '每週'}執行 · ${pendingPlanDates.length} 個本期日期</p>
          <div class="goal-metrics">
            <div><small>${goal.trackHours ? '目標時數' : '預估工作量'}</small><b>${goal.trackHours ? `${totalHours.toFixed(1)} 小時` : totalHours !== null ? `AI 預估 ${totalHours.toFixed(1)} 小時` : '待 AI 推算'}</b></div>
            <div><small>${goal.trackHours ? '已累積' : '目標進度'}</small><b>${goal.trackHours ? `${stats.hours.toFixed(1)} 小時` : `${stats.pct}%`}</b></div>
            <div><small>尚需投入</small><b>${remainingHours !== null ? `${remainingHours.toFixed(1)} 小時` : '待推算'}</b></div>
          </div>
        </div>
        <div class="detail-progress"><b>${stats.pct}%</b><div class="goal-sub">整體目標進度</div><div class="progress-line"><i style="width:${stats.pct}%"></i></div></div>
      </section>
      <div class="detail-grid plan-layout">
        <section class="card detail-card planner-card">
          <div class="planner-heading"><div><span class="eyebrow">${unitName}小計畫</span><h3>安排執行日期與時間</h3></div><span class="planner-period">${period.start.getMonth() + 1}/${period.start.getDate()}–${period.end.getMonth() + 1}/${period.end.getDate()}</span></div>
          <p class="goal-sub">點選要執行的日期；每次時數會依所選日期均分。</p>
          <div class="period-picker ${period.unit}">${selectedDateButtons || '<div class="empty-state">本期沒有可安排日期。</div>'}</div>
          <p class="plan-estimate-explanation">${escapeHTML(plannerHint)}</p>
          <div class="plan-draft">
            <label for="planHoursDraft">${unitName}建議投入時數</label>
            <div class="plan-hours-control"><input id="planHoursDraft" type="number" min="0" max="10000" step="0.25" value="${Math.max(0, Number(planHours) || 0).toFixed(1)}"><span>小時</span></div>
            <p class="goal-sub" id="planSessionMinutes">${pendingPlanDates.length ? `每次約 ${Math.round((Number(planHours) || 0) * 60 / pendingPlanDates.length)} 分鐘` : '請至少選擇一個執行日期'}</p>
            <p class="plan-capacity-note" id="planCapacityNote">${escapeHTML(capacityHint)}</p>
          </div>
          <small class="plan-estimate-source">${escapeHTML(detailSuggestion?.source || '本機免費估算')}</small>
          <div class="plan-ai-draft">
            <label class="plan-consent"><input id="planAiConsent" type="checkbox"><span>我同意將目標名稱、子目標、時數、期限與執行頻率傳送給 Gemini；不會傳送筆記。</span></label>
            <small class="muted">本機免費估算會先顯示。Gemini 只用來建議時數與分段步驟，受現有免費額度限制；無法連線時不影響手動排程。</small>
            <button class="quiet-btn" id="requestAiPlan" type="button">✦ 產生 AI 計畫草案</button>
          </div>
          <div class="plan-draft-result"><h4>分段小計畫（可編輯）</h4><textarea id="planMilestoneDraft" rows="3" maxlength="600" aria-label="分段小計畫，每行一步" placeholder="可先留白，或每行寫下一個步驟。">${escapeHTML(milestoneDraft)}</textarea><small class="muted">AI 草案可以直接修改；每行會作為一個小步驟儲存。</small></div>
          <div class="planner-footer"><small>資料會自動保存在此瀏覽器；不會同步到其他裝置。</small><button class="primary" id="savePeriodPlan" type="button">確認並儲存本期計畫</button></div>
        </section>
        <section class="card detail-card recent-progress-card">
          <h3>最近紀錄</h3>
          <div class="goal-history">${historyRows || '<div class="goal-sub">完成打卡或新增過程紀錄後，會顯示在這裡。</div>'}</div>
          ${goal.trackMilestones ? `<h3 class="milestone-heading">大目標里程碑</h3><div class="milestone-list">${(goal.milestones || []).map(item => `<div class="milestone-item">${item.done ? '✓' : '○'} ${escapeHTML(item.text)}</div>`).join('')}</div>` : ''}
          <button class="tool-btn" id="editDetailHabit" type="button">編輯目標與頻率</button>
        </section>
      </div>
      <section class="card detail-card goal-notebook"><h3>目標筆記</h3><p class="goal-sub">自由書寫心得、疑問或想法；內容只儲存在目前瀏覽器。</p><textarea id="goalNotebook" rows="7" maxlength="10000" placeholder="從任何一句話開始，不需要整理格式。">${escapeHTML(tracking.goalNotes || '')}</textarea><small class="notebook-save-state" id="goalNotebookSaveState">自動儲存在此瀏覽器</small></section>
      <div class="detail-grid tracking-sections">
        <section class="card detail-card tracking-profile"><h3>執行方法</h3><p class="goal-sub">記下你的流程、卡住的地方或調整方式。</p><textarea id="habitMethod" rows="4" maxlength="2000" placeholder="例如：每天先複習單字，再做一頁文法題。">${escapeHTML(tracking.method || '')}</textarea><div class="form-footer"><button class="primary" id="saveHabitProfile" type="button">儲存執行方法</button></div></section>
        <section class="card detail-card tracking-profile"><h3>參考資源</h3><p class="goal-sub">教材、影片、文章或其他連結，每行一項。</p><textarea id="habitResources" rows="4" maxlength="2000" placeholder="貼上網址或寫下資源名稱
例如：N3 文法教材第 2 章">${escapeHTML((tracking.resources || []).join('\n'))}</textarea>${resourceRows ? `<ul class="resource-list">${resourceRows}</ul>` : ''}<div class="form-footer"><button class="primary" id="saveHabitResources" type="button">儲存參考資源</button></div></section>
      </div>
      <section class="card detail-card tracking-profile"><h3>過程紀錄</h3><p class="goal-sub">每次練習的進度與心得，會依日期保留。</p><div class="field"><label for="habitLogInput">新增一筆紀錄</label><textarea id="habitLogInput" rows="3" maxlength="1000" placeholder="例如：今天完成第一章，文法部分想再複習一次。"></textarea></div><button class="primary" id="addHabitLog" type="button">加入紀錄</button><div class="goal-history">${trackingRows || '<div class="empty-state">尚無過程紀錄。</div>'}</div></section>`;
  }

  function attachEvents() {
    $('#habitForm')?.addEventListener('invalid', event => {
      const fieldName = event.target.labels?.[0]?.textContent?.trim() || '欄位';
      app.toast(`請檢查「${fieldName}」的內容後再儲存。`);
    }, true);
    document.addEventListener('click', event => {
      if (event.target.closest('#openGeminiAssistant')) { $('#geminiAssistantPanel').hidden = false; renderGeminiMessages(); setGeminiStatus(window.RiriGeminiAssistant?.status || '正在載入 Gemini…'); $('#geminiInput')?.focus(); return; }
      if (event.target.closest('#closeGeminiAssistant')) { $('#geminiAssistantPanel').hidden = true; $('#openGeminiAssistant')?.focus(); return; }
      if (event.target.closest('#clearGeminiChat')) {
        if (window.confirm('要清除儲存在這個瀏覽器的 Gemini 對話紀錄嗎？')) { window.RiriGeminiAssistant?.clear(); renderGeminiMessages(); app.toast('本機對話紀錄已清除。'); }
        return;
      }
      const promptButton = event.target.closest('[data-gemini-prompt]');
      if (promptButton) { $('#geminiInput').value = promptButton.dataset.geminiPrompt || ''; if (promptButton.dataset.geminiContext === 'true') $('#geminiShareContext').checked = true; $('#geminiInput').focus(); return; }
      const navButton = event.target.closest('.nav button[data-view]');
      if (navButton) {
        event.preventDefault(); event.stopPropagation();
        calendarCursor = new Date(app.today);
        reviewMode = 'week';
        showView(navButton.dataset.view);
        return;
      }
      const title = event.target.closest('.habit-title');
      if (title) { const id = title.closest('.habit')?.querySelector('[data-id]')?.dataset.id; if (id) openDetail(id); return; }
      const toggle = event.target.closest('[data-task-toggle]');
      if (toggle) { const task = tasks.find(item => item.id === toggle.dataset.taskToggle); if (task) { task.done = toggle.checked; saveTasks(); app.render(); } return; }
      const remove = event.target.closest('[data-task-remove]');
      if (remove) { tasks = tasks.filter(item => item.id !== remove.dataset.taskRemove); saveTasks(); app.render(); return; }
      const dateButton = event.target.closest('[data-select-date]');
      if (dateButton) { app.selectedDate = fromKey(dateButton.dataset.selectDate); showView('today'); return; }
      const habitEvent = event.target.closest('[data-open-habit]');
      if (habitEvent) { openDetail(habitEvent.dataset.openHabit); return; }
      const step = event.target.closest('[data-step]');
      if (step) {
        const amount = Number(step.dataset.step);
        if (step.dataset.modeKey === 'review' && reviewMode === 'custom' && reviewRange) {
          const length = Math.max(1, Math.round((fromKey(reviewRange.end) - fromKey(reviewRange.start)) / 86400000) + 1);
          const nextEnd = addDays(fromKey(reviewRange.end), amount * length);
          reviewRange = dateKey(nextEnd) > dateKey(app.today)
            ? { start: dateKey(addDays(app.today, -length + 1)), end: dateKey(app.today) }
            : { start: dateKey(addDays(fromKey(reviewRange.start), amount * length)), end: dateKey(nextEnd) };
        } else {
          const mode = step.dataset.modeKey;
          const unit = mode === 'review' ? reviewMode : calendarMode;
          calendarCursor = unit === 'month' ? new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + amount, 15) : addDays(calendarCursor, amount * 7);
        }
        app.render(); return;
      }
      const modeButton = event.target.closest('[data-mode-key][data-mode]');
      if (modeButton) {
        if (modeButton.dataset.modeKey === 'review') {
          reviewMode = modeButton.dataset.mode;
          if (reviewMode === 'custom' && !reviewRange) reviewRange = { start: dateKey(addDays(app.today, -29)), end: dateKey(app.today) };
        } else calendarMode = modeButton.dataset.mode;
        app.render(); return;
      }
      if (event.target.closest('[data-today]')) {
        if (event.target.closest('[data-mode-key="review"]') && reviewMode === 'custom') reviewRange = { start: dateKey(addDays(app.today, -29)), end: dateKey(app.today) };
        else calendarCursor = new Date(app.today);
        app.render(); return;
      }
      const planDate = event.target.closest('[data-plan-date]');
      if (planDate) { pendingPlanDates = pendingPlanDates.includes(planDate.dataset.planDate) ? pendingPlanDates.filter(key => key !== planDate.dataset.planDate) : [...pendingPlanDates, planDate.dataset.planDate].sort(); detailSuggestion = null; renderDetail(); return; }
      if (event.target.closest('#savePeriodPlan')) {
        const habit = app.habits.find(item => item.id === detailHabitId); if (!habit) return;
        if (!pendingPlanDates.length) { app.toast('請至少選擇一個執行日期。'); return; }
        if (habit.goal?.trackMilestones && !habit.goal?.trackHours && !habit.goal?.estimatedTargetHours && !detailSuggestion?.targetHours) { app.toast('先產生 AI 計畫，估算子目標的總工作時數，再儲存排程。'); return; }
        const period = getPeriod(habit.cycleUnit || 'week', app.today);
        const targetHours = Number($('#planHoursDraft')?.value);
        const estimate = updatePlanEstimate(habit, pendingPlanDates.length);
        if (!Number.isFinite(targetHours) || targetHours < 0 || (estimate.remaining !== 0 && targetHours === 0)) { app.toast('請輸入大於 0 的本期時數。'); return; }
        const milestones = ($('#planMilestoneDraft')?.value || pendingPlanMilestones || '').split('\n').map(value => value.trim()).filter(Boolean).slice(0, 12);
        if (detailSuggestion?.targetHours && habit.goal && !habit.goal.trackHours) habit.goal.estimatedTargetHours = detailSuggestion.targetHours;
        habit.plans ||= {};
        habit.plans[period.key] = { dates: [...pendingPlanDates], targetHours: Math.round(targetHours * 100) / 100, plannedMinutes: Math.round(targetHours * 60 / pendingPlanDates.length), milestones };
        detailSuggestion = null;
        pendingPlanHours = null;
        pendingPlanMilestones = null;
        app.save(); renderDetail(); app.toast('本期計畫已儲存，之後可滾動調整。'); return;
      }
      if (event.target.closest('#requestAiPlan')) { requestAiPlan(); return; }
      if (event.target.closest('#detailBack')) { showView(detailPreviousView); return; }
      if (event.target.closest('#editDetailHabit')) { const habit = app.habits.find(item => item.id === detailHabitId); if (habit) { showView('today'); app.openHabit(habit.id); setTimeout(() => { $('#cycleUnit').value = habit.cycleUnit || 'week'; $('#periodTargetHours').value = habit.periodTargetHours || ''; }, 0); } return; }
      if (event.target.closest('#saveHabitProfile')) {
        const habit = app.habits.find(item => item.id === detailHabitId); if (!habit) return;
        habit.tracking ||= {};
        habit.tracking.method = $('#habitMethod').value.trim();
        app.save(); app.toast('執行方法已儲存。'); renderDetail(); return;
      }
      if (event.target.closest('#saveHabitResources')) {
        const habit = app.habits.find(item => item.id === detailHabitId); if (!habit) return;
        habit.tracking ||= {};
        habit.tracking.resources = $('#habitResources').value.split('\n').map(value => value.trim()).filter(Boolean).slice(0, 30);
        app.save(); app.toast('參考資源已儲存。'); renderDetail(); return;
      }
      if (event.target.closest('#addHabitLog')) {
        const habit = app.habits.find(item => item.id === detailHabitId); const input = $('#habitLogInput'); const text = input?.value.trim();
        if (!habit || !text) { app.toast('先寫下一段過程紀錄。'); return; }
        habit.tracking ||= {}; habit.tracking.logs ||= [];
        habit.tracking.logs.unshift({ id: `log-${Date.now()}`, date: dateKey(app.today), text });
        habit.tracking.logs = habit.tracking.logs.slice(0, 100);
        app.save(); app.toast('過程紀錄已加入。'); renderDetail(); return;
      }
      if (event.target.closest('#nextInspiration')) { sessionStorage.setItem('riri-inspiration-offset', String(Number(sessionStorage.getItem('riri-inspiration-offset') || 0) + 1)); renderInspiration(true); return; }
      if (event.target.closest('#settingsNotify')) { $('#notifyBtn')?.click(); return; }
    }, true);

    document.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('.habit-title[role="button"]')) { event.preventDefault(); event.target.click(); }
      if (event.key === 'Escape' && !$('#geminiAssistantPanel')?.hidden) { $('#geminiAssistantPanel').hidden = true; }
    });

    $('#taskForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const title = $('#taskTitle').value.trim(); if (!title) return;
      tasks.push({ id: `t${Date.now()}`, title, dueDate: $('#taskDueDate').value || dateKey(app.selectedDate), done: false, createdAt: new Date().toISOString() });
      saveTasks(); $('#taskTitle').value = ''; renderToday(); app.toast('待辦已加入。');
    });

    $('#geminiForm')?.addEventListener('submit', event => { event.preventDefault(); sendGeminiMessage(); });
    document.addEventListener('riri-gemini-ready', () => { setGeminiStatus(window.RiriGeminiAssistant?.status || 'Gemini 模組已載入'); renderGeminiMessages(); });

    document.addEventListener('change', event => {
      if (event.target.id === 'themeSetting') { preferences.theme = event.target.value; savePreferences(); applyTheme(); }
      if (event.target.matches('[data-interest-topic]')) {
        const selected = $$('[data-interest-topic]:checked').map(input => input.dataset.interestTopic);
        if (!selected.length) { event.target.checked = true; app.toast('請至少保留一個靈感主題。'); return; }
        preferences.topics = selected; savePreferences(); sessionStorage.setItem('riri-inspiration-offset', '0');
        const count = $('#interestSelectionCount');
        if (count) count.textContent = `目前選取 ${selected.length} 個主題，至少保留一個。`;
        renderInspiration(true);
      }
      if (event.target.id === 'reviewStart' || event.target.id === 'reviewEnd') {
        const start = $('#reviewStart')?.value; const end = $('#reviewEnd')?.value;
        if (start && end) {
          reviewRange = start <= end ? { start, end } : event.target.id === 'reviewStart' ? { start, end: start } : { start: end, end };
          reviewMode = 'custom'; app.render();
        }
      }
      if (event.target.id === 'displayNameSetting') { preferences.displayName = event.target.value.trim() || '朋友'; savePreferences(); renderToday(); }
      if (event.target.id === 'geminiConsent') setGeminiStatus(window.RiriGeminiAssistant?.status || '正在載入 Gemini…');
      if (event.target.id === 'geminiShareContext') { /* The context is collected only when the user sends a message. */ }
    });

    document.addEventListener('input', event => {
      if (event.target.id === 'planHoursDraft') {
        const hours = Math.max(0, Number(event.target.value) || 0);
        pendingPlanHours = hours;
        const sessions = pendingPlanDates?.length || 0;
        const label = $('#planSessionMinutes');
        if (label) label.textContent = sessions ? `每次約 ${Math.round(hours * 60 / sessions)} 分鐘` : '請至少選擇一個執行日期';
        const habit = app.habits.find(item => item.id === detailHabitId);
        const capacity = Number(habit?.periodTargetHours) || 0;
        const note = $('#planCapacityNote');
        if (note) note.textContent = capacity > 0 && hours > capacity
          ? `目前每期上限為 ${capacity.toFixed(1)} 小時，低於草案時數；可調整上限或期限。`
          : '你可以編輯本期時數與日期；按「確認並儲存」後才會套用。';
        return;
      }
      if (event.target.id === 'planMilestoneDraft') {
        pendingPlanMilestones = event.target.value;
        return;
      }
      if (event.target.id !== 'goalNotebook') return;
      const habit = app.habits.find(item => item.id === detailHabitId);
      if (!habit) return;
      habit.tracking ||= {};
      habit.tracking.goalNotes = event.target.value;
      app.save();
      const state = $('#goalNotebookSaveState');
      if (state) state.textContent = '已自動儲存在此瀏覽器';
    });

    document.addEventListener('click', event => {
      const button = event.target.closest('#addBtn,#altAdd');
      const edit = event.target.closest('#habitList [data-action="edit"]');
      if (!button && !edit) return;
      pendingHabitEdit = edit?.dataset.id || null;
      setTimeout(() => {
        const habit = pendingHabitEdit ? app.habits.find(item => item.id === pendingHabitEdit) : null;
        if ($('#cycleUnit')) $('#cycleUnit').value = habit?.cycleUnit || 'week';
        if ($('#periodTargetHours')) $('#periodTargetHours').value = habit?.periodTargetHours || '';
      }, 0);
    }, true);

    document.addEventListener('submit', event => {
      if (event.target.id !== 'habitForm') return;
      const previousId = app.editingId;
      const cycleUnit = $('#cycleUnit')?.value || 'week';
      const periodTargetHours = Number($('#periodTargetHours')?.value) || null;
      setTimeout(() => {
        if ($('#habitModal')?.classList.contains('open')) return;
        const habit = previousId ? app.habits.find(item => item.id === previousId) : app.habits.at(-1);
        if (!habit) return;
        habit.cycleUnit = cycleUnit;
        habit.periodTargetHours = periodTargetHours;
        app.save(); app.render();
      }, 0);
    }, true);

  }

  function initialize() {
    if (initialized || !window.RiriApp) return;
    initialized = true;
    addInterface();
    const formIconFields = $$('[id="habitIcon"]');
    if (formIconFields.length > 1) formIconFields[1].closest('.field')?.remove();
    applyTheme();
    attachEvents();
    $('#topicSettings')?.addEventListener('click', openInspirationSettings);
    $('#sidebarTopicSettings')?.addEventListener('click', openInspirationSettings);
    setGeminiStatus(window.RiriGeminiAssistant?.status || '正在載入 Gemini…');
    if ($('#themeSetting')) $('#themeSetting').value = preferences.theme || 'system';
    app.render();
  }

  window.RiriEnhancements = { initialize, renderToday, renderAlternate, setGeminiStatus };
})();
