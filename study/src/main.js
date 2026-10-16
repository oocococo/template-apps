import markup from './markup.html?raw';
import './style.css';
import './load-style.js';
import { sql } from './db.js';
import { newId } from './id.js';

document.getElementById('app').innerHTML = markup;

let tasks = [];
let sessions = [];      // 全部历史：{ started_at, minutes, task_id }
let buildings = [];     // 岛上建筑：{ id, subject, building_type, status, created_at }
let remaining = 1500;
let interval = null;
let focusMinutes = 25;
let displayName = '';
let activeView = 'today';
let taskFilter = 'all';
let currentTaskId = null;
const WORKSPACE = 'main';
const suggestions = [
  { title: '安排 25 分钟专注学习', subject: '复习总结', estimated_minutes: 25 },
  { title: '阅读一篇感兴趣的文章', subject: '语言学习', estimated_minutes: 25 },
  { title: '整理今天的新发现', subject: '复习总结', estimated_minutes: 20 },
];

const BUILDINGS = [
  { type: 'bench',    emoji: '🪑', name: '林间长椅', cost: 0,    kind: 'free' },
  { type: 'flower',   emoji: '🌷', name: '花坛',     cost: 0,    kind: 'free' },
  { type: 'lantern',  emoji: '🏮', name: '石灯',     cost: 0,    kind: 'free' },
  { type: 'tent',     emoji: '⛺', name: '帐篷营地', cost: 0,    kind: 'free' },
  { type: 'cabin',    emoji: '🏠', name: '小书房',   cost: 0,    kind: 'free' },
  { type: 'cafe',     emoji: '☕', name: '咖啡馆',   cost: 600,  kind: 'coin' },
  { type: 'bookshop', emoji: '📚', name: '独立书店', cost: 900,  kind: 'coin' },
  { type: 'observ',   emoji: '🔭', name: '天文台',   cost: 1500, kind: 'coin' },
  { type: 'lighthouse', emoji: '🗼', name: '灯塔',   cost: 2000, kind: 'coin' },
  { type: 'library',  emoji: '🏛️', name: '大图书馆', cost: 2600, kind: 'coin' },
  { type: 'monument', emoji: '🗿', name: '十小时纪念碑', cost: 0, kind: 'milestone', desc: '累计专注满 10 小时', check: (s) => s >= 600 },
  { type: 'castle',   emoji: '🏰', name: '学习城堡', cost: 0, kind: 'milestone', desc: '岛上建筑满 30 座', check: (s, b) => b >= 30 },
  { type: 'wheel',    emoji: '🎡', name: '心游乐园', cost: 0, kind: 'milestone', desc: '连续专注 7 天', check: (s, b, k) => k >= 7 },
];
const FREE_TYPES = BUILDINGS.filter((b) => b.kind === 'free').map((b) => b.type);

function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(window.studyToastTimer);
  window.studyToastTimer = setTimeout(() => element.classList.add('hidden'), 3000);
}

async function ensureSchema() {
  await sql(`CREATE TABLE IF NOT EXISTS island_buildings (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, session_id TEXT,
    subject TEXT NOT NULL, building_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'built', created_at TEXT NOT NULL)`);
  await sql(`CREATE TABLE IF NOT EXISTS island_unlocks (
    workspace_id TEXT NOT NULL, tree_type TEXT PRIMARY KEY,
    cost INTEGER NOT NULL, unlocked_at TEXT NOT NULL)`);
  try { await sql('ALTER TABLE study_sessions ADD COLUMN task_id TEXT'); }
  catch (error) { /* 列已存在 */ }
}

