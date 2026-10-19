import markup from "./markup.html?raw";
import "./style.css";
import "./load-style.js";
import { sql } from "./db.js";
import { newId } from "./id.js";
document.getElementById("app").innerHTML = markup;
let sessions = [],
  buildings = [],
  remaining = 1500,
  endAt = 0;
const APP_KEY = window.tiana.appId || location.pathname;
const TIMER_STORAGE_KEY = `island_timer:${APP_KEY}`;
const BUILDING_STORAGE_KEY = `island_building:${APP_KEY}`;
let timerInterval = null,
  focusMinutes = 25,
  focusTag = "学习",
  focusTitle = "",
  displayName = "",
  activeView = "today";
const WORKSPACE = "main",
  TAGS = ["学习", "工作", "阅读", "运动", "其他"],
  BUILDINGS = [{
    type: "bench",
    emoji: "🪑",
    name: "林间长椅",
    cost: 0,
    kind: "free"
  }, {
    type: "flower",
    emoji: "🌷",
    name: "花坛",
    cost: 0,
    kind: "free"
  }, {
    type: "lantern",
    emoji: "🏮",
    name: "石灯",
    cost: 0,
    kind: "free"
  }, {
    type: "tent",
    emoji: "⛺",
    name: "帐篷营地",
    cost: 0,
    kind: "free"
  }, {
    type: "cabin",
    emoji: "🏠",
    name: "小书房",
    cost: 0,
    kind: "free"
  }, {
    type: "cafe",
    emoji: "☕",
    name: "咖啡馆",
    cost: 600,
    kind: "coin"
  }, {
    type: "bookshop",
    emoji: "📚",
    name: "独立书店",
    cost: 900,
    kind: "coin"
  }, {
    type: "observ",
    emoji: "🔭",
    name: "天文台",
    cost: 1500,
    kind: "coin"
  }, {
    type: "lighthouse",
    emoji: "🗼",
    name: "灯塔",
    cost: 2e3,
    kind: "coin"
  }, {
    type: "library",
    emoji: "🏛️",
    name: "大图书馆",
    cost: 2600,
    kind: "coin"
  }, {
    type: "monument",
    emoji: "🗿",
    name: "十小时纪念碑",
    cost: 0,
    kind: "milestone",
    desc: "累计专注满 10 小时",
    check: e => e >= 600
  }, {
    type: "castle",
    emoji: "🏰",
    name: "学习城堡",
    cost: 0,
    kind: "milestone",
    desc: "岛上建筑满 30 座",
    check: (e, t) => t >= 30
  }, {
    type: "wheel",
    emoji: "🎡",
    name: "心游乐园",
    cost: 0,
    kind: "milestone",
    desc: "连续专注 7 天",
    check: (e, t, n) => n >= 7
  }],
  FREE_TYPES = BUILDINGS.filter(e => e.kind === "free").map(e => e.type);
function toast(e) {
  const t = document.getElementById("toast");
  t.textContent = e, t.classList.remove("hidden"), clearTimeout(window.studyToastTimer), window.studyToastTimer = setTimeout(() => t.classList.add("hidden"), 3e3);
}
async function ensureSchema() {
  await sql(`CREATE TABLE IF NOT EXISTS island_buildings (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, session_id TEXT,
    subject TEXT NOT NULL, building_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'built', created_at TEXT NOT NULL)`), await sql(`CREATE TABLE IF NOT EXISTS island_unlocks (
    workspace_id TEXT NOT NULL, tree_type TEXT PRIMARY KEY,
    cost INTEGER NOT NULL, unlocked_at TEXT NOT NULL)`);
  try {
    await sql("ALTER TABLE study_sessions ADD COLUMN task_id TEXT");
  } catch {}
  try {
    await sql("ALTER TABLE study_sessions ADD COLUMN title TEXT");
  } catch {}
  try {
    await sql("ALTER TABLE study_sessions ADD COLUMN tag TEXT");
  } catch {}
}
const totalMinutes = () => sessions.reduce((e, t) => e + Number(t.minutes), 0),
  builtCount = () => buildings.filter(e => e.status === "built").length,
  spentCoins = () => unlockedTypes().reduce((e, t) => e + Number(t.cost), 0),
  coins = () => Math.max(0, totalMinutes() - spentCoins());
