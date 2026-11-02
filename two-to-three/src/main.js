import markup from './markup.html?raw';
import './style.css';
import './load-style.js';
import { sql } from './db.js';
import { newId } from './id.js';
import weeklyPlans from './week-plans.json';
import supplementsGuide from './supplements.json';
import hospitalBag from './hospital-bag.json';

document.getElementById('app').innerHTML = markup;

const stageNames = { prepare: '备孕准备', early: '孕早期', middle: '孕中期', late: '孕晚期' };
const weekRanges = { prepare: [1, 12], early: [1, 12], middle: [13, 27], late: [28, 40] };
let status = 'prepare'; // 'prepare' 备孕中 | 'pregnant' 已确认怀孕
let lmp = null; // 末次月经第一天 'YYYY-MM-DD'
let prepareDays = 1; // 进入应用以来的天数，用于推进备孕周
let viewPhase = 'prepare'; // 正在浏览的阶段
let viewWeek = 1; // 正在浏览的周
let role = 'all';
let names = { mom: '妈妈', dad: '爸爸' };
let completed = new Set();
let comments = [];
let activeTask = null;
let suppStage = 't1'; // 补剂指南正在查看的阶段
let bagScene = 'hospital'; // 待产包正在查看的场景
let bagChecked = new Set(); // 已勾选的待产包项 `${scene}:${groupIndex}:${itemIndex}`