const totalMinutes = () => sessions.reduce((sum, s) => sum + Number(s.minutes), 0);
const builtCount = () => buildings.filter((b) => b.status === 'built').length;
const spentCoins = () => unlockedTypes().reduce((sum, u) => sum + Number(u.cost), 0);
const coins = () => Math.max(0, totalMinutes() - spentCoins());
let unlocksCache = [];
function unlockedTypes() { return unlocksCache; }
function isUnlocked(type) { return FREE_TYPES.includes(type) || unlocksCache.some((u) => u.tree_type === type); }

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function streakDays() {
  const days = new Set(sessions.map((s) => dateKey(new Date(s.started_at))));
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1); // 今天还没专注，从昨天起算
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function taskById(id) { return tasks.find((task) => task.id === id) || null; }
function focusedByTask() {
  const map = new Map();
  sessions.forEach((s) => { if (s.task_id) map.set(s.task_id, (map.get(s.task_id) || 0) + Number(s.minutes)); });
  return map;
}

function renderTasks() {
  const completed = tasks.filter((task) => task.done_at).length;
  document.getElementById('count').textContent = completed;
  document.getElementById('total').textContent = tasks.length;
  document.getElementById('encourage').textContent = !tasks.length ? '从一项小任务开始 ✦' : completed === tasks.length ? '清单全部完成，太棒了！' : completed >= 2 ? '节奏很好，继续保持 ✦' : '美好的一天，从第一步开始';
  document.getElementById('review-task-count').textContent = completed;
  renderTaskList();
  renderPlan();
  renderBoundTaskOptions();
}

function renderSuggestions(list) {
  const intro = document.createElement('div');
  intro.className = 'suggestion-intro';
  intro.innerHTML = '<b>选一个轻松的开始</b><span>点“加入清单”才会成为你的任务。</span>';
  list.append(intro);
  suggestions.forEach((suggestion) => {
    const row = document.createElement('div');
    row.className = 'suggestion';
    row.innerHTML = '<span class="suggestion-mark">✦</span><div><b></b><small></small></div><button>加入清单 ↗</button>';
    row.querySelector('b').textContent = suggestion.title;
    row.querySelector('small').textContent = `${suggestion.subject} · ${suggestion.estimated_minutes} 分钟`;
    row.querySelector('button').onclick = async () => {
      try { await addTask(suggestion); }
      catch (error) { toast(error.message); }
    };
    list.append(row);
  });
}

function taskRow(task, focusedMinutes) {
  const done = Boolean(task.done_at);
  const row = document.createElement('div');
  row.className = `task${done ? ' done' : ''}`;
  const percent = Math.min(100, Math.round(focusedMinutes / Math.max(1, task.estimated_minutes) * 100));
  const reached = !done && percent >= 100;
  row.innerHTML = `<button class="tick" aria-label="完成任务">${done ? '✓' : ''}</button><div class="task-detail"><div class="task-title"></div><div class="task-meta"></div><div class="task-progress"><div class="task-progress-bar"><i style="width:${percent}%"></i></div><small>${focusedMinutes} / ${task.estimated_minutes} 分钟</small></div></div><span class="subject"></span>`;
  row.querySelector('.task-title').textContent = task.title;
  row.querySelector('.task-meta').textContent = `预计 ${task.estimated_minutes} 分钟 · ${task.subject}`;
  const tag = row.querySelector('.subject');
  tag.textContent = task.subject;
  const tone = task.subject === '语言学习' ? 'green' : task.subject === '复习总结' ? 'orange' : null;
  if (tone) tag.classList.add(tone);
  if (reached) {
    row.querySelector('.task-progress small').textContent = `${focusedMinutes} / ${task.estimated_minutes} 分钟 · ✓ 可以完成啦`;
    row.classList.add('reached');
  }
  if (done) row.querySelector('.task-progress').remove();
  row.querySelector('.tick').onclick = async () => {
    try {
      const next = done ? null : new Date().toISOString();
      await sql('UPDATE study_tasks SET done_at = ? WHERE workspace_id = ? AND id = ?', [next, WORKSPACE, task.id]);
      task.done_at = next;
      renderTasks();
      if (next) toast('✦ 任务完成！岛上的街区又热闹了一点。');
    } catch (error) { toast(error.message); }
  };
  return row;
}