let unlocksCache = [];
function unlockedTypes() {
  return unlocksCache;
}
function isUnlocked(e) {
  return FREE_TYPES.includes(e) || unlocksCache.some(t => t.tree_type === e);
}
function dateKey(e) {
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
}
function streakDays() {
  const e = new Set(sessions.map(s => dateKey(new Date(s.started_at))));
  let t = 0;
  const n = new Date();
  for (e.has(dateKey(n)) || n.setDate(n.getDate() - 1); e.has(dateKey(n));) t += 1, n.setDate(n.getDate() - 1);
  return t;
}
function renderTodaySummary() {
  const e = dateKey(new Date()),
    t = sessions.filter(s => dateKey(new Date(s.started_at)) === e).reduce((s, a) => s + Number(a.minutes), 0);
  document.getElementById("today-minutes").textContent = t;
  const n = streakDays();
  document.getElementById("encourage").textContent = t ? `🔥 连续专注 ${n} 天` : "美好的一天，从第一步开始", document.getElementById("review-task-count").textContent = sessions.length;
}
function renderBuildingOptions() {
  const e = document.getElementById("building-select");
  e.replaceChildren(), BUILDINGS.filter(n => n.kind !== "milestone" && isUnlocked(n.type)).forEach(n => {
    const s = document.createElement("option");
    s.value = n.type, s.textContent = `${n.emoji} ${n.name}`, e.append(s);
  });
  const t = localStorage.getItem(BUILDING_STORAGE_KEY);
  t && isUnlocked(t) && (e.value = t);
}
function selectedBuilding() {
  return BUILDINGS.find(e => e.type === document.getElementById("building-select").value) || BUILDINGS[0];
}
function renderIsland() {
  document.getElementById("island-built").textContent = builtCount(), document.getElementById("island-minutes").textContent = totalMinutes(), document.getElementById("island-coins").textContent = coins();
  const e = streakDays();
  document.getElementById("island-streak").textContent = e, document.getElementById("review-streak").textContent = e;
  const t = document.getElementById("island-districts");
  t.replaceChildren();
  const n = [...TAGS, "自由专注"],
    s = new Map();
  buildings.forEach(o => {
    s.has(o.subject) || s.set(o.subject, []), s.get(o.subject).push(o);
  });
  const a = [...n.filter(o => s.has(o)), ...[...s.keys()].filter(o => !n.includes(o))];
  if (!a.length) {
    const o = document.createElement("div");
    o.className = "island-empty", o.innerHTML = "<b>岛上还空空的 ✦</b><span>去「今日」完成第一轮专注，落下第一座建筑。</span>", t.append(o);
  }
  a.forEach(o => {
    const i = document.createElement("div");
    i.className = "district";
    const d = s.get(o),
      h = d.filter(l => l.status === "built").length;
    i.innerHTML = `<div class="district-head"><b></b><span>${h} 座 · 共 ${Math.round(d.reduce((l, u) => l + (u.minutes || 0), 0))} 分钟</span></div><div class="district-grid"></div>`, i.querySelector(".district-head b").textContent = o;
    const m = i.querySelector(".district-grid");
    d.forEach(l => {
      const u = BUILDINGS.find(w => w.type === l.building_type),
        y = document.createElement("div");
      y.className = `building${l.status === "ruined" ? " ruined" : ""}`, y.title = l.status === "ruined" ? `${new Date(l.created_at).toLocaleString("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })} 中途放弃的工地` : `${u ? u.name : l.building_type} · ${new Date(l.created_at).toLocaleString("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      })}${l.minutes ? ` · ${l.minutes} 分钟` : ""}`, y.textContent = l.status === "ruined" ? "🚧" : u ? u.emoji : "🏠", y.onclick = () => showBuildingDetails(l, u), m.append(y);
    }), t.append(i);
  }), renderCatalog();
}
function showBuildingDetails(e, t) {
  const n = e.status === "ruined";
  document.getElementById("bd-emoji").textContent = n ? "🚧" : t ? t.emoji : "🏠", document.getElementById("bd-name").textContent = n ? "工地废墟" : t ? t.name : e.building_type, document.getElementById("bd-status").textContent = n ? "这一轮专注中途停下了" : "为岛上添的一座建筑", document.getElementById("bd-time").textContent = new Date(e.created_at).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }), document.getElementById("bd-tag").textContent = e.subject || "自由专注";
  const s = sessions.find(a => a.id === e.session_id);
  document.getElementById("bd-title").textContent = s && s.title ? s.title : n ? "—" : "未命名专注", document.getElementById("bd-minutes").textContent = e.minutes ? `${e.minutes} 分钟` : "—", document.getElementById("building-modal").classList.remove("hidden");
}
document.getElementById("bd-close").onclick = () => document.getElementById("building-modal").classList.add("hidden");
document.getElementById("building-modal").onclick = e => {
  e.target.id === "building-modal" && e.currentTarget.classList.add("hidden");
};
function renderCatalog() {
  const e = document.getElementById("catalog-list");
  e.replaceChildren();
  const t = new Map();
  buildings.filter(n => n.status === "built").forEach(n => t.set(n.building_type, (t.get(n.building_type) || 0) + 1)), BUILDINGS.forEach(n => {
    const s = isUnlocked(n.type),
      a = document.createElement("div");
    if (a.className = `catalog-row${s ? "" : " locked"}`, n.kind === "milestone") {
      const o = s || n.check && n.check(totalMinutes(), builtCount(), streakDays());
      a.innerHTML = `<span class="catalog-emoji"></span><div><b></b><small></small></div>${o ? '<span class="catalog-state">✓ 已点亮</span>' : '<span class="catalog-state pending">未达成</span>'}`, a.querySelector("small").textContent = n.desc;
    } else {
      a.innerHTML = `<span class="catalog-emoji"></span><div><b></b><small></small></div>${s ? '<span class="catalog-state">可选</span>' : `<button class="unlock">🪙 ${n.cost} 解锁</button>`}`, a.querySelector("small").textContent = n.kind === "free" ? "基础建筑 · 免费使用" : `稀有建筑 · 价值 ${n.cost} 金币`;
      const o = a.querySelector(".unlock");
      o && (o.onclick = () => unlockBuilding(n));
    }
    a.querySelector(".catalog-emoji").textContent = n.emoji, a.querySelector("b").textContent = `${n.name}${t.get(n.type) ? ` × ${t.get(n.type)}` : ""}`, e.append(a);
  });
}
async function unlockBuilding(e) {
  if (coins() < e.cost) {
    toast(`金币不够，还差 ${e.cost - coins()} 枚。多专注一会儿就攒够了。`);
    return;
  }
  try {
    await sql("INSERT INTO island_unlocks (workspace_id, tree_type, cost, unlocked_at) VALUES (?, ?, ?, ?)", [WORKSPACE, e.type, e.cost, (new Date()).toISOString()]), unlocksCache.push({
      tree_type: e.type,
      cost: e.cost
    }), renderIsland(), renderBuildingOptions(), toast(`🎉「${e.name}」蓝图解锁！下次专注就能动工了。`);
  } catch (t) {
    toast(t.message);
  }
}
async function checkMilestones() {
  for (const e of BUILDINGS.filter(t => t.kind === "milestone")) if (!isUnlocked(e.type) && e.check(totalMinutes(), builtCount(), streakDays())) try {
    await sql("INSERT INTO island_unlocks (workspace_id, tree_type, cost, unlocked_at) VALUES (?, ?, ?, ?)", [WORKSPACE, e.type, 0, (new Date()).toISOString()]), unlocksCache.push({
      tree_type: e.type,
      cost: 0
    }), toast(`🏆 里程碑达成：「${e.name}」已在岛上点亮！`);
  } catch {}
}
function renderReview() {
  const e = new Map();
  sessions.forEach(c => {
    const f = dateKey(new Date(c.started_at));
    e.set(f, (e.get(f) || 0) + Number(c.minutes));
  });
  const t = new Date(),
    n = Array.from({
      length: 7
    }, (c, f) => {
      const g = new Date(t);
      return g.setDate(t.getDate() - 6 + f), g;
    }),
    s = Math.max(180, ...e.values()),
    a = document.getElementById("review-bars");
  a.replaceChildren(), n.forEach((c, f) => {
    const g = document.createElement("div");
    g.className = "bar-group";
    const E = document.createElement("div");
    E.className = `bar${f === 6 ? " today" : ""}`, E.style.height = `${Math.max(6, Math.round((e.get(dateKey(c)) || 0) / s * 115))}px`;
    const L = document.createElement("span");
    L.textContent = `周${"日一二三四五六"[c.getDay()]}`, g.append(E, L), a.append(g);
  });
  const o = sessions.filter(c => new Date(c.started_at) >= new Date(n[0].toDateString())),
    i = o.reduce((c, f) => c + Number(f.minutes), 0);
  document.getElementById("review-hours").textContent = (i / 60).toFixed(1), document.getElementById("review-days").textContent = n.filter(c => (e.get(dateKey(c)) || 0) > 0).length, document.getElementById("review-note").textContent = i ? "哪天更容易进入状态？照着自己的节奏安排下一轮。" : "第一段专注完成后，这里会画出你的学习节奏。", document.getElementById("review-total-hours").textContent = (totalMinutes() / 60).toFixed(1);
  const d = new Map();
  sessions.forEach(c => {
    const f = c.tag || "自由专注";
    d.set(f, (d.get(f) || 0) + Number(c.minutes));
  });
  const h = document.getElementById("subject-distribution");
  h.replaceChildren();
  const m = [...d.entries()].sort((c, f) => f[1] - c[1]);
  if (!m.length) {
    const c = document.createElement("p");
    c.className = "view-empty", c.textContent = "完成第一轮专注后，这里会展示你的学科投入。", h.append(c);
  }
  m.forEach(([c, f]) => {
    const g = Math.round(f / totalMinutes() * 100),
      E = document.createElement("div");
    E.className = "subject-row", E.innerHTML = '<b></b><div class="subject-bar"><i></i></div><span></span>', E.querySelector("b").textContent = c, E.querySelector("i").style.width = `${g}%`, E.querySelector("span").textContent = `${f} 分钟 · ${g}%`, h.append(E);
  });
  const l = new Date(n[0]);
  l.setDate(l.getDate() - 7);
  const u = sessions.filter(c => {
      const f = new Date(c.started_at);
      return f >= l && f < new Date(n[0].toDateString());
    }),
    y = u.reduce((c, f) => c + Number(f.minutes), 0),
    w = document.getElementById("week-compare");
  w.replaceChildren();
  const S = (c, f, g, E) => {
    const L = f - g,
      R = L > 0 ? "▲" : L < 0 ? "▼" : "—",
      p = L > 0 ? "up" : L < 0 ? "down" : "",
      F = document.createElement("div");
    F.className = "compare-row", F.innerHTML = `<b>${c}</b><div><strong>${f}${E}</strong><span class="${p}">${R} ${Math.abs(L)}${E}</span><small>上周 ${g}${E}</small></div>`, w.append(F);
  };
  S("专注时长", i, y, " 分钟"), S("专注轮次", o.length, u.length, " 轮"), S("活跃天数", n.filter(c => (e.get(dateKey(c)) || 0) > 0).length, new Set(u.map(c => dateKey(new Date(c.started_at)))).size, " 天");
  const k = document.getElementById("badge-list");
  k.replaceChildren(), BUILDINGS.filter(c => c.kind === "milestone").forEach(c => {
    const f = isUnlocked(c.type) || c.check(totalMinutes(), builtCount(), streakDays()),
      g = document.createElement("div");
    g.className = `badge${f ? " done" : ""}`, g.innerHTML = "<span></span><b></b><small></small>", g.querySelector("span").textContent = c.emoji, g.querySelector("b").textContent = c.name, g.querySelector("small").textContent = f ? "已达成" : c.desc, k.append(g);
  });
}
function renderTimer() {
  timerInterval && (remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1e3)));
  const e = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  document.getElementById("timer-display").textContent = e, document.getElementById("timer-toggle").textContent = timerInterval ? "暂停专注" : remaining < focusMinutes * 60 ? "继续专注" : "开始专注";
  const t = Math.min(1, remaining / 3600);
  document.querySelectorAll(".timer-face").forEach(a => a.style.setProperty("--ring", t.toFixed(4)));
  const n = !!timerInterval || remaining < focusMinutes * 60,
    s = document.getElementById("start-focus");
  s.disabled = !!timerInterval, s.textContent = timerInterval ? `⏳ 专注中 · 剩 ${e}` : n ? "继续专注 ↗" : "开始专注 ⛏", document.getElementById("timer-stop").classList.toggle("hidden", !n), renderFocusNow(n);
}
function renderFocusNow(e) {
  const t = document.getElementById("focus-now");
  if (!e) {
    t.style.display = "none";
    return;
  }
  t.style.display = "flex";
  const n = selectedBuilding(),
    s = timerInterval ? "专注中" : "已暂停";
  t.innerHTML = '<span class="focus-tag"></span><div class="focus-now-main"><b></b><small></small></div><span class="focus-state"></span>', t.querySelector(".focus-tag").textContent = focusTag, t.querySelector(".focus-now-main b").textContent = focusTitle || "未命名的专注", t.querySelector(".focus-now-main small").textContent = `${n.emoji} ${n.name} · ${focusMinutes} 分钟`, t.querySelector(".focus-state").textContent = s;
}
function setDuration(e) {
  focusMinutes = e, remaining = e * 60, document.querySelectorAll("[data-duration-picker] button").forEach(t => {
    t.classList.toggle("active", Number(t.dataset.minutes) === e);
  }), renderTimer();
}
function renderSessionList() {
  const e = document.getElementById("session-list");
  e.replaceChildren();
  const t = new Date();
  t.setDate(t.getDate() - 7);
  const n = sessions.filter(s => new Date(s.started_at) >= t);
  if (document.getElementById("focus-total").textContent = n.reduce((s, a) => s + Number(a.minutes), 0), document.getElementById("focus-session-count").textContent = n.length, !n.length) {
    const s = document.createElement("div");
    s.className = "view-empty", s.textContent = "完成第一轮专注后，记录会出现在这里。", e.append(s);
    return;
  }
  n.slice(-6).reverse().forEach(s => {
    const a = document.createElement("div");
    a.className = "session-row", a.innerHTML = '<span class="session-dot">✓</span><div><strong></strong><small></small></div><b></b>', a.querySelector("strong").textContent = s.title || "自由专注", a.querySelector("small").innerHTML = "";
    const o = new Date(s.started_at).toLocaleString("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }),
      i = document.createElement("span");
    i.className = "session-tag", i.textContent = s.tag || "自由专注", a.querySelector("small").append(document.createTextNode(o + " · "), i), a.querySelector("b").textContent = `${s.minutes} 分钟`, e.append(a);
  });
}
function renderAll() {
  renderReview(), renderSessionList(), renderIsland(), renderWeekMini();
}
function renderWeekMini() {
  const e = document.getElementById("week-mini-bars");
  if (!e) return;
  const t = new Map();
  sessions.forEach(d => {
    const h = dateKey(new Date(d.started_at));
    t.set(h, (t.get(h) || 0) + Number(d.minutes));
  });
  const n = new Date(),
    s = new Date(n);
  s.setDate(n.getDate() - (n.getDay() + 6) % 7), s.setHours(0, 0, 0, 0);
  const a = Array.from({
      length: 7
    }, (d, h) => {
      const m = new Date(s);
      return m.setDate(s.getDate() + h), m;
    }),
    o = Math.max(60, ...a.map(d => t.get(dateKey(d)) || 0));
  e.replaceChildren(), a.forEach(d => {
    const h = dateKey(d) === dateKey(n),
      m = document.createElement("div");
    m.className = `bar-group${h ? " today" : ""}`;
    const l = document.createElement("div");
    l.className = "bar";
    const u = t.get(dateKey(d)) || 0;
    l.style.height = `${u ? Math.max(8, Math.round(u / o * 60)) : 6}px`, l.title = u ? `${(u / 60).toFixed(1)} 小时` : "这天还没有专注";
    const y = document.createElement("span");
    y.textContent = h ? "今天" : `周${"日一二三四五六"[d.getDay()]}`, m.append(l, y), e.append(m);
  });
  const i = a.reduce((d, h) => d + (t.get(dateKey(h)) || 0), 0);
  document.getElementById("week-mini-note").textContent = i ? `本周共 ${(i / 60).toFixed(1)} 小时 · 继续 ⛵` : "每天进步一点";
}
async function saveBuilding(e, t, n) {
  const s = {
    id: newId(),
    session_id: t,
    subject: focusTag,
    building_type: selectedBuilding().type,
    status: e,
    created_at: (new Date()).toISOString(),
    minutes: n || 0
  };
  return await sql("INSERT INTO island_buildings (id, workspace_id, session_id, subject, building_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [s.id, WORKSPACE, s.session_id, s.subject, s.building_type, s.status, s.created_at]), buildings.push(s), s;
}
function persistTimer() {
  localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify({
    running: !!timerInterval,
    endAt: endAt,
    remaining: remaining,
    focusMinutes: focusMinutes,
    tag: focusTag,
    title: focusTitle,
    building: document.getElementById("building-select").value
  }));
}
async function completeFocus(e) {
  try {
    const t = {
      id: newId(),
      started_at: new Date(e).toISOString(),
      minutes: focusMinutes,
      title: focusTitle,
      tag: focusTag
    };
    await sql("INSERT INTO study_sessions (id, workspace_id, started_at, minutes, task_id, title, tag) VALUES (?, ?, ?, ?, ?, ?, ?)", [t.id, WORKSPACE, t.started_at, t.minutes, null, t.title, t.tag]), sessions.push(t), await saveBuilding("built", t.id, focusMinutes), await checkMilestones(), renderAll(), renderTodaySummary(), toast(`✦ 完成了 ${focusMinutes} 分钟专注，岛上多了一座「${selectedBuilding().name}」！`);
  } catch (t) {
    toast(`专注记录未保存：${t.message}`);
  }
}
function tickTimer() {
  if (remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1e3)), renderTimer(), remaining > 0) return;
  clearInterval(timerInterval), timerInterval = null;
  const e = endAt - focusMinutes * 6e4;
  endAt = 0, remaining = focusMinutes * 60, renderTimer(), localStorage.removeItem(TIMER_STORAGE_KEY), completeFocus(e);
}
function toggleTimer() {
  if (timerInterval) {
    clearInterval(timerInterval), timerInterval = null, remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1e3)), endAt = 0, persistTimer(), renderTimer();
    return;
  }
  endAt = Date.now() + remaining * 1e3, timerInterval = setInterval(tickTimer, 500), persistTimer(), renderTimer();
}
function restoreTimer() {
  let e;
  try {
    e = JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY) || "null");
  } catch {
    e = null;
  }
  if (e) {
    if (focusMinutes = e.focusMinutes || focusMinutes, focusTag = e.tag || focusTag, focusTitle = e.title || "", e.building) {
      const t = document.getElementById("building-select");
      [...t.options].some(n => n.value === e.building) && (t.value = e.building);
    }
    if (document.querySelectorAll("[data-duration-picker] button").forEach(t => {
      t.classList.toggle("active", Number(t.dataset.minutes) === focusMinutes);
    }), e.running && e.endAt > Date.now()) endAt = e.endAt, remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1e3)), timerInterval = setInterval(tickTimer, 500);else if (e.running) {
      const t = e.endAt - focusMinutes * 6e4;
      localStorage.removeItem(TIMER_STORAGE_KEY), completeFocus(t);
    } else remaining = Math.max(0, e.remaining ?? focusMinutes * 60), persistTimer();
    renderTimer();
  }
}
document.addEventListener("visibilitychange", () => {
  !document.hidden && timerInterval && tickTimer();
});
async function stopTimer() {
  const e = !!timerInterval || endAt > 0;
  if (clearInterval(timerInterval), timerInterval = null, endAt = 0, remaining = focusMinutes * 60, localStorage.removeItem(TIMER_STORAGE_KEY), renderTimer(), !!e) try {
    await saveBuilding("ruined", null, 0), renderAll(), toast("🚧 这一轮中途停下了，工地上留下了一处脚手架。");
  } catch (t) {
    toast(t.message);
  }
}
async function load() {
  try {
    await ensureSchema(), displayName = (await sql("SELECT display_name FROM study_profile WHERE workspace_id = ?", [WORKSPACE])).rows[0]?.display_name || "", renderProfile(), sessions = (await sql("SELECT id, started_at, minutes, task_id, title, tag FROM study_sessions WHERE workspace_id = ? ORDER BY started_at", [WORKSPACE])).rows, buildings = (await sql("SELECT id, subject, building_type, status, created_at, session_id FROM island_buildings WHERE workspace_id = ? ORDER BY created_at", [WORKSPACE])).rows.map(n => ({
      ...n,
      minutes: Number(sessions.find(s => s.id === n.session_id)?.minutes) || 0
    })), unlocksCache = (await sql("SELECT tree_type, cost FROM island_unlocks WHERE workspace_id = ?", [WORKSPACE])).rows, await checkMilestones();
    const e = new Date(),
      t = e.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    document.querySelector(".top-right span").textContent = t, document.querySelector(".eyebrow").textContent = e.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric"
    }).toUpperCase(), renderTodaySummary(), renderAll(), renderBuildingOptions(), restoreTimer();
  } catch (e) {
    toast(`数据加载失败：${e.message}`);
  }
}
function renderProfile() {
  document.getElementById("profile-avatar").textContent = displayName ? displayName[0] : "✦", document.getElementById("profile-label").textContent = displayName || "设置名称", document.getElementById("greeting").textContent = displayName ? `你好，${displayName}。岛屿正在等你。` : "今天，从一座岛开始。✦";
}
function openFocusModal() {
  timerInterval || (renderTagChips(), document.getElementById("focus-title-input").value = focusTitle, renderBuildingOptions(), document.getElementById("modal").classList.remove("hidden"));
}
function renderTagChips() {
  const e = document.getElementById("tag-chips");
  e.replaceChildren(), TAGS.forEach(t => {
    const n = document.createElement("button");
    n.type = "button", n.className = `tag-chip${t === focusTag ? " active" : ""}`, n.textContent = t, n.onclick = () => {
      focusTag = t, renderTagChips();
    }, e.append(n);
  });
}
document.getElementById("cancel").onclick = () => document.getElementById("modal").classList.add("hidden");
document.getElementById("modal").onclick = e => {
  e.target.id === "modal" && e.currentTarget.classList.add("hidden");
};
document.getElementById("confirm-start").onclick = () => {
  focusTitle = document.getElementById("focus-title-input").value.trim(), localStorage.setItem(BUILDING_STORAGE_KEY, selectedBuilding().type), persistTimer(), document.getElementById("modal").classList.add("hidden"), !timerInterval && remaining >= focusMinutes * 60 ? toggleTimer() : timerInterval || toggleTimer(), renderTimer();
};
document.getElementById("timer-stop").onclick = () => {
  document.getElementById("stop-modal").classList.remove("hidden"), document.getElementById("stop-confirm").focus();
};
document.getElementById("stop-cancel").onclick = () => document.getElementById("stop-modal").classList.add("hidden");
document.getElementById("stop-modal").onclick = e => {
  e.target.id === "stop-modal" && e.currentTarget.classList.add("hidden");
};
document.getElementById("stop-confirm").onclick = () => {
  document.getElementById("stop-modal").classList.add("hidden"), stopTimer();
};
document.getElementById("profile-trigger").onclick = () => {
  document.getElementById("profile-name").value = displayName, document.getElementById("profile-modal").classList.remove("hidden"), document.getElementById("profile-name").focus();
};
document.getElementById("profile-cancel").onclick = () => document.getElementById("profile-modal").classList.add("hidden");
document.getElementById("profile-modal").onclick = e => {
  e.target.id === "profile-modal" && e.currentTarget.classList.add("hidden");
};
document.getElementById("profile-save").onclick = async () => {
  const e = document.getElementById("profile-name").value.trim();
  if (e) try {
    await sql("INSERT INTO study_profile (workspace_id, display_name) VALUES (?, ?) ON CONFLICT(workspace_id) DO UPDATE SET display_name = excluded.display_name", [WORKSPACE, e]), displayName = e, renderProfile(), document.getElementById("profile-modal").classList.add("hidden"), toast("名称已保存");
  } catch (t) {
    toast(t.message);
  }
};
function showView(e) {
  activeView = e, document.querySelectorAll("[data-nav]").forEach(t => {
    const n = t.dataset.nav === e;
    t.classList.toggle("active", n), n ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current"), n && (document.getElementById("crumb").textContent = t.textContent.trim());
  }), document.querySelectorAll(".view-screen").forEach(t => t.classList.toggle("hidden", t.id !== `${e}-view`)), window.scrollTo({
    top: 0,
    behavior: "instant"
  });
}
document.querySelectorAll("[data-nav]").forEach(e => e.onclick = () => showView(e.dataset.nav));
document.getElementById("timer-toggle").onclick = () => {
  timerInterval || remaining < focusMinutes * 60 ? toggleTimer() : openFocusModal();
};
document.getElementById("building-select").onchange = () => {
  localStorage.setItem(BUILDING_STORAGE_KEY, document.getElementById("building-select").value), persistTimer();
};
document.querySelectorAll("[data-duration-picker] button").forEach(e => e.onclick = () => {
  if (timerInterval) {
    toast("专注进行中，先暂停或终止再调整时长。");
    return;
  }
  setDuration(Number(e.dataset.minutes));
});
document.getElementById("start-focus").onclick = () => {
  timerInterval || (remaining < focusMinutes * 60 ? toggleTimer() : openFocusModal());
};
document.getElementById("review-start-focus").onclick = () => showView("today");
setDuration(25);
showView(activeView);
load();