function toast(message) {
  const element = document.getElementById('reward');
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(window.rewardTimer);
  window.rewardTimer = setTimeout(() => element.classList.add('hidden'), 3300);
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function parseDate(text) {
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtDate(date) {
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

// 依据末次月经自动计算当前孕周、阶段与预产期
function computePregnancy() {
  if (status !== 'pregnant' || !lmp) return null;
  const lmpDate = parseDate(lmp);
  const days = Math.floor((startOfToday() - lmpDate) / 86400000);
  const week = clamp(Math.floor(days / 7) + 1, 1, 40);
  const phase = week <= 12 ? 'early' : week <= 27 ? 'middle' : 'late';
  const due = new Date(lmpDate.getTime() + 280 * 86400000);
  const daysToDue = 280 - days;
  const progress = clamp(Math.round((days / 280) * 100), 2, 100);
  return { week, phase, due, daysToDue, progress };
}

// 系统认定的「当前所在」位置
function currentPoint() {
  if (status === 'pregnant') {
    const p = computePregnancy();
    return { phase: p.phase, week: p.week };
  }
  return { phase: 'prepare', week: clamp(Math.floor(prepareDays / 7) + 1, 1, 12) };
}
function isViewingCurrent() {
  const cur = currentPoint();
  return viewPhase === cur.phase && viewWeek === cur.week;
}

function renderComments() {
  document.getElementById('moments-count').textContent = `${comments.length} 条留言`;
  const list = document.getElementById('moments-comments');
  list.replaceChildren();
  if (!comments.length) {
    const empty = document.createElement('div');
    empty.className = 'comments-empty';
    empty.innerHTML = '<span>♡</span><strong>第一句话，等你们写下</strong><p>记录今天的小期待，留给以后的你们看。</p>';
    list.append(empty);
  }
  comments.forEach((comment) => {
    const item = document.createElement('div');
    item.className = 'comment';
    item.innerHTML = '<span class="avatar"></span><div><b></b><time></time><p></p></div>';
    item.querySelector('.avatar').textContent = comment.author[0];
    item.querySelector('b').textContent = comment.author;
    item.querySelector('time').textContent = new Date(comment.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    item.querySelector('p').textContent = comment.body;
    list.append(item);
  });
}

function renderTaskList(list) {
  const tasks = weeklyPlans[viewPhase][viewWeek].tasks;
  list.replaceChildren();
  tasks.forEach(([who, title, detail], index) => {
    if (role !== 'all' && role !== who) return;
    const taskId = `${viewPhase}-${viewWeek}-${index}`;
    const isDone = completed.has(taskId);
    const item = document.createElement('article');
    item.className = `task${isDone ? ' done' : ''}`;
    item.innerHTML = `<button class="check" aria-label="完成任务">${isDone ? '✓' : ''}</button><div class="task-copy"><div class="task-top"><h3></h3><span class="badge ${who === 'dad' ? 'dad' : ''}">${who === 'dad' ? '爸爸' : '妈妈'}</span></div><p></p></div><button class="comment-btn">写评论 ↗</button>`;
    item.querySelector('h3').textContent = title;
    item.querySelector('p').textContent = detail;
    item.querySelector('.check').onclick = async () => {
      try {
        if (isDone) {
          await sql('DELETE FROM journey_progress WHERE journey_id = ? AND task_id = ?', ['main', taskId]);
          completed.delete(taskId);
          delete completedWhen[taskId];
        } else {
          const at = new Date().toISOString();
          await sql('INSERT INTO journey_progress (journey_id, task_id, completed_at) VALUES (?, ?, ?)', ['main', taskId, at]);
          completed.add(taskId);
          completedWhen[taskId] = at;
          toast('✦ 又完成了一件事，你们真的很棒！');
        }
        render();
      } catch (error) { toast(error.message); }
    };
    item.querySelector('.comment-btn').onclick = () => openModal(taskId, title);
    list.append(item);
  });
}

// Hero 右侧的状态卡：备孕中 / 孕周 + 预产期
function renderStatus() {
  const bar = document.getElementById('due-bar');
  const fill = document.getElementById('due-bar-fill');
  const cta = document.getElementById('pregnancy-cta');
  const edit = document.getElementById('lmp-edit');
  if (status === 'pregnant') {
    const p = computePregnancy();
    document.getElementById('status-big').textContent = `孕 ${p.week} 周`;
    document.getElementById('status-sub').textContent = p.daysToDue >= 0
      ? `预产期 ${fmtDate(p.due)} · 还有 ${p.daysToDue} 天`
      : `预产期 ${fmtDate(p.due)} · 已过 ${-p.daysToDue} 天`;
    document.getElementById('status-foot').textContent = `末次月经 ${lmp} · 具体孕周以产检医生核算为准`;
    bar.classList.remove('hidden');
    fill.style.width = `${p.progress}%`;
    cta.classList.add('hidden');
    edit.classList.remove('hidden');
  } else {
    document.getElementById('status-big').textContent = '备孕中';
    document.getElementById('status-sub').textContent = '照顾好周期和心情，好消息会来的。';
    document.getElementById('status-foot').textContent = `备孕第 ${currentPoint().week} 周 · 一步一步，稳稳地来`;
    bar.classList.add('hidden');
    cta.classList.remove('hidden');
    edit.classList.add('hidden');
  }
}

// 双模式：怀孕后切换青绿/薄荷系主题
function applyMode() {
  document.body.dataset.mode = status === 'pregnant' ? 'pregnant' : 'prepare';
}

// 每周清单里的两处提醒：当周补剂一句话 + 待产包（预产期前一个月起）
function renderReminders() {
  const p = computePregnancy();
  const showSupp = status === 'pregnant' && isViewingCurrent();
  const hint = document.getElementById('supp-hint');
  if (showSupp) {
    const stage = supplementsGuide.stages.find((s) => s.id === (p.phase === 'early' ? 't1' : p.phase === 'middle' ? 't2' : 't3'));
    hint.innerHTML = `<strong>❋ 这一阶段的补剂提醒</strong><p>${stage.items.map((i) => `${i.name} ${i.dose}`).join('；')}。详见左侧「营养补剂」。</p>`;
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
  const remind = !!p && p.daysToDue <= 30; // 预产期前一个月开始
  document.querySelectorAll('.bag-reminder').forEach((banner) => {
    banner.classList.toggle('hidden', !remind);
    if (remind) {
      banner.querySelector('.bag-reminder-text').textContent = `距离预产期还有 ${Math.max(p.daysToDue, 0)} 天，别忘了把入院的东西备齐、放在够得着的地方。`;
      banner.querySelector('.bag-reminder-go').onclick = () => showView('bag');
    }
  });
}

// 旅程时间轴下方的小小奖励里程碑（合并自原「小小奖励」页）
function renderMilestones() {
  const total = completed.size;
  const milestones = [1, 3, 6, 12];
  const labels = ['第一步', '并肩向前', '一周的温柔', '一路相伴'];
  const icons = ['✦', '♡', '❋', '✿'];
  const box = document.getElementById('milestones');
  box.replaceChildren();
  const head = document.createElement('div');
  head.className = 'milestones-head';
  const link = document.createElement('button');
  link.id = 'milestones-link';
  link.innerHTML = `已完成 <b>0</b> 件小事 ›`;
  link.querySelector('b').textContent = total;
  link.title = '查看已完成的事项';
  link.onclick = () => { renderCompleted(); showView('completed'); };
  head.append(link);
  box.append(head);
  const row = document.createElement('div');
  row.className = 'milestones-row';
  milestones.forEach((target, index) => {
    const earned = total >= target;
    const chip = document.createElement('div');
    chip.className = `milestone${earned ? ' earned' : ''}`;
    chip.title = `${target} 件小事 · ${labels[index]}`;
    chip.innerHTML = '<span></span><small></small>';
    chip.querySelector('span').textContent = icons[index];
    chip.querySelector('small').textContent = labels[index];
    row.append(chip);
  });
  box.append(row);
}

// 营养补剂视图
function renderSupplements() {
  const stages = supplementsGuide.stages;
  const p = computePregnancy();
  const currentStageId = !p ? 'prepare' : p.phase === 'early' ? 't1' : p.phase === 'middle' ? 't2' : 't3';
  const bar = document.getElementById('supp-stage');
  bar.replaceChildren();
  stages.forEach((stage) => {
    const button = document.createElement('button');
    button.innerHTML = '<span></span><small></small>';
    button.querySelector('span').textContent = stage.id === currentStageId && status === 'pregnant' ? `${stage.title} · 现在` : stage.title;
    button.querySelector('small').textContent = stage.range;
    if (stage.id === suppStage) button.classList.add('active');
    button.onclick = () => { suppStage = stage.id; renderSupplements(); };
    bar.append(button);
  });
  const stage = stages.find((s) => s.id === suppStage);
  const box = document.getElementById('supp-list');
  box.replaceChildren();
  const note = document.createElement('p');
  note.className = 'supp-note';
  note.textContent = `${stage.range} · ${stage.note}`;
  box.append(note);
  stage.items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'supp-card';
    card.innerHTML = '<div class="supp-card-head"><h3></h3><span class="supp-dose"></span></div><div class="supp-why"><small>为什么</small><p></p></div><div class="supp-how"><small>怎么吃</small><p></p></div>';
    card.querySelector('h3').textContent = item.name;
    card.querySelector('.supp-dose').textContent = item.dose;
    card.querySelector('.supp-why p').textContent = item.why;
    card.querySelector('.supp-how p').textContent = item.how;
    box.append(card);
  });
  const foot = document.createElement('p');
  foot.className = 'supp-disclaimer';
  foot.textContent = supplementsGuide.disclaimer;
  box.append(foot);
}

// 待产包视图
function renderBag() {
  const bar = document.getElementById('bag-scene');
  bar.replaceChildren();
  hospitalBag.scenes.forEach((scene) => {
    const button = document.createElement('button');
    button.textContent = scene.title;
    if (scene.id === bagScene) button.classList.add('active');
    button.onclick = () => { bagScene = scene.id; renderBag(); };
    bar.append(button);
  });
  const scene = hospitalBag.scenes.find((s) => s.id === bagScene);
  const box = document.getElementById('bag-list');
  box.replaceChildren();
  const note = document.createElement('p');
  note.className = 'supp-note';
  note.textContent = scene.note;
  box.append(note);
  let total = 0;
  let done = 0;
  scene.groups.forEach((group, gi) => {
    const section = document.createElement('section');
    section.className = 'bag-group';
    section.innerHTML = '<h3></h3><div class="bag-items"></div>';
    section.querySelector('h3').textContent = group.name;
    const items = section.querySelector('.bag-items');
    group.items.forEach((text, ii) => {
      total += 1;
      const key = `${scene.id}:${gi}:${ii}`;
      const checked = bagChecked.has(key);
      if (checked) done += 1;
      const item = document.createElement('label');
      item.className = `bag-item${checked ? ' done' : ''}`;
      item.innerHTML = '<input type="checkbox"><span></span>';
      const input = item.querySelector('input');
      input.checked = checked;
      item.querySelector('span').textContent = text;
      input.onchange = async () => {
        const next = new Set(bagChecked);
        if (input.checked) next.add(key); else next.delete(key);
        try {
          await sql('INSERT OR REPLACE INTO journey_checklist (id, scene, checked, updated_at) VALUES (?, ?, ?, ?)', ['main', scene.id, JSON.stringify([...next].filter((k) => k.startsWith(`${scene.id}:`))), new Date().toISOString()]);
          bagChecked = next;
          renderBag();
        } catch (error) {
          input.checked = checked;
          toast(error.message);
        }
      };
      items.append(item);
    });
    box.append(section);
  });
  const progress = document.getElementById('bag-progress');
  const pct = total ? Math.round((done / total) * 100) : 0;
  progress.innerHTML = `<div class="bag-progress-bar"><i style="width:${pct}%"></i></div><span>${done} / ${total} 件已备好 · ${pct}%</span>`;
}

function render() {
  const plan = weeklyPlans[viewPhase][viewWeek];
  const tasks = plan.tasks;
  const cur = currentPoint();
  applyMode();
  renderTaskList(document.getElementById('task-list'));
  const count = tasks.filter((_, index) => completed.has(`${viewPhase}-${viewWeek}-${index}`)).length;
  document.getElementById('metric-count').textContent = count;
  document.getElementById('hero-count').textContent = count;
  document.getElementById('week-theme').textContent = plan.theme;
  document.getElementById('week-note').textContent = plan.note;
  document.querySelectorAll('.task-total').forEach((element) => { element.textContent = tasks.length; });
  document.getElementById('stage-name').textContent = stageNames[cur.phase];
  document.getElementById('week-label').textContent = `${viewPhase === 'prepare' ? '备孕' : '怀孕'}第 ${viewWeek} 周`;
  document.querySelector('#journey-view .week-bar div span').textContent = isViewingCurrent() ? '本周计划' : '正在回看';
  document.getElementById('previous-week').disabled = viewWeek <= weekRanges[viewPhase][0];
  document.getElementById('next-week').disabled = viewWeek >= weekRanges[viewPhase][1];
  document.getElementById('back-to-current').classList.toggle('hidden', isViewingCurrent());
  document.querySelector('.hero .overline').textContent = `OUR LITTLE JOURNEY · WEEK ${viewWeek}`;
  // 旅程时间轴：由状态与孕周推导
  const nowIndex = status === 'pregnant' ? (cur.phase === 'late' ? 3 : 2) : 1;
  document.querySelector('.timeline').style.setProperty('--journey-progress', `${nowIndex * 33}%`);
  document.querySelectorAll('.timeline .step').forEach((step, index) => {
    step.classList.toggle('past', index < nowIndex);
    step.classList.toggle('now', index === nowIndex);
    step.querySelector('span').textContent = index < nowIndex ? '已走过' : index === nowIndex ? '现在' : '接下来';
  });
  document.querySelectorAll('[data-phase]').forEach((button) => button.classList.toggle('active', button.dataset.phase === viewPhase));
  document.querySelectorAll('[data-role]').forEach((button) => button.classList.toggle('active', button.dataset.role === role));
  document.getElementById('mom-avatar').textContent = names.mom[0];
  document.getElementById('dad-avatar').textContent = names.dad[0];
  document.querySelector('[data-role="mom"]').textContent = `给${names.mom}`;
  document.querySelector('[data-role="dad"]').textContent = `给${names.dad}`;
  document.querySelector('#comment-author [value="mom"]').textContent = names.mom;
  document.querySelector('#comment-author [value="dad"]').textContent = names.dad;
  renderStatus();
  renderComments();
  renderMilestones();
  renderReminders();
  renderSupplements();
  renderBag();
}

function openModal(taskId = null, title = '') {
  activeTask = taskId;
  document.getElementById('modal-title').textContent = title ? `给「${title}」留句话` : '写下一句话';
  document.getElementById('modal-subtitle').textContent = title ? '分享你的想法，给彼此一点支持。' : '小小的分享，会让共同的旅程更有温度。';
  document.getElementById('comment-text').value = '';
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('comment-text').focus();
}

function openPregnancyModal() {
  const pregnant = status === 'pregnant';
  document.getElementById('pregnancy-title').textContent = pregnant ? '修改末次月经' : '报喜：确认怀孕了';
  document.getElementById('pregnancy-sub').textContent = pregnant
    ? '调整末次月经后，孕周、预产期和每周清单都会自动更新。'
    : '填写末次月经的第一天，我们会帮你算好孕周和预产期，每周清单也会自动跟上。';
  document.getElementById('lmp-input').value = lmp || '';
  document.getElementById('pregnancy-back').classList.toggle('hidden', !pregnant);
  document.getElementById('pregnancy-save').textContent = pregnant ? '保存' : '保存，进入孕周模式';
  document.getElementById('pregnancy-modal').classList.remove('hidden');
  document.getElementById('lmp-input').focus();
}

async function start() {
  try {
    await sql('CREATE TABLE IF NOT EXISTS journey_pregnancy (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT \'prepare\', lmp_date TEXT, updated_at TEXT)');
    await sql('CREATE TABLE IF NOT EXISTS journey_checklist (id TEXT NOT NULL, scene TEXT NOT NULL, checked TEXT, updated_at TEXT, PRIMARY KEY (id, scene))');
    const settings = (await sql('SELECT phase, week_number, started_at, mom_name, dad_name FROM journey_settings WHERE id = ?', ['main'])).rows[0];
    names = { mom: settings?.mom_name || '妈妈', dad: settings?.dad_name || '爸爸' };
    prepareDays = settings ? Math.max(1, Math.floor((Date.now() - new Date(settings.started_at).getTime()) / 86400000)) : 1;
    const state = (await sql('SELECT status, lmp_date FROM journey_pregnancy WHERE id = ?', ['main'])).rows[0];
    status = state?.status === 'pregnant' && state.lmp_date ? 'pregnant' : 'prepare';
    lmp = status === 'pregnant' ? state.lmp_date : null;
    const cur = currentPoint();
    viewPhase = cur.phase;
    viewWeek = cur.week;
    suppStage = status === 'pregnant' ? (cur.phase === 'early' ? 't1' : cur.phase === 'middle' ? 't2' : 't3') : 'prepare';
    completed = new Set((await sql('SELECT task_id FROM journey_progress WHERE journey_id = ?', ['main'])).rows.map((row) => row.task_id));
    completedWhen = {};
    (await sql('SELECT task_id, completed_at FROM journey_progress WHERE journey_id = ?', ['main'])).rows.forEach((row) => { completedWhen[row.task_id] = row.completed_at; });
    comments = (await sql('SELECT author, body, created_at FROM journey_comments WHERE journey_id = ? ORDER BY created_at DESC LIMIT 20', ['main'])).rows;
    (await sql('SELECT scene, checked FROM journey_checklist WHERE id = ?', ['main'])).rows.forEach((row) => {
      if (row.scene) (JSON.parse(row.checked || '[]')).forEach((key) => bagChecked.add(key));
    });
    document.getElementById('streak-count').textContent = prepareDays;
    document.getElementById('streak-side').textContent = `一起走过的第 ${prepareDays} 天`;
    document.querySelector('.date').textContent = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    render();
  } catch (error) { toast(`数据加载失败：${error.message}`); }
}

// 阶段标签只用于浏览，不再改写状态
function browsePhase(nextPhase) {
  const cur = currentPoint();
  viewPhase = nextPhase;
  viewWeek = nextPhase === cur.phase ? cur.week : weekRanges[nextPhase][0];
  render();
}
document.querySelectorAll('[data-phase]').forEach((button) => button.onclick = () => browsePhase(button.dataset.phase));

function moveWeek(delta) {
  const next = viewWeek + delta;
  if (next < weekRanges[viewPhase][0] || next > weekRanges[viewPhase][1]) return;
  viewWeek = next;
  render();
}
document.getElementById('previous-week').onclick = () => moveWeek(-1);
document.getElementById('next-week').onclick = () => moveWeek(1);
function backToCurrent() {
  const cur = currentPoint();
  viewPhase = cur.phase;
  viewWeek = cur.week;
  render();
}
document.getElementById('back-to-current').onclick = backToCurrent;

let completedWhen = {}; // task_id -> 完成时间
function renderCompleted() {
  const list = document.getElementById('completed-list');
  list.replaceChildren();
  const done = [];
  ['prepare', 'early', 'middle', 'late'].forEach((phase) => {
    Object.keys(weeklyPlans[phase]).forEach((weekKey) => {
      const week = Number(weekKey);
      weeklyPlans[phase][week].tasks.forEach(([who, title], index) => {
        const id = `${phase}-${week}-${index}`;
        if (completed.has(id)) done.push({ id, who, title, phase, week, at: completedWhen[id] });
      });
    });
  });
  done.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  if (!done.length) {
    const empty = document.createElement('p');
    empty.className = 'completed-empty';
    empty.textContent = '还没有完成的事——从本周清单里勾选第一件吧。';
    list.append(empty);
    return;
  }
  done.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'completed-item';
    row.innerHTML = '<span class="avatar small"></span><div><b></b><small></small></div><button class="undo-btn">取消完成</button>';
    row.querySelector('.avatar').textContent = names[item.who][0];
    row.querySelector('b').textContent = item.title;
    const when = item.at ? new Date(item.at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
    row.querySelector('small').textContent = `${item.phase === 'prepare' ? '备孕' : '怀孕'}第 ${item.week} 周${when ? ` · 完成于 ${when}` : ''}`;
    row.querySelector('.undo-btn').onclick = async () => {
      try {
        await sql('DELETE FROM journey_progress WHERE journey_id = ? AND task_id = ?', ['main', item.id]);
        completed.delete(item.id);
        delete completedWhen[item.id];
        render();
        renderCompleted();
      } catch (error) { toast(error.message); }
    };
    list.append(row);
  });
}
document.getElementById('completed-back').onclick = () => showView('journey');

document.querySelectorAll('[data-role]').forEach((button) => button.onclick = () => { role = button.dataset.role; render(); });
function showView(name) {
  document.querySelectorAll('[data-nav]').forEach((button) => {
    const active = button.dataset.nav === name;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    if (active) document.getElementById('crumb').textContent = button.querySelector('span:last-child').textContent.trim();
  });
  if (name === 'completed') document.getElementById('crumb').textContent = '已完成的事';
  document.querySelectorAll('.journey-view').forEach((view) => view.classList.toggle('hidden', view.id !== `${name}-view`));
  window.scrollTo({ top: 0, behavior: 'instant' });
}
document.querySelectorAll('[data-nav]').forEach((button) => button.onclick = () => showView(button.dataset.nav));
document.getElementById('moments-add-note').onclick = () => openModal();
document.getElementById('cancel').onclick = () => document.getElementById('modal').classList.add('hidden');
document.getElementById('modal').onclick = (event) => { if (event.target.id === 'modal') event.currentTarget.classList.add('hidden'); };
document.getElementById('save-comment').onclick = async () => {
  const body = document.getElementById('comment-text').value.trim();
  if (!body) return;
  try {
    const comment = { id: newId(), author: names[document.getElementById('comment-author').value], body, created_at: new Date().toISOString() };
    await sql('INSERT INTO journey_comments (id, journey_id, task_id, author, body, created_at) VALUES (?, ?, ?, ?, ?, ?)', [comment.id, 'main', activeTask, comment.author, comment.body, comment.created_at]);
    comments.unshift(comment);
    renderComments();
    document.getElementById('modal').classList.add('hidden');
    toast('♡ 这句话已留在你们的旅程里');
  } catch (error) { toast(error.message); }
};

// 报喜 / 修改末次月经
document.getElementById('pregnancy-cta').onclick = openPregnancyModal;
document.getElementById('lmp-edit').onclick = openPregnancyModal;
document.getElementById('pregnancy-cancel').onclick = () => document.getElementById('pregnancy-modal').classList.add('hidden');
document.getElementById('pregnancy-modal').onclick = (event) => { if (event.target.id === 'pregnancy-modal') event.currentTarget.classList.add('hidden'); };
document.getElementById('pregnancy-save').onclick = async () => {
  const value = document.getElementById('lmp-input').value;
  if (!value) { toast('先选一个日期吧'); return; }
  const days = Math.floor((startOfToday() - parseDate(value)) / 86400000);
  if (days < 0) { toast('末次月经不能是未来哦，再检查一下日期'); return; }
  try {
    await sql('INSERT OR REPLACE INTO journey_pregnancy (id, status, lmp_date, updated_at) VALUES (?, ?, ?, ?)', ['main', 'pregnant', value, new Date().toISOString()]);
    const wasPregnant = status === 'pregnant';
    status = 'pregnant';
    lmp = value;
    const cur = currentPoint();
    viewPhase = cur.phase;
    viewWeek = cur.week;
    suppStage = cur.phase === 'early' ? 't1' : cur.phase === 'middle' ? 't2' : 't3';
    document.getElementById('pregnancy-modal').classList.add('hidden');
    render();
    if (!wasPregnant) toast('♡ 记下啦！每周清单会自动跟着孕周走');
    else toast('已更新，孕周和预产期重新算好了');
  } catch (error) { toast(error.message); }
};
document.getElementById('pregnancy-back').onclick = async () => {
  try {
    await sql('INSERT OR REPLACE INTO journey_pregnancy (id, status, lmp_date, updated_at) VALUES (?, ?, ?, ?)', ['main', 'prepare', null, new Date().toISOString()]);
    status = 'prepare';
    lmp = null;
    suppStage = 'prepare';
    const cur = currentPoint();
    viewPhase = cur.phase;
    viewWeek = cur.week;
    document.getElementById('pregnancy-modal').classList.add('hidden');
    render();
    toast('已回到备孕清单，继续稳稳地来');
  } catch (error) { toast(error.message); }
};

document.getElementById('profile-trigger').onclick = () => {
  document.getElementById('mom-name').value = names.mom;
  document.getElementById('dad-name').value = names.dad;
  document.getElementById('profile-modal').classList.remove('hidden');
  document.getElementById('mom-name').focus();
};
document.getElementById('profile-cancel').onclick = () => document.getElementById('profile-modal').classList.add('hidden');
document.getElementById('profile-modal').onclick = (event) => { if (event.target.id === 'profile-modal') event.currentTarget.classList.add('hidden'); };
document.getElementById('profile-save').onclick = async () => {
  const mom = document.getElementById('mom-name').value.trim() || '妈妈';
  const dad = document.getElementById('dad-name').value.trim() || '爸爸';
  try {
    await sql('UPDATE journey_settings SET mom_name = ?, dad_name = ? WHERE id = ?', [mom, dad, 'main']);
    names = { mom, dad };
    document.getElementById('profile-modal').classList.add('hidden');
    render();
    toast('称呼已保存');
  } catch (error) { toast(error.message); }
};

showView('journey');
start();