function renderPlan() {
  const list = document.getElementById('plan-list');
  list.replaceChildren();
  const next = tasks.filter((task) => !task.done_at).slice(0, 3);
  if (!next.length) {
    const message = document.createElement('p');
    message.className = 'week-note';
    message.textContent = tasks.length ? '当前任务都完成了。给自己一点休息，再写下新的目标。' : '你的下一步还没有写下。从左侧挑一个建议，或新建自己的任务。';
    list.append(message);
    return;
  }
  next.forEach((task, index) => {
    const row = document.createElement('div');
    row.className = 'plan-row';
    row.innerHTML = '<span class="plan-time"></span><span class="plan-dot"></span><div><b></b><small></small></div>';
    row.querySelector('.plan-time').textContent = String(index + 1).padStart(2, '0');
    row.querySelector('b').textContent = task.title;
    row.querySelector('small').textContent = `${task.subject} · ${task.estimated_minutes} 分钟`;
    list.append(row);
  });
}

function renderBoundTaskOptions() {
  const select = document.getElementById('bound-task');
  const open = tasks.filter((task) => !task.done_at);
  select.replaceChildren();
  if (!open.length) {
    const option = document.createElement('option');
    option.textContent = '暂无任务 · 自由专注';
    option.value = '';
    select.append(option);
    currentTaskId = null;
    return;
  }
  if (!currentTaskId || !open.some((task) => task.id === currentTaskId)) currentTaskId = open[0].id;
  open.forEach((task) => {
    const option = document.createElement('option');
    option.value = task.id;
    option.textContent = `${task.title}（${task.subject}）`;
    if (task.id === currentTaskId) option.selected = true;
    select.append(option);
  });
}

function renderBuildingOptions() {
  const select = document.getElementById('building-select');
  select.replaceChildren();
  BUILDINGS.filter((b) => b.kind !== 'milestone' && isUnlocked(b.type)).forEach((b) => {
    const option = document.createElement('option');
    option.value = b.type;
    option.textContent = `${b.emoji} ${b.name}`;
    select.append(option);
  });
  const saved = localStorage.getItem('island_building');
  if (saved && isUnlocked(saved)) select.value = saved;
}

function selectedBuilding() {
  return BUILDINGS.find((b) => b.type === document.getElementById('building-select').value) || BUILDINGS[0];
}

function renderIsland() {
  document.getElementById('island-built').textContent = builtCount();
  document.getElementById('island-minutes').textContent = totalMinutes();
  document.getElementById('island-coins').textContent = coins();
  const streak = streakDays();
  document.getElementById('island-streak').textContent = streak;
  document.getElementById('review-streak').textContent = streak;

  const districts = document.getElementById('island-districts');
  districts.replaceChildren();
  const order = ['前端开发', '语言学习', '复习总结', '自由专注'];
  const groups = new Map();
  buildings.forEach((b) => {
    if (!groups.has(b.subject)) groups.set(b.subject, []);
    groups.get(b.subject).push(b);
  });
  const keys = [...order.filter((key) => groups.has(key)), ...[...groups.keys()].filter((key) => !order.includes(key))];
  if (!keys.length) {
    const empty = document.createElement('div');
    empty.className = 'island-empty';
    empty.innerHTML = '<b>岛上还空空的 ✦</b><span>去「今日」完成第一轮专注，落下第一座建筑。</span>';
    districts.append(empty);
  }
  keys.forEach((subject) => {
    const panel = document.createElement('div');
    panel.className = 'district';
    const list = groups.get(subject);
    const built = list.filter((b) => b.status === 'built').length;
    panel.innerHTML = `<div class="district-head"><b></b><span>${built} 座 · 共 ${Math.round(list.reduce((sum, b) => sum + (b.minutes || 0), 0))} 分钟</span></div><div class="district-grid"></div>`;
    panel.querySelector('.district-head b').textContent = subject;
    const grid = panel.querySelector('.district-grid');
    list.forEach((b) => {
      const def = BUILDINGS.find((entry) => entry.type === b.building_type);
      const cell = document.createElement('div');
      cell.className = `building${b.status === 'ruined' ? ' ruined' : ''}`;
      cell.title = b.status === 'ruined'
        ? `${new Date(b.created_at).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 中途放弃的工地`
        : `${def ? def.name : b.building_type} · ${new Date(b.created_at).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}${b.minutes ? ` · ${b.minutes} 分钟` : ''}`;
      cell.textContent = b.status === 'ruined' ? '🚧' : (def ? def.emoji : '🏠');
      grid.append(cell);
    });
    districts.append(panel);
  });
  renderCatalog();
}

