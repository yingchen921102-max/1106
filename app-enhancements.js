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
    theme: 'system', displayName: window.HABIT_DISPLAY_NAME || '我的帳戶', topic: '藝術', backendUrl: ''
  });
  let tasks = safeLoad(tasksKey, []);
  let calendarMode = 'week';
  let calendarCursor = new Date();
  let reviewMode = 'week';
  let detailHabitId = null;
  let detailPreviousView = 'today';
  let pendingPlanDates = [];
  let detailSuggestion = null;
  let pendingHabitEdit = null;
  let initialized = false;

  const pad = n => String(n).padStart(2, '0');
  const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const fromKey = key => new Date(`${key}T12:00:00`);
  const addDays = (date, amount) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
  const escapeHTML = app.escapeHTML;
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const topicPrompts = {
    '藝術': [
      '觀察一件日常物品：如果把它畫成三條線，哪三條最重要？',
      '今天留意一種顏色，找找它在不同地方帶給你的感覺。',
      '用五分鐘記錄一個畫面，不必完整，只要抓住最吸引你的地方。',
      '試著用另一種媒材表達今天的心情：文字、聲音或線條都可以。'
    ],
    '財經': [
      '選一個你常聽到的經濟指標，花十分鐘弄懂它代表什麼、又不代表什麼。',
      '看一則財經報導時，找出數字的來源與比較基準，再形成自己的看法。',
      '把今天讀到的市場消息寫成一句事實、一句解讀，分清兩者的差異。',
      '挑一家公司，看看它的收入來源；理解生意如何運作也是一種練習。'
    ],
    '科學': [
      '把今天的一個「為什麼」寫下來，再找一個可信來源開始查證。',
      '用自己的話解釋一個剛學到的概念，看看哪裡還需要補充。',
      '觀察一個生活中的現象，先提出假設，再想一個能驗證它的小方法。',
      '花十分鐘讀一段科普內容，記下最想繼續追問的一個問題。'
    ],
    '設計': [
      '挑一個今天用過的介面，想想它讓你更容易完成了哪一件事。',
      '把一件麻煩的小事拆成三步，看看哪一步可以設計得更順手。',
      '今天少做一個選擇：整理桌面、工具或提醒，讓下一步更容易開始。',
      '找一個你喜歡的設計，說明它為什麼適合使用者，而不只是好看。'
    ]
  };

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
      $('#summary')?.insertAdjacentHTML('afterend', `<section id="inspirationCard" class="card inspiration-card" aria-live="polite"><div><div class="inspiration-eyebrow">TODAY'S SPARK · <span id="inspirationTopic">藝術</span></div><p class="inspiration-text" id="inspirationText"></p><div class="inspiration-source" id="inspirationSource">依偏好主題每日輪替的練習提示</div></div><div class="inspiration-actions"><button class="quiet-btn" id="nextInspiration" type="button">換一則</button><button class="quiet-btn" id="topicSettings" type="button">調整主題</button></div></section>`);
    }
    if (!$('#taskPanel')) {
      $('.content-grid')?.insertAdjacentHTML('afterend', `<section id="taskPanel" class="card task-panel"><div class="task-heading"><h2>今日待辦</h2><span id="taskCount" class="month"></span></div><form class="task-form" id="taskForm"><input id="taskTitle" maxlength="100" required aria-label="待辦內容" placeholder="新增一件今天想完成的事"><input id="taskDueDate" type="date" required aria-label="到期日"><button class="primary" type="submit">＋ 加入待辦</button></form><div class="task-list" id="taskList"></div></section>`);
    }
    const form = $('#habitForm');
    if (form && !$('#cycleUnit')) {
      $('#dayChoices')?.insertAdjacentHTML('afterend', `<div class="period-settings"><div class="field"><label for="cycleUnit">目標週期</label><select id="cycleUnit" class="setting-select"><option value="week">每週</option><option value="month">每月</option></select></div><div class="field"><label for="periodTargetHours">每期目標投入（小時）</label><input id="periodTargetHours" class="period-target" type="number" min="0.25" step="0.25" placeholder="留空則依大目標估算"></div><p class="form-hint">每期可在習慣專屬頁選擇實際執行日期，系統會均分建議時數。</p></div>`);
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
    const topic = Object.hasOwn(topicPrompts, preferences.topic) ? preferences.topic : '藝術';
    const list = topicPrompts[topic];
    const dateIndex = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    const offset = Number(sessionStorage.getItem('riri-inspiration-offset') || 0);
    $('#inspirationTopic').textContent = topic;
    $('#inspirationText').textContent = list[(dateIndex + offset) % list.length];
    $('#inspirationSource').textContent = backendBase() ? '依你的主題由 AI 產生；無法連線時顯示主題提示' : '依偏好主題每日輪替的原創練習提示';
    const requestKey = `${dateKey(new Date())}:${topic}:${offset}`;
    const responseKey = `riri-ai-inspiration:${identity}:${requestKey}`;
    const cached = safeLoad(responseKey, null);
    if (!forceRefresh && cached?.text) {
      $('#inspirationText').textContent = cached.text;
      $('#inspirationSource').textContent = cached.source || 'AI 每日靈感';
      return;
    }
    if (!backendBase()) return;
    apiRequest(`/inspiration/today?topic=${encodeURIComponent(topic)}${forceRefresh ? '&refresh=1' : ''}`)
      .then(async response => { if (!response.ok) return null; return response.json(); })
      .then(data => {
        if (!data?.text) return;
        localStorage.setItem(responseKey, JSON.stringify(data));
        $('#inspirationText').textContent = data.text;
        $('#inspirationSource').textContent = data.source || 'AI 每日靈感';
      }).catch(() => {});
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
    return `<div class="view-toolbar"><div class="segmented"><button type="button" class="${active === 'week' ? 'active' : ''}" data-mode="week" data-mode-key="${modeKey}">週</button><button type="button" class="${active === 'month' ? 'active' : ''}" data-mode="month" data-mode-key="${modeKey}">月</button></div><button class="quiet-btn" type="button" data-step="-1" data-mode-key="${modeKey}">‹</button><button class="quiet-btn" type="button" data-step="1" data-mode-key="${modeKey}">›</button><button class="quiet-btn" type="button" data-today="true">今天</button><span class="range-label">${escapeHTML(rangeText)}</span></div>`;
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
    const period = reviewMode === 'month' ? getPeriod('month', calendarCursor) : getPeriod('week', calendarCursor);
    const todayKey = dateKey(app.today);
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
    return `${toolbar(reviewMode, 'review', null, label)}<div class="review-overview"><div class="donut" style="background:${donut}"><div class="donut-center"><b>${total ? Math.round(done / total * 100) : 0}%</b><span>完成率</span></div></div><div class="legend-list"><div class="legend-row"><i class="legend-swatch" style="background:var(--green)"></i>已完成 <b>${done}</b></div><div class="legend-row"><i class="legend-swatch" style="background:#d6a55c"></i>跳過 <b>${skipped}</b></div><div class="legend-row"><i class="legend-swatch" style="background:#d7ddd5"></i>未完成 <b>${unfinished}</b></div><small class="muted">統計截至今天；未來排程不計入未完成率。</small></div></div><h3 class="section-label">每日完成率</h3>${dailyRows || '<div class="empty-state">這段期間還沒有排程紀錄。</div>'}`;
  }

  function renderSettings() {
    const option = (value, label, selected) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`;
    return `<div class="settings-section"><h3>外觀與個人化</h3><label class="setting-row"><span>顯示模式<small>選擇日間、夜間或跟隨裝置設定</small></span><select class="setting-select" id="themeSetting">${option('system', '跟隨系統', preferences.theme)}${option('light', '日間模式', preferences.theme)}${option('dark', '夜間模式', preferences.theme)}</select></label><label class="setting-row"><span>首頁稱呼<small>用你喜歡的名字問候你</small></span><input id="displayNameSetting" class="setting-input" maxlength="24" value="${escapeHTML(preferences.displayName || '')}"></label><label class="setting-row"><span>每日靈感主題<small>每天依偏好顯示不同的練習提示</small></span><select class="setting-select" id="topicSetting">${['藝術','財經','科學','設計'].map(value => option(value, value, preferences.topic)).join('')}</select></label></div><div class="settings-section"><h3>提醒</h3><label class="setting-row"><span>瀏覽器通知<small>目前裝置上的提醒；手機推播需設定推播服務</small></span><button class="state-btn" id="settingsNotify">${'Notification' in window && Notification.permission === 'granted' ? '已允許' : '設定通知'}</button></label><div class="settings-row-note">Google 日曆可另外提供跨裝置事件提醒。</div></div><div class="settings-section"><h3>外部工具</h3><p class="integration-intro">連線由 App 後端安全處理；前端不保存 Google 或 Notion 金鑰。</p><label class="setting-row"><span>後端 API 網址<small>部署整合服務後貼上服務網址</small></span><input id="backendUrlSetting" class="backend-url" type="url" placeholder="https://api.example.com" value="${escapeHTML(preferences.backendUrl || '')}"></label><div class="backend-row"><button class="secondary" id="saveBackendUrl" type="button">儲存 API 網址</button><button class="quiet-btn" id="refreshIntegrations" type="button">更新連線狀態</button></div><div id="integrationStatus"><div class="integration-card"><div><div class="integration-title">Google 日曆</div><small>建立習慣排程並更新完成狀態</small><div class="integration-status" data-provider-status="GOOGLE">尚未連線</div></div><div class="integration-actions"><button class="state-btn" data-connect="google" type="button">連結 Google</button></div></div><div class="integration-card"><div><div class="integration-title">Notion</div><small>將每期執行紀錄備份到你的資料庫</small><div class="integration-status" data-provider-status="NOTION">尚未連線</div></div><div class="integration-actions"><button class="state-btn" data-connect="notion" type="button">連結 Notion</button></div></div></div><p class="backend-note">整合後端尚未設定時，這些連結會保持待設定狀態；請勿在此輸入 Integration Token 或 OAuth 密鑰。</p></div>`;
  }

  function renderAlternate() {
    const view = $('.nav button.active')?.dataset.view || 'today';
    if (!$('#alternateView') || !$('#altContent')) return;
    $('#todayView').style.display = view === 'today' ? '' : 'none';
    $('#alternateView').style.display = view === 'today' ? 'none' : '';
    $('#habitDetailView').classList.remove('active');
    const details = {
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
    if (view === 'calendar') $('#altContent').innerHTML = calendarMode === 'week' ? renderWeekBoard() : renderMonthBoard();
    else if (view === 'review') $('#altContent').innerHTML = renderReview();
    else if (view === 'settings') $('#altContent').innerHTML = renderSettings();
    if (view === 'settings') refreshIntegrationStatus();
  }

  function updatePlanEstimate(habit, selectedCount) {
    const totalHours = Number(habit.periodTargetHours) || Math.max(0.25, Number(habit.duration || 30) * (habit.days?.length || 1) / 60);
    const suggestedSessionMinutes = selectedCount ? Math.round(totalHours * 60 / selectedCount) : 0;
    const currentGoal = habit.goal ? app.goalStats(habit) : null;
    const remaining = habit.goal?.trackHours ? Math.max(0, Number(habit.goal.targetHours || 0) - (currentGoal?.hours || 0)) : null;
    const period = getPeriod(habit.cycleUnit || 'week', app.today);
    const deadline = habit.goal?.date ? fromKey(habit.goal.date) : null;
    const interval = habit.cycleUnit === 'month' ? 30.44 : 7;
    const periodsLeft = deadline ? Math.max(1, Math.ceil((deadline - period.start) / (interval * 86400000))) : 1;
    const suggestedHours = remaining === null ? totalHours : Math.min(totalHours, remaining / periodsLeft);
    return { targetHours: totalHours, suggestedHours, suggestedSessionMinutes, remaining, periodsLeft };
  }

  function openDetail(id) {
    const habit = app.habits.find(item => item.id === id);
    if (!habit) return;
    detailHabitId = id;
    pendingPlanDates = [];
    detailSuggestion = null;
    detailPreviousView = $('.nav button.active')?.dataset.view || 'today';
    $('#todayView').style.display = 'none';
    $('#alternateView').style.display = 'none';
    $('#habitDetailView').classList.add('active');
    $$('.nav button').forEach(button => button.classList.toggle('active', button.dataset.view === 'today'));
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

  function backendBase() { return String(preferences.backendUrl || '').trim().replace(/\/+$/, ''); }
  async function authHeaders() {
    if (typeof window.RIRI_GET_ID_TOKEN !== 'function') throw new Error('請使用 Google 帳戶登入後連結外部服務。');
    const token = await window.RIRI_GET_ID_TOKEN();
    if (!token) throw new Error('登入狀態已失效，請重新登入。');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }
  async function apiRequest(path, options = {}) {
    const base = backendBase();
    if (!base) throw new Error('請先輸入並儲存整合後端 API 網址。');
    return fetch(`${base}${path}`, { ...options, headers: { ...(await authHeaders()), ...options.headers } });
  }

  async function connectProvider(provider) {
    try {
      const response = await apiRequest(`/integrations/${provider}/authorize-url`);
      const data = await response.json();
      if (!response.ok || !data.authorizationUrl) throw new Error(data.message || `無法建立 ${provider} 授權連結`);
      location.assign(data.authorizationUrl);
    } catch (error) { app.toast(error.message || '連線失敗'); }
  }

  async function refreshIntegrationStatus() {
    const container = $('#integrationStatus');
    if (!container) return;
    if (!backendBase()) {
      $$('.integration-status', container).forEach(status => status.textContent = '待設定後端服務');
      return;
    }
    try {
      const response = await apiRequest('/integrations/status');
      if (!response.ok) throw new Error('無法讀取連線狀態');
      const data = await response.json();
      for (const provider of ['GOOGLE', 'NOTION']) {
        const connected = data.integrations.some(item => item.provider === provider && item.connected);
        const status = $(`[data-provider-status="${provider}"]`, container);
        if (status) status.textContent = connected ? (provider === 'NOTION' && data.integrations.find(item => item.provider === provider)?.notionDatabaseId ? '已連線並選擇資料庫' : '已連線') : '尚未連線';
        const button = $(`[data-connect="${provider.toLowerCase()}"]`, container);
        if (button) button.textContent = connected ? '重新連結' : `連結 ${provider === 'GOOGLE' ? 'Google' : 'Notion'}`;
      }
      if (data.integrations.some(item => item.provider === 'NOTION' && item.connected)) renderNotionDatabasePicker();
    } catch (error) {
      $$('.integration-status', container).forEach(status => status.textContent = '後端目前無法連線');
    }
  }

  async function renderNotionDatabasePicker() {
    const container = $('#integrationStatus');
    if (!container || $('#notionDatabaseSelect')) return;
    try {
      const response = await apiRequest('/integrations/notion/databases');
      if (!response.ok) return;
      const databases = await response.json();
      const picker = document.createElement('div');
      picker.className = 'integration-actions';
      picker.innerHTML = `<select class="integration-db-select" id="notionDatabaseSelect" aria-label="選擇 Notion 資料庫"><option value="">選擇目標資料庫</option>${databases.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.title)}</option>`).join('')}</select><button class="state-btn" id="saveNotionDatabase" type="button">套用</button>`;
      $('.integration-card:nth-child(2)', container)?.append(picker);
    } catch { /* Connection status already communicates unavailable backend. */ }
  }

  async function syncNotionPeriod(habit) {
    const period = getPeriod(habit.cycleUnit || 'week', app.today);
    const plan = habit.plans?.[period.key];
    const dates = plan?.dates || datesInPeriod(period).filter(date => (habit.days || []).includes(date.getDay())).map(dateKey);
    if (!dates.length) { app.toast('先選擇本期執行日期，再同步到 Notion。'); return; }
    try {
      for (const key of dates) {
        const response = await apiRequest('/integrations/notion/occurrences', {
          method: 'POST', body: JSON.stringify({
            syncKey: `${habit.id}:${key}`, habitName: habit.name, frequency: habit.cycleUnit === 'month' ? '每月' : '每週',
            expectedHours: Number(plan?.plannedMinutes || habit.duration || 30) / 60,
            status: app.statusOf(habit, key) === 'done' ? '已完成' : app.statusOf(habit, key) === 'skip' ? '跳過' : '待開始',
            executionDate: key
          })
        });
        if (!response.ok) throw new Error('Notion 同步失敗，請確認資料庫欄位設定。');
      }
      app.toast('本期紀錄已送到 Notion 同步佇列。');
    } catch (error) { app.toast(error.message || 'Notion 同步失敗'); }
  }

  async function syncGooglePeriod(habit) {
    const period = getPeriod(habit.cycleUnit || 'week', app.today);
    const plan = habit.plans?.[period.key];
    const dates = plan?.dates || datesInPeriod(period).filter(date => (habit.days || []).includes(date.getDay())).map(dateKey);
    if (!dates.length) { app.toast('先選擇本期執行日期，再同步到 Google 日曆。'); return; }
    try {
      const sorted = [...dates].sort();
      const first = fromKey(sorted[0]);
      const [hours, minutes] = String(habit.time || '20:00').split(':').map(Number);
      first.setHours(hours, minutes, 0, 0);
      const durationMinutes = Number(plan?.plannedMinutes || habit.duration || 30);
      const occurrences = sorted.map(key => {
        const start = fromKey(key);
        start.setHours(hours, minutes, 0, 0);
        return { date: key, start: start.toISOString(), end: new Date(start.getTime() + durationMinutes * 60_000).toISOString() };
      });
      const response = await apiRequest('/integrations/google/schedules', {
        method: 'POST', body: JSON.stringify({
          habitId: habit.id, name: habit.name, start: first.toISOString(), end: new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate(), 23, 59, 0).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, durationMinutes,
          intervalWeeks: 1, weekdays: sorted.map(key => fromKey(key).getDay()), occurrences, cycleUnit: habit.cycleUnit || 'week'
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Google 日曆同步失敗');
      app.toast('排程已送到 Google 日曆同步佇列。');
    } catch (error) { app.toast(error.message || 'Google 日曆同步失敗'); }
  }

  async function requestAiPlan() {
    const habit = app.habits.find(item => item.id === detailHabitId);
    if (!habit) return;
    if (!backendBase()) { app.toast('AI 計畫服務需先部署並設定後端 API 網址。'); return; }
    try {
      const stats = app.goalStats(habit) || { hours: 0 };
      const response = await apiRequest('/plans/suggest', {
        method: 'POST', body: JSON.stringify({
          goalName: habit.goal?.name || habit.name,
          targetHours: Number(habit.goal?.targetHours || habit.periodTargetHours || 0),
          completedHours: stats.hours,
          deadline: habit.goal?.date || undefined,
          periodUnit: habit.cycleUnit || 'week',
          sessionsPerPeriod: Math.max(1, pendingPlanDates.length),
          capacityHours: Number(habit.periodTargetHours) || undefined
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error('目前無法產生計畫建議');
      detailSuggestion = result;
      $('#planSuggestionText').textContent = `${result.explanation} ${result.source}`;
      $('#planSessionMinutes').textContent = `每次約 ${result.minutesPerSession} 分鐘`;
      app.toast(result.feasible ? '計畫建議已更新，可檢視後儲存。' : '目前目標超出每期投入上限，請調整期限或投入。');
    } catch (error) { app.toast(error.message || 'AI 計畫服務目前無法連線。'); }
  }

  const renderDetailContent = renderDetail;
  renderDetail = function renderDetailWithPlanTools() {
    renderDetailContent();
    const footer = $('.period-plan-footer', $('#detailContent'));
    if (!footer) return;
    const habit = app.habits.find(item => item.id === detailHabitId);
    const estimate = habit ? updatePlanEstimate(habit, pendingPlanDates.length) : { suggestedHours: 0 };
    footer.innerHTML = `<div class="period-plan-copy"><small id="planSessionMinutes">每次約 ${pendingPlanDates.length ? Math.round((detailSuggestion?.suggestedHours || estimate.suggestedHours) * 60 / pendingPlanDates.length) : 0} 分鐘</small><span id="planSuggestionText">${escapeHTML(detailSuggestion?.explanation || `建議每期投入 ${estimate.suggestedHours.toFixed(1)} 小時。`)}</span></div><div class="integration-actions"><button class="quiet-btn" id="requestAiPlan" type="button">AI 估算</button><button class="primary" id="savePeriodPlan" type="button">儲存本期計畫</button></div>`;
  };

  function renderDetail() {
    const habit = app.habits.find(item => item.id === detailHabitId);
    if (!habit) return;
    const period = getPeriod(habit.cycleUnit || 'week', app.today);
    const persisted = habit.plans?.[period.key];
    const dates = datesInPeriod(period);
    if (!pendingPlanDates.length) pendingPlanDates = persisted?.dates || dates.filter(date => (habit.days || []).includes(date.getDay())).map(dateKey);
    const estimate = updatePlanEstimate(habit, pendingPlanDates.length);
    const stats = app.goalStats(habit) || { pct: 0, hours: 0 };
    const completionDates = Object.entries(habit.states || {}).filter(([, state]) => state === 'done').map(([key]) => key).sort((a, b) => b.localeCompare(a)).slice(0, 14);
    $('#detailContent').innerHTML = `<div class="card detail-hero"><div><div class="eyebrow">${period.unit === 'month' ? '本月小計畫' : '本週小計畫'}</div><p class="detail-subtitle">${period.start.getFullYear()}年${period.start.getMonth() + 1}月${period.start.getDate()}日 – ${period.end.getMonth() + 1}月${period.end.getDate()}日 · 每期日期可自行調整</p><div class="goal-sub">大目標：${escapeHTML(habit.goal?.name || '尚未設定')} ${habit.goal?.date ? `· 截止 ${escapeHTML(habit.goal.date)}` : ''}</div></div><div class="detail-progress"><b>${stats.pct}%</b><div class="goal-sub">整體目標進度</div></div></div><div class="detail-grid"><section class="card detail-card"><h3>選擇本期執行日期</h3><p class="goal-sub">${period.unit === 'month' ? '點選本月實際會練習的日期。' : '點選本週實際會練習的日期。'}</p><div class="period-picker">${dates.map(date => {const key = dateKey(date), selected = pendingPlanDates.includes(key), completed = app.statusOf(habit, key) === 'done';return `<button class="period-date ${selected ? 'selected' : ''} ${completed ? 'past' : ''}" type="button" data-plan-date="${key}">${date.getMonth() + 1}/${date.getDate()}<small>${weekdayNames[date.getDay()]}${completed ? ' ✓' : ''}</small></button>`;}).join('')}</div><div class="period-plan-footer"><span>建議投入 ${estimate.suggestedHours.toFixed(1)} 小時 · 每次約 ${pendingPlanDates.length ? Math.round(estimate.suggestedHours * 60 / pendingPlanDates.length) : 0} 分鐘</span><button class="primary" id="savePeriodPlan" type="button">儲存本期計畫</button></div></section><section class="card detail-card"><h3>進步追蹤</h3>${habit.goal?.trackHours ? `<div class="goal-card"><div class="goal-card-top"><span class="goal-card-name">累積時數</span><span class="goal-card-percent">${stats.hours.toFixed(1)} / ${Number(habit.goal.targetHours || 0)} 小時</span></div><div class="progress-line"><i style="width:${Math.min(100, stats.hours / Math.max(1, Number(habit.goal.targetHours)) * 100)}%"></i></div><div class="goal-sub">依目標期限平均分配到剩餘 ${estimate.periodsLeft} 期；可調整本期投入。</div></div>` : '<div class="goal-sub">編輯習慣可設定總目標與里程碑。</div>'}<h3 style="margin-top:16px">最近完成紀錄</h3><div class="goal-history">${completionDates.map(key => `<div class="goal-log"><span>${key}</span><span>✓ 完成</span></div>`).join('') || '<div class="goal-sub">完成習慣後會顯示在這裡。</div>'}</div><div class="goal-actions"><button class="tool-btn" id="editDetailHabit" type="button">編輯習慣</button><button class="tool-btn" id="syncDetailGoogle" type="button">同步本期到 Google 日曆</button><button class="tool-btn" id="syncDetailNotion" type="button">備份本期到 Notion</button></div></section></div>`;
  }

  function attachEvents() {
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
      if (step) { const mode = step.dataset.modeKey; const unit = mode === 'review' ? reviewMode : calendarMode; calendarCursor = unit === 'month' ? new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + Number(step.dataset.step), 15) : addDays(calendarCursor, Number(step.dataset.step) * 7); app.render(); return; }
      const modeButton = event.target.closest('[data-mode-key][data-mode]');
      if (modeButton) { if (modeButton.dataset.modeKey === 'review') reviewMode = modeButton.dataset.mode; else calendarMode = modeButton.dataset.mode; app.render(); return; }
      if (event.target.closest('[data-today]')) { calendarCursor = new Date(app.today); app.render(); return; }
      const planDate = event.target.closest('[data-plan-date]');
      if (planDate) { pendingPlanDates = pendingPlanDates.includes(planDate.dataset.planDate) ? pendingPlanDates.filter(key => key !== planDate.dataset.planDate) : [...pendingPlanDates, planDate.dataset.planDate].sort(); renderDetail(); return; }
      if (event.target.closest('#savePeriodPlan')) {
        const habit = app.habits.find(item => item.id === detailHabitId); if (!habit) return;
        if (!pendingPlanDates.length) { app.toast('請至少選擇一個執行日期。'); return; }
        const period = getPeriod(habit.cycleUnit || 'week', app.today);
        const estimate = updatePlanEstimate(habit, pendingPlanDates.length);
        habit.plans ||= {};
        const targetHours = Number(detailSuggestion?.suggestedHours || estimate.suggestedHours);
        habit.plans[period.key] = { dates: [...pendingPlanDates], targetHours, plannedMinutes: Math.round(targetHours * 60 / pendingPlanDates.length) };
        app.save(); app.render(); renderDetail(); app.toast('本期計畫已儲存，之後可滾動調整。'); return;
      }
      if (event.target.closest('#requestAiPlan')) { requestAiPlan(); return; }
      if (event.target.closest('#detailBack')) { showView(detailPreviousView); return; }
      if (event.target.closest('#editDetailHabit')) { const habit = app.habits.find(item => item.id === detailHabitId); if (habit) { showView('today'); app.openHabit(habit.id); setTimeout(() => { $('#cycleUnit').value = habit.cycleUnit || 'week'; $('#periodTargetHours').value = habit.periodTargetHours || ''; }, 0); } return; }
      if (event.target.closest('#syncDetailGoogle')) { const habit = app.habits.find(item => item.id === detailHabitId); if (habit) syncGooglePeriod(habit); return; }
      if (event.target.closest('#syncDetailNotion')) { const habit = app.habits.find(item => item.id === detailHabitId); if (habit) syncNotionPeriod(habit); return; }
      if (event.target.closest('#nextInspiration')) { sessionStorage.setItem('riri-inspiration-offset', String(Number(sessionStorage.getItem('riri-inspiration-offset') || 0) + 1)); renderInspiration(true); return; }
      if (event.target.closest('#topicSettings')) { showView('settings'); $('#topicSetting')?.focus(); return; }
      if (event.target.closest('#settingsNotify')) { $('#notifyBtn')?.click(); return; }
      const connect = event.target.closest('[data-connect]');
      if (connect) { connectProvider(connect.dataset.connect); return; }
      if (event.target.closest('#saveBackendUrl')) { preferences.backendUrl = $('#backendUrlSetting').value.trim(); savePreferences(); app.toast('後端 API 網址已儲存。'); refreshIntegrationStatus(); return; }
      if (event.target.closest('#refreshIntegrations')) { refreshIntegrationStatus(); return; }
      if (event.target.closest('#saveNotionDatabase')) {
        const databaseId = $('#notionDatabaseSelect')?.value; if (!databaseId) { app.toast('請選擇一個 Notion 資料庫。'); return; }
        apiRequest('/integrations/notion/database', { method: 'PUT', body: JSON.stringify({ databaseId }) }).then(response => { if (!response.ok) throw new Error('資料庫欄位不符合，請依設定說明新增欄位。'); app.toast('Notion 資料庫已連結。'); refreshIntegrationStatus(); }).catch(error => app.toast(error.message));
        return;
      }
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
      if (event.target.id === 'topicSetting') { preferences.topic = event.target.value; savePreferences(); renderInspiration(); }
      if (event.target.id === 'displayNameSetting') { preferences.displayName = event.target.value.trim() || '朋友'; savePreferences(); renderToday(); }
      if (event.target.id === 'geminiConsent') setGeminiStatus(window.RiriGeminiAssistant?.status || '正在載入 Gemini…');
      if (event.target.id === 'geminiShareContext') { /* The context is collected only when the user sends a message. */ }
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

  function onHabitStateChange(habit, state, key) {
    if (!backendBase()) return;
    const status = state === 'done' ? '已完成' : state === 'skip' ? '跳過' : '待開始';
    apiRequest('/integrations/notion/occurrences', {
      method: 'POST', body: JSON.stringify({
        syncKey: `${habit.id}:${key}`, habitName: habit.name, frequency: habit.cycleUnit === 'month' ? '每月' : '每週',
        expectedHours: Number(habit.duration || 30) / 60, status, executionDate: key
      })
    }).catch(() => {});
    if (state === 'done') {
      const start = fromKey(key);
      const [hours, minutes] = String(habit.time || '20:00').split(':').map(Number);
      start.setHours(hours, minutes, 0, 0);
      const end = new Date(start.getTime() + Number(habit.duration || 30) * 60_000);
      apiRequest('/integrations/google/occurrences/complete', {
        method: 'POST', body: JSON.stringify({
          habitId: habit.id, cycleUnit: habit.cycleUnit || 'week', occurrenceDate: key,
          occurrenceStart: start.toISOString(), occurrenceEnd: end.toISOString()
        })
      }).catch(() => {});
    }
  }

  function initialize() {
    if (initialized || !window.RiriApp) return;
    initialized = true;
    addInterface();
    const formIconFields = $$('[id="habitIcon"]');
    if (formIconFields.length > 1) formIconFields[1].closest('.field')?.remove();
    applyTheme();
    attachEvents();
    setGeminiStatus(window.RiriGeminiAssistant?.status || '正在載入 Gemini…');
    if ($('#themeSetting')) $('#themeSetting').value = preferences.theme || 'system';
    const integrationNotice = new URLSearchParams(location.search).get('integration');
    app.render();
    if (integrationNotice === 'google-connected' || integrationNotice === 'notion-connected') {
      app.toast(integrationNotice === 'google-connected' ? 'Google 日曆已連結。' : 'Notion 已連結，請選擇目標資料庫。');
      history.replaceState({}, '', location.pathname);
    }
  }

  window.RiriEnhancements = { initialize, renderToday, renderAlternate, onHabitStateChange, setGeminiStatus };
})();