function renderCatalog() {
  const list = document.getElementById('catalog-list');
  list.replaceChildren();
  const builtByType = new Map();
  buildings.filter((b) => b.status === 'built').forEach((b) => builtByType.set(b.building_type, (builtByType.get(b.building_type) || 0) + 1));
  BUILDINGS.forEach((b) => {
    const unlocked = isUnlocked(b.type);
    const row = document.createElement('div');
    row.className = `catalog-row${unlocked ? '' : ' locked'}`;
    if (b.kind === 'milestone') {
      const done = unlocked || (b.check && b.check(totalMinutes(), builtCount(), streakDays()));
      row.innerHTML = `<span class="catalog-emoji"></span><div><b></b><small></small></div>${done ? '<span class="catalog-state">✓ 已点亮</span>' : '<span class="catalog-state pending">未达成</span>'}`;
      row.querySelector('small').textContent = b.desc;
    } else {
      row.innerHTML = `<span class="catalog-emoji"></span><div><b></b><small></small></div>${unlocked ? '<span class="catalog-state">可选</span>' : `<button class="unlock">🪙 ${b.cost} 解锁</button>`}`;
      row.querySelector('small').textContent = b.kind === 'free' ? '基础建筑 · 免费使用' : `稀有建筑 · 价值 ${b.cost} 金币`;
      const button = row.querySelector('.unlock');
      if (button) button.onclick = () => unlockBuilding(b);
    }
    row.querySelector('.catalog-emoji').textContent = b.emoji;
    row.querySelector('b').textContent = `${b.name}${builtByType.get(b.type) ? ` × ${builtByType.get(b.type)}` : ''}`;
    list.append(row);
  });
}

async function unlockBuilding(def) {
  if (coins() < def.cost) { toast(`金币不够，还差 ${def.cost - coins()} 枚。多专注一会儿就攒够了。`); return; }
  try {
    await sql('INSERT INTO island_unlocks (workspace_id, tree_type, cost, unlocked_at) VALUES (?, ?, ?, ?)', [WORKSPACE, def.type, def.cost, new Date().toISOString()]);
    unlocksCache.push({ tree_type: def.type, cost: def.cost });
    renderIsland();
    renderBuildingOptions();
    toast(`🎉「${def.name}」蓝图解锁！下次专注就能动工了。`);
  } catch (error) { toast(error.message); }
}

async function checkMilestones() {
  for (const def of BUILDINGS.filter((b) => b.kind === 'milestone')) {
    if (!isUnlocked(def.type) && def.check(totalMinutes(), builtCount(), streakDays())) {
      try {
        await sql('INSERT INTO island_unlocks (workspace_id, tree_type, cost, unlocked_at) VALUES (?, ?, ?, ?)', [WORKSPACE, def.type, 0, new Date().toISOString()]);
        unlocksCache.push({ tree_type: def.type, cost: 0 });
        toast(`🏆 里程碑达成：「${def.name}」已在岛上点亮！`);
      } catch (error) { /* 忽略重复 */ }
    }
  }
}

function renderReview() {
  const totals = new Map();
  sessions.forEach((session) => {
    const key = dateKey(new Date(session.started_at));
    totals.set(key, (totals.get(key) || 0) + Number(session.minutes));
  });
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 6 + index);
    return date;
  });
  const maximum = Math.max(180, ...totals.values());
  const bars = document.getElementById('review-bars');
  bars.replaceChildren();
  days.forEach((date, index) => {
    const group = document.createElement('div');
    group.className = 'bar-group';
    const bar = document.createElement('div');
    bar.className = `bar${index === 6 ? ' today' : ''}`;
    bar.style.height = `${Math.max(6, Math.round((totals.get(dateKey(date)) || 0) / maximum * 115))}px`;
    const label = document.createElement('span');
    label.textContent = `周${'日一二三四五六'[date.getDay()]}`;
    group.append(bar, label);
    bars.append(group);
  });
  const recent = sessions.filter((s) => new Date(s.started_at) >= new Date(days[0].toDateString()));
  const minutes = recent.reduce((sum, s) => sum + Number(s.minutes), 0);
  document.getElementById('review-hours').textContent = (minutes / 60).toFixed(1);
  document.getElementById('review-days').textContent = days.filter((day) => (totals.get(dateKey(day)) || 0) > 0).length;
  document.getElementById('review-note').textContent = minutes ? '哪天更容易进入状态？照着自己的节奏安排下一轮。' : '第一段专注完成后，这里会画出你的学习节奏。';
  document.getElementById('review-total-hours').textContent = (totalMinutes() / 60).toFixed(1);

  // 学科投入分布
  const bySubject = new Map();
  sessions.forEach((s) => {
    const subject = (s.task_id && taskById(s.task_id)?.subject) || '自由专注';
    bySubject.set(subject, (bySubject.get(subject) || 0) + Number(s.minutes));
  });
  const distribution = document.getElementById('subject-distribution');
  distribution.replaceChildren();
  const entries = [...bySubject.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'view-empty';
    empty.textContent = '完成第一轮专注后，这里会展示你的学科投入。';
    distribution.append(empty);
  }
  entries.forEach(([subject, value]) => {
    const percent = Math.round(value / totalMinutes() * 100);
    const row = document.createElement('div');
    row.className = 'subject-row';
    row.innerHTML = '<b></b><div class="subject-bar"><i></i></div><span></span>';
    row.querySelector('b').textContent = subject;
    row.querySelector('i').style.width = `${percent}%`;
    row.querySelector('span').textContent = `${value} 分钟 · ${percent}%`;
    distribution.append(row);
  });

  // 本周 vs 上周
  const prevStart = new Date(days[0]);
  prevStart.setDate(prevStart.getDate() - 7);
  const prev = sessions.filter((s) => { const d = new Date(s.started_at); return d >= prevStart && d < new Date(days[0].toDateString()); });
  const prevMinutes = prev.reduce((sum, s) => sum + Number(s.minutes), 0);
  const compare = document.getElementById('week-compare');
  compare.replaceChildren();
  const fmt = (label, now, before, unit) => {
    const delta = now - before;
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
    const tone = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    const row = document.createElement('div');
    row.className = 'compare-row';
    row.innerHTML = `<b>${label}</b><div><strong>${now}${unit}</strong><span class="${tone}">${arrow} ${Math.abs(delta)}${unit}</span><small>上周 ${before}${unit}</small></div>`;
    compare.append(row);
  };
  fmt('专注时长', minutes, prevMinutes, ' 分钟');
  fmt('专注轮次', recent.length, prev.length, ' 轮');
  fmt('活跃天数', days.filter((day) => (totals.get(dateKey(day)) || 0) > 0).length, new Set(prev.map((s) => dateKey(new Date(s.started_at)))).size, ' 天');

  // 里程碑徽章
  const badges = document.getElementById('badge-list');
  badges.replaceChildren();
  BUILDINGS.filter((b) => b.kind === 'milestone').forEach((b) => {
    const done = isUnlocked(b.type) || b.check(totalMinutes(), builtCount(), streakDays());
    const cell = document.createElement('div');
    cell.className = `badge${done ? ' done' : ''}`;
    cell.innerHTML = `<span></span><b></b><small></small>`;
    cell.querySelector('span').textContent = b.emoji;
    cell.querySelector('b').textContent = b.name;
    cell.querySelector('small').textContent = done ? '已达成' : b.desc;
    badges.append(cell);
  });
}

function renderTimer() {
  const time = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  document.getElementById('timer-display').textContent = time;
  document.getElementById('timer-toggle').textContent = interval ? '暂停专注' : remaining < focusMinutes * 60 ? '继续专注' : '开始专注';
  const ring = Math.min(1, remaining / 3600);
  document.querySelectorAll('.timer-face').forEach((face) => face.style.setProperty('--ring', ring.toFixed(4)));
  const hero = document.getElementById('start-focus');
  const started = interval || remaining < focusMinutes * 60;
  hero.disabled = Boolean(interval);
  hero.textContent = interval ? `⏳ 专注中 · 剩 ${time}` : started ? '继续专注 ↗' : `开始 ${focusMinutes} 分钟专注 ↗`;
  document.getElementById('bound-task').disabled = Boolean(interval);
  document.getElementById('building-select').disabled = Boolean(interval);
  document.querySelectorAll('[data-duration-picker] button').forEach((button) => { button.disabled = Boolean(interval); });
}

function setDuration(minutes) {
  focusMinutes = minutes;
  remaining = minutes * 60;
  document.querySelectorAll('[data-duration-picker] button').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.minutes) === minutes);
  });
  renderTimer();
}

function renderSessionList() {
  const history = document.getElementById('session-list');
  history.replaceChildren();
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const recent = sessions.filter((s) => new Date(s.started_at) >= since);
  document.getElementById('focus-total').textContent = recent.reduce((sum, s) => sum + Number(s.minutes), 0);
  document.getElementById('focus-session-count').textContent = recent.length;
  if (!recent.length) {
    const empty = document.createElement('div');
    empty.className = 'view-empty';
    empty.textContent = '完成第一轮专注后，记录会出现在这里。';
    history.append(empty);
    return;
  }
  recent.slice(-6).reverse().forEach((session) => {
    const task = session.task_id ? taskById(session.task_id) : null;
    const row = document.createElement('div');
    row.className = 'session-row';
    row.innerHTML = '<span class="session-dot">✓</span><div><strong></strong><small></small></div><b></b>';
    row.querySelector('strong').textContent = task ? task.title : '自由专注';
    row.querySelector('small').textContent = new Date(session.started_at).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    row.querySelector('b').textContent = `${session.minutes} 分钟`;
    history.append(row);
  });
}

function renderBars() {
  renderReview();
  renderSessionList();
  renderIsland();
}

async function saveBuilding(status, sessionId, minutes) {
  const task = currentTaskId ? taskById(currentTaskId) : null;
  const subject = task ? task.subject : '自由专注';
  const building = { id: newId(), session_id: sessionId, subject, building_type: selectedBuilding().type, status, created_at: new Date().toISOString(), minutes: minutes || 0 };
  await sql('INSERT INTO island_buildings (id, workspace_id, session_id, subject, building_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [building.id, WORKSPACE, building.session_id, building.subject, building.building_type, building.status, building.created_at]);
  buildings.push(building);
  return building;
}

function toggleTimer() {
  if (interval) {
    clearInterval(interval);
    interval = null;
    renderTimer();
    return;
  }
  interval = setInterval(async () => {
    remaining -= 1;
    renderTimer();
    if (remaining > 0) return;
    clearInterval(interval);
    interval = null;
    remaining = focusMinutes * 60;
    renderTimer();
    try {
      const session = { id: newId(), started_at: new Date(Date.now() - focusMinutes * 60_000).toISOString(), minutes: focusMinutes, task_id: currentTaskId };
      await sql('INSERT INTO study_sessions (id, workspace_id, started_at, minutes, task_id) VALUES (?, ?, ?, ?, ?)', [session.id, WORKSPACE, session.started_at, session.minutes, session.task_id]);
      sessions.push(session);
      await saveBuilding('built', session.id, focusMinutes);
      await checkMilestones();
      renderBars();
      renderTasks();
      toast(`✦ 完成了 ${focusMinutes} 分钟专注，岛上多了一座「${selectedBuilding().name}」！`);
    } catch (error) { toast(`专注记录未保存：${error.message}`); }
  }, 1000);
  renderTimer();
}

async function resetTimer() {
  const wasRunning = Boolean(interval);
  clearInterval(interval);
  interval = null;
  remaining = focusMinutes * 60;
  renderTimer();
  if (!wasRunning) return;
  try {
    await saveBuilding('ruined', null, 0);
    renderBars();
    toast('🚧 这一轮中途停下了，工地上留下了一处脚手架。');
  } catch (error) { toast(error.message); }
}

async function start() {
  try {
    await ensureSchema();
    displayName = (await sql('SELECT display_name FROM study_profile WHERE workspace_id = ?', [WORKSPACE])).rows[0]?.display_name || '';
    renderProfile();
    tasks = (await sql('SELECT id, title, subject, estimated_minutes, done_at FROM study_tasks WHERE workspace_id = ? ORDER BY rowid', [WORKSPACE])).rows;
    sessions = (await sql('SELECT id, started_at, minutes, task_id FROM study_sessions WHERE workspace_id = ? ORDER BY started_at', [WORKSPACE])).rows;
    buildings = (await sql('SELECT id, subject, building_type, status, created_at, session_id FROM island_buildings WHERE workspace_id = ? ORDER BY created_at', [WORKSPACE])).rows.map((row) => ({ ...row, minutes: Number(sessions.find((s) => s.id === row.session_id)?.minutes) || 0 }));
    unlocksCache = (await sql('SELECT tree_type, cost FROM island_unlocks WHERE workspace_id = ?', [WORKSPACE])).rows;
    await checkMilestones();
    const today = new Date();
    const longDate = today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
    document.querySelector('.top-right span').textContent = longDate;
    document.querySelector('.eyebrow').textContent = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
    renderTasks();
    renderBars();
    renderBuildingOptions();
  } catch (error) { toast(`数据加载失败：${error.message}`); }
}

function renderProfile() {
  document.getElementById('profile-avatar').textContent = displayName ? displayName[0] : '✦';
  document.getElementById('profile-label').textContent = displayName || '设置名称';
  document.getElementById('greeting').textContent = displayName ? `你好，${displayName}。岛屿正在等你。` : '今天，从一座岛开始。✦';
}

async function addTask({ title, subject, estimated_minutes }) {
  const task = { id: newId(), title, subject, estimated_minutes, done_at: null };
  await sql('INSERT INTO study_tasks (id, workspace_id, title, subject, estimated_minutes) VALUES (?, ?, ?, ?, ?)', [task.id, WORKSPACE, title, subject, estimated_minutes]);
  tasks.push(task);
  renderTasks();
  toast('任务已加入学习清单');
}

function openTaskModal() {
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('task-name').focus();
}
document.getElementById('add-task').onclick = openTaskModal;
document.getElementById('cancel').onclick = () => document.getElementById('modal').classList.add('hidden');
document.getElementById('modal').onclick = (event) => { if (event.target.id === 'modal') event.currentTarget.classList.add('hidden'); };
document.getElementById('save-task').onclick = async () => {
  const title = document.getElementById('task-name').value.trim();
  if (!title) return;
  try {
    await addTask({ title, subject: document.getElementById('task-subject').value, estimated_minutes: 25 });
    document.getElementById('task-name').value = '';
    document.getElementById('modal').classList.add('hidden');
  } catch (error) { toast(error.message); }
};
document.getElementById('profile-trigger').onclick = () => {
  document.getElementById('profile-name').value = displayName;
  document.getElementById('profile-modal').classList.remove('hidden');
  document.getElementById('profile-name').focus();
};
document.getElementById('profile-cancel').onclick = () => document.getElementById('profile-modal').classList.add('hidden');
document.getElementById('profile-modal').onclick = (event) => { if (event.target.id === 'profile-modal') event.currentTarget.classList.add('hidden'); };
document.getElementById('profile-save').onclick = async () => {
  const name = document.getElementById('profile-name').value.trim();
  if (!name) return;
  try {
    await sql('INSERT INTO study_profile (workspace_id, display_name) VALUES (?, ?) ON CONFLICT(workspace_id) DO UPDATE SET display_name = excluded.display_name', [WORKSPACE, name]);
    displayName = name;
    renderProfile();
    document.getElementById('profile-modal').classList.add('hidden');
    toast('名称已保存');
  } catch (error) { toast(error.message); }
};
function showView(name) {
  activeView = name;
  document.querySelectorAll('[data-nav]').forEach((button) => {
    const active = button.dataset.nav === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    if (active) document.getElementById('crumb').textContent = button.textContent.trim();
  });
  document.querySelectorAll('.view-screen').forEach((screen) => screen.classList.toggle('hidden', screen.id !== `${name}-view`));
  window.scrollTo({ top: 0, behavior: 'instant' });
}
document.querySelectorAll('[data-nav]').forEach((button) => button.onclick = () => showView(button.dataset.nav));
document.querySelectorAll('[data-task-filter]').forEach((button) => button.onclick = () => {
  taskFilter = button.dataset.taskFilter;
  document.querySelectorAll('[data-task-filter]').forEach((entry) => entry.classList.toggle('active', entry === button));
  renderTaskList();
});
function renderTaskList() {
  const list = document.getElementById('task-list');
  list.replaceChildren();
  const visible = tasks.filter((task) => taskFilter === 'all' || (taskFilter === 'done' ? task.done_at : !task.done_at));
  const focused = focusedByTask();
  if (!tasks.length && taskFilter === 'all') renderSuggestions(list);
  else if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'view-empty';
    empty.textContent = taskFilter === 'done' ? '还没有完成的任务。完成一项后会显示在这里。' : '当前没有待完成任务。写下下一步，继续前进。';
    list.append(empty);
  } else visible.forEach((task) => list.append(taskRow(task, focused.get(task.id) || 0)));
  const doneCount = tasks.filter((task) => task.done_at).length;
  document.querySelector('[data-task-filter="all"]').textContent = `全部 ${tasks.length}`;
  document.querySelector('[data-task-filter="open"]').textContent = `待完成 ${tasks.length - doneCount}`;
  document.querySelector('[data-task-filter="done"]').textContent = `已完成 ${doneCount}`;
}
document.getElementById('timer-toggle').onclick = toggleTimer;
document.getElementById('timer-reset').onclick = resetTimer;
document.getElementById('building-select').onchange = () => {
  localStorage.setItem('island_building', document.getElementById('building-select').value);
};
document.getElementById('bound-task').onchange = () => {
  currentTaskId = document.getElementById('bound-task').value || null;
};
document.querySelectorAll('[data-duration-picker] button').forEach((button) => button.onclick = () => {
  if (interval) { toast('专注进行中，先暂停或重置再调整时长。'); return; }
  setDuration(Number(button.dataset.minutes));
});
document.getElementById('start-focus').onclick = () => {
  if (!interval) toggleTimer();
};
document.getElementById('review-start-focus').onclick = () => showView('today');

setDuration(25);
showView(activeView);
start();
