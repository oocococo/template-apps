import * as T from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import style from "./style.css?inline";
import { createWorld, ROAD_X, ROAD_Z, GARAGE, JOBS } from "./world.js";
import { car, person, mat } from "./models.js";
import {
  initialState,
  VEHICLES,
  purchase,
  upgrade,
  completeMission,
  blocked,
} from "./state.js";
import { sql, verifiedWrite } from "./db.js";
import { AudioEngine } from "./audio.js";

const sheet = document.createElement("style");
sheet.textContent = style;
document.head.append(sheet);
const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.href =
  "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%226%22 fill=%22%231b3441%22/><text x=%227%22 y=%2225%22 fill=%22%23ffaec8%22 font-size=%2227%22 font-family=%22sans-serif%22 font-style=%22italic%22>N</text></svg>";
document.head.append(favicon);
document.title = "霓虹海岸 · Neon Coast";
const svg = (body) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const soundIcon = svg(
  '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
);
const saveIcon = svg(
  '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7"/>',
);
const menuIcon = svg('<path d="M5 6h14M5 12h14M5 18h14"/>');
const root =
  document.getElementById("app") ||
  document.body.appendChild(document.createElement("div"));
root.innerHTML = `<canvas id="game" aria-label="霓虹海岸 3D 游戏场景"></canvas><div id="interface">
<div class="vignette"></div>
<div class="intro" id="intro"><div class="intro-content"><div class="eyebrow">A LITTLE CITY. A BIG NIGHT.</div><h1 class="game-title">NEON<span>COAST</span></h1><div class="chinese-title">霓虹海岸</div><p class="intro-copy">落日之后，整座城市都是你的。<br>发动引擎，接下一份委托，沿着海岸驶入夜色。</p><div class="start-row"><button id="start" class="primary" disabled>正在读取存档 <span>↗</span></button><button id="how" class="text-button">驾驶指南</button></div><div class="intro-meta"><span><i></i> 自由驾驶</span><span><i></i> 街头任务</span><span><i></i> 云端存档</span></div><div class="loading-msg" id="loading"></div></div></div>
<div class="topbar"><div class="brand"><div class="brand-icon">N</div><div class="brand-text">NEON COAST<small>THE SUNSET DISTRICT</small></div></div><div class="top-actions"><span id="save-status" class="save-status">正在连接存档</span><button id="save" class="small-button" aria-label="保存游戏" title="保存游戏">${saveIcon}</button><button id="sound" class="small-button" aria-label="打开声音" title="打开声音">${soundIcon}</button><button id="menu" class="small-button" aria-label="暂停菜单" title="暂停菜单">${menuIcon}</button></div></div>
<div class="intro-bottom"><div class="location-label"><b>OCEAN DRIVE</b><small>25° 47′ N &nbsp; / &nbsp; 80° 08′ W &nbsp; · &nbsp; 18:42</small></div><div class="edition">AN ORIGINAL DRIVING EXPERIENCE</div></div>
<div class="hud"><div class="wallet"><label>街头资金</label><b id="cash">$ 300</b><div id="wanted" class="wanted"></div></div><div class="mission-card"><label id="mission-label">THE CITY IS YOURS</label><h3 id="mission-title">随心出发</h3><p id="mission-description">沿海岸兜风，或按 M 接下一份委托。</p><div class="mission-progress" id="mission-progress"></div></div><div class="minimap-wrap"><canvas id="minimap" width="356" height="356"></canvas><span class="map-north">N</span></div><div id="district" class="district">海滨大道 · OCEAN DRIVE</div><div class="speedometer"><strong id="speed">000</strong><small>KM/H</small><div class="speed-line"><i id="speed-line"></i></div><div class="car-name" id="car-name">COMET S / RWD</div></div><div class="controls"><span><kbd>W A S D</kbd> 驾驶</span><span><kbd>SPACE</kbd> 手刹</span><span><kbd>E</kbd> 上下车</span><span><kbd>M</kbd> 任务</span><span><kbd>TAB</kbd> 地图</span></div><div id="action-prompt" class="action-prompt"><kbd>M</kbd> 接受你的第一份委托</div><div class="touch-controls"><div class="touch-pad"><button data-key="a" aria-label="左转">◀</button><button data-key="d" aria-label="右转">▶</button><button data-key=" " aria-label="手刹">刹</button><button data-key="s" aria-label="倒车">↓</button></div><div class="touch-extra"><button id="touch-car">上下车</button><button id="touch-jobs">任务</button><button id="touch-garage">车库</button></div><div class="touch-pad" style="grid-template-columns:49px"><button data-key="w" class="accelerate" aria-label="加速">↑</button></div></div></div>
<div id="toast" class="toast" role="status"></div><div id="reward" class="reward-banner"><h2>MISSION COMPLETE</h2><p>委托完成</p><strong id="reward-cash"></strong></div><div id="modal" class="modal" role="dialog" aria-modal="true" aria-label="游戏菜单"></div></div>`;
const $ = (id) => document.getElementById(id);
const ui = $("interface");
let state = initialState(),
  loaded = false,
  started = false,
  paused = false,
  modalKind = "",
  toastTimer,
  dirty = false,
  saveBusy = false,
  lastSave = 0,
  saveFailed = false;
const audio = new AudioEngine();
const renderer = new T.WebGLRenderer({
  canvas: $("game"),
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = T.SRGBColorSpace;
const scene = new T.Scene(),
  camera = new T.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 2200);
const pmrem = new T.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
room.dispose();
pmrem.dispose();
scene.environmentIntensity = 0.6;
const world = createWorld(scene);
let playerCar = car(),
  avatar = person("#edbdad");
scene.add(playerCar, avatar);
avatar.visible = false;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader);
fxaa.material.uniforms.resolution.value.set(
  1 / (innerWidth * renderer.getPixelRatio()),
  1 / (innerHeight * renderer.getPixelRatio()),
);
composer.addPass(fxaa);
const player = {
  x: 120,
  z: 18,
  heading: Math.PI,
  speed: 0,
  vx: 0,
  vz: 0,
  driving: true,
};
let cameraMode = 0,
  lastTime = null,
  elapsed = 0,
  lastUI = 0,
  lastCollision = 0,
  missionCooldown = 0;
const keys = new Set(),
  look = new T.Vector3(),
  cameraPos = new T.Vector3();
const marker = new T.Group();
const ring = new T.Mesh(
  new T.TorusGeometry(4, 0.12, 8, 64),
  new T.MeshBasicMaterial({ color: "#a7ffdc", toneMapped: false }),
);
ring.rotation.x = Math.PI / 2;
marker.add(ring);
const beacon = new T.Mesh(
  new T.CylinderGeometry(4, 4, 11, 32, 1, true),
  new T.MeshBasicMaterial({
    color: "#a7ffdc",
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    side: T.DoubleSide,
  }),
);
beacon.position.y = 5.5;
marker.add(beacon);
const arrow = new T.Mesh(
  new T.ConeGeometry(0.8, 1.3, 3),
  new T.MeshBasicMaterial({ color: "#c4ffdf", toneMapped: false }),
);
arrow.rotation.z = Math.PI;
arrow.position.y = 6;
marker.add(arrow);
marker.visible = false;
scene.add(marker);
const garageRing = new T.Mesh(
  new T.RingGeometry(3.2, 3.3, 48),
  new T.MeshBasicMaterial({ color: "#eec296", side: T.DoubleSide }),
);
garageRing.rotation.x = -Math.PI / 2;
garageRing.position.set(GARAGE.x, 0.13, GARAGE.z);
scene.add(garageRing);
const police = car("#dee4e3");
police.add(
  new T.Mesh(
    new T.BoxGeometry(1.1, 0.14, 0.33),
    mat("#3975ff", { emissive: "#2a65ff", emissiveIntensity: 3 }),
  ),
);
police.children.at(-1).position.set(0, 1.8, -0.2);
police.visible = false;
scene.add(police);
const smokeGeo = new T.SphereGeometry(0.3, 6, 5),
  smokeMat = new T.MeshBasicMaterial({
    color: "#d8c8c1",
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
const smoke = Array.from({ length: 32 }, () => {
  const mesh = new T.Mesh(smokeGeo, smokeMat.clone());
  mesh.visible = false;
  scene.add(mesh);
  return { mesh, life: 0 };
});
let smokeIndex = 0;
function notify(text) {
  $("toast").textContent = text;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3400);
}
function status(text, error = false) {
  $("save-status").textContent = text;
  $("save-status").classList.toggle("error", error);
}
function syncState() {
  if (player.driving) {
    state.x = player.x;
    state.z = player.z;
    state.heading = player.heading;
  } else {
    state.x = playerCar.position.x;
    state.z = playerCar.position.z;
    state.heading = playerCar.rotation.y;
  }
}
async function save(manual = false) {
  if (!loaded || saveBusy) return;
  if (saveFailed && !manual) return;
  syncState();
  saveBusy = true;
  status("正在保存…");
  const data = JSON.stringify(state),
    savedAt = new Date().toISOString();
  try {
    await verifiedWrite(
      () =>
        sql(
          "INSERT INTO game_saves(slot,state,saved_at) VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET state=excluded.state,saved_at=excluded.saved_at",
          ["main", data, savedAt],
        ),
      async () => {
        const r = await sql(
          "SELECT state,saved_at FROM game_saves WHERE slot=?",
          ["main"],
        );
        return r.rows[0];
      },
      (r) => r?.state === data && r?.saved_at === savedAt,
    );
    dirty = JSON.stringify(state) !== data;
    saveFailed = false;
    lastSave = elapsed;
    status("进度已保存");
    if (manual) notify("已保存，可随时回来继续驾驶");
  } catch (e) {
    saveFailed = true;
    status("存档未确认 · 点击保存重查", true);
    notify(e.message);
  } finally {
    saveBusy = false;
  }
}
async function load() {
  try {
    const result = await sql(
      "SELECT state,saved_at FROM game_saves WHERE slot=?",
      ["main"],
    );
    if (result.rows.length) {
      state = JSON.parse(result.rows[0].state);
      $("start").innerHTML = "继续这段旅程 <span>↗</span>";
      $("loading").textContent =
        `车库 ${state.owned.length} 辆 · 已完成 ${state.completed} 份委托`;
    } else {
      $("start").innerHTML = "驶入海岸 <span>↗</span>";
      $("loading").textContent = "你的第一辆 Comet S 已在海滨大道等候。";
    }
    loaded = true;
    status("云端存档已连接");
    $("start").disabled = false;
    restore();
  } catch (e) {
    status("存档连接失败", true);
    $("loading").textContent = "暂时无法读取存档。检查连接后点击重试。";
    $("start").disabled = false;
    $("start").innerHTML = "重新连接 <span>↗</span>";
  }
}
function restore() {
  Object.assign(player, {
    x: state.x,
    z: state.z,
    heading: state.heading,
    speed: 0,
    vx: 0,
    vz: 0,
    driving: true,
  });
  changeCar();
  playerCar.position.set(player.x, 0, player.z);
  playerCar.rotation.y = player.heading;
  if (state.mission?.id === "escape") spawnPolice();
  updateHUD();
}
function changeCar() {
  scene.remove(playerCar);
  const v = VEHICLES.find((v) => v.id === state.vehicle);
  playerCar = car(v.color, v.id !== "comet");
  playerCar.position.set(player.x, 0, player.z);
  playerCar.rotation.y = player.heading;
  scene.add(playerCar);
  $("car-name").textContent = v.name + " / RWD";
}
function panel(title, sub, body, extra = "") {
  $("modal").innerHTML =
    `<div class="panel ${extra}"><div class="panel-head"><div><h2>${title}</h2><p>${sub}</p></div><button class="close" aria-label="关闭">×</button></div>${body}</div>`;
  $("modal").classList.add("open");
  paused = true;
  keys.clear();
  $("modal").querySelector(".close").onclick = closePanel;
  $("modal").querySelector("button")?.focus();
}
function closePanel() {
  $("modal").classList.remove("open");
  $("modal").innerHTML = "";
  paused = false;
  modalKind = "";
  keys.clear();
}
function help() {
  modalKind = "help";
  panel(
    "OWN THE STREETS",
    "驾驶指南 · 熟悉这座城市",
    `<div class="help-grid"><div><kbd>W / ↑</kbd> 加速 / 步行</div><div><kbd>S / ↓</kbd> 刹车 / 倒车</div><div><kbd>A D</kbd> 左右转向</div><div><kbd>SPACE</kbd> 手刹漂移</div><div><kbd>E</kbd> 停车后上下车</div><div><kbd>M</kbd> 打开任务电台</div><div><kbd>G</kbd> 进入车库（需到达）</div><div><kbd>TAB</kbd> 查看城市地图</div><div><kbd>C</kbd> 切换驾驶镜头</div><div><kbd>ESC</kbd> 暂停 / 继续</div></div><p class="panel-footer">沿道路驾驶，跟随薄荷色光柱完成委托。赚取现金后，回到海滨大道的 Coast Customs 购买新车、升级引擎。<br>任务结算与购车会保存进度；也可以随时点击右上角的存档按钮。手机使用屏幕下方的触控按钮。</p>`,
  );
}
function jobs() {
  if (!started) return;
  modalKind = "jobs";
  panel(
    "AFTER HOURS",
    "街头电台 · 找一件值得出发的事",
    `<div class="job-list">${JOBS.map((j, i) => `<div class="job"><div class="job-number">0${i + 1}</div><div class="job-info"><h3>${j.title}</h3><p>${j.subtitle}</p><small>${j.type} &nbsp; / &nbsp; ${j.time}s &nbsp; / &nbsp; $${j.reward}</small></div><button data-job="${j.id}">${state.mission?.id === j.id ? "进行中" : "接下委托"}</button></div>`).join("")}</div><p class="panel-footer">一次专注一份委托。接下新任务会替换当前任务，现金与已完成进度保留。</p>`,
  );
  document
    .querySelectorAll("[data-job]")
    .forEach((b) => (b.onclick = () => startMission(b.dataset.job)));
}
function startMission(id) {
  const j = JOBS.find((j) => j.id === id);
  state.mission = { id, index: 0, remaining: j.time };
  dirty = true;
  missionCooldown = 1;
  closePanel();
  if (id === "escape") spawnPolice();
  else police.visible = false;
  notify(`${j.title} · 前往小地图上的绿色标记`);
  save();
  updateHUD();
}
function spawnPolice() {
  police.visible = true;
  police.position.set(player.x, 0, player.z + 25);
  police.rotation.y = player.heading;
}
function carSilhouette(color) {
  return `<svg viewBox="0 0 160 65" aria-hidden="true"><ellipse cx="80" cy="55" rx="65" ry="5" fill="#0c2633" opacity=".5"/><path d="M15 36 36 31 54 15 104 15 124 32 144 36 147 48H12Z" fill="${color}"/><path d="m58 19-14 14h32V19Zm23 0v14h33l-14-14Z" fill="#263f4e"/><path d="M14 39h132v5H14Z" fill="#fff" opacity=".2"/><circle cx="40" cy="48" r="11" fill="#152432"/><circle cx="40" cy="48" r="6" fill="#a5babd"/><circle cx="120" cy="48" r="11" fill="#152432"/><circle cx="120" cy="48" r="6" fill="#a5babd"/><path d="M14 36h10v5H14Zm124 0h7v5h-7Z" fill="#fff3d4"/></svg>`;
}
function garage() {
  if (!started) return;
  if (Math.hypot(player.x - GARAGE.x, player.z - GARAGE.z) > 23) {
    notify("先到海滨大道的 Coast Customs 车库（地图上的橙色标记）");
    return;
  }
  if (!player.driving) {
    notify("先回到车旁按 E 上车");
    return;
  }
  player.speed = player.vx = player.vz = 0;
  modalKind = "garage";
  panel(
    "COAST CUSTOMS",
    `海岸车库 · 可用现金 $${state.cash.toLocaleString()}`,
    `<div class="garage-grid">${VEHICLES.map((v) => `<div class="garage-card ${state.vehicle === v.id ? "selected" : ""}"><div class="car-swatch">${carSilhouette(v.color)}</div><h3>${v.name}</h3><p>${v.label}</p><p>极速 ${Math.round(v.maxSpeed * 3.6)} km/h</p><button data-car="${v.id}">${state.vehicle === v.id ? "正在驾驶" : state.owned.includes(v.id) ? "换上这辆车" : "$ " + v.price.toLocaleString() + " · 购买"}</button></div>`).join("")}</div><div class="upgrade-row"><div>引擎调校 · ${state.upgrade}/3<small>每级提升加速与极速，所有已拥有车辆共享。</small></div><button id="upgrade" class="secondary">${state.upgrade >= 3 ? "已满级" : "$ " + (state.upgrade + 1) * 350 + " · 升级"}</button></div>`,
  );
  document.querySelectorAll("[data-car]").forEach(
    (b) =>
      (b.onclick = () => {
        const r = purchase(state, b.dataset.car);
        notify(r.message);
        if (r.ok) {
          changeCar();
          dirty = true;
          save();
          garage();
          updateHUD();
        }
      }),
  );
  $("upgrade").onclick = () => {
    const r = upgrade(state);
    notify(r.message);
    if (r.ok) {
      dirty = true;
      save();
      garage();
      updateHUD();
    }
  };
}
function pause() {
  if (!started) return help();
  modalKind = "pause";
  panel(
    "TAKE A BREATHER",
    "城市会等你 · 游戏已暂停",
    `<div class="pause-actions"><button id="resume" class="primary">继续驾驶 ↗</button><button id="pause-save" class="secondary">保存当前进度</button><button id="pause-help" class="secondary">驾驶指南</button></div><p class="panel-footer">已完成 ${state.completed} 份委托 · 已行驶 ${(state.distance / 1000).toFixed(1)} km · 已拥有 ${state.owned.length} 辆车</p>`,
  );
  $("resume").onclick = closePanel;
  $("pause-save").onclick = () => save(true);
  $("pause-help").onclick = help;
}
function mapPanel() {
  modalKind = "map";
  panel(
    "SUNSET DISTRICT",
    "城市地图 · 绿色光点为当前目标",
    `<canvas id="big-map" class="big-map" width="650" height="650"></canvas><div class="map-legend"><span><i style="background:#fff0d6"></i>你的位置</span><span><i style="background:#a6ead4"></i>任务目标</span><span><i style="background:#eec296"></i>海岸车库</span></div>`,
    "map-panel",
  );
  drawMap($("big-map"), true);
}
function enterExit() {
  if (!started || paused) return;
  if (player.driving) {
    if (Math.abs(player.speed) > 3) {
      notify("先停车，再按 E 下车");
      return;
    }
    let x = player.x + Math.cos(player.heading) * 2.7,
      z = player.z - Math.sin(player.heading) * 2.7;
    if (blocked(x, z, world.colliders, 0.35)) {
      x = player.x - Math.cos(player.heading) * 2.7;
      z = player.z + Math.sin(player.heading) * 2.7;
    }
    if (blocked(x, z, world.colliders, 0.35)) {
      notify("这里太窄，请换个地方停车");
      return;
    }
    player.driving = false;
    player.x = x;
    player.z = z;
    player.speed = player.vx = player.vz = 0;
    avatar.visible = true;
    notify("步行探索 · 回到车旁按 E 上车");
  } else {
    if (
      Math.hypot(
        player.x - playerCar.position.x,
        player.z - playerCar.position.z,
      ) > 6
    ) {
      notify("靠近你的车，再按 E 上车");
      return;
    }
    player.driving = true;
    player.x = playerCar.position.x;
    player.z = playerCar.position.z;
    player.heading = playerCar.rotation.y;
    avatar.visible = false;
  }
  updateHUD();
}
$("start").onclick = () => {
  if (!loaded) return load();
  started = true;
  ui.classList.add("playing");
  $("intro").classList.add("hidden");
  audio.start();
  $("sound").setAttribute("aria-label", "关闭声音");
  cameraPos.set(player.x + 8, 7, player.z + 14);
  look.set(player.x, 1, player.z);
  dirty = true;
  save();
};
$("how").onclick = help;
$("menu").onclick = pause;
$("save").onclick = () => save(true);
$("sound").onclick = () => {
  const on = audio.toggle();
  $("sound").style.opacity = on ? "1" : ".5";
  $("sound").setAttribute("aria-label", on ? "关闭声音" : "打开声音");
  notify(on ? "COAST FM 88.6 · 正在播放" : "声音已关闭");
};
$("touch-car").onclick = enterExit;
$("touch-jobs").onclick = jobs;
$("touch-garage").onclick = garage;
$("modal").addEventListener("click", (e) => {
  if (e.target === $("modal")) closePanel();
});
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (
    ["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "tab"].includes(k)
  )
    e.preventDefault();
  if (e.repeat) return;
  if (k === "escape") {
    if (paused) closePanel();
    else pause();
    return;
  }
  if (paused) {
    if (k === "tab") {
      const focusable = [
        ...$("modal").querySelectorAll("button:not(:disabled)"),
      ];
      const i = focusable.indexOf(document.activeElement);
      focusable[
        (i + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length
      ]?.focus();
    }
    return;
  }
  keys.add(k);
  if (k === "e") enterExit();
  if (k === "m") jobs();
  if (k === "g") garage();
  if (k === "tab" && started) mapPanel();
  if (k === "c") cameraMode = (cameraMode + 1) % 2;
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  if (started && !paused) pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    if (started && !paused) pause();
  }
});
document.querySelectorAll("[data-key]").forEach((b) => {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    keys.add(b.dataset.key);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    b.addEventListener(event, () => keys.delete(b.dataset.key));
});
function advance(dt) {
  const throttle = keys.has("w") || keys.has("arrowup"),
    brake = keys.has("s") || keys.has("arrowdown"),
    steer =
      (keys.has("a") || keys.has("arrowleft") ? 1 : 0) -
      (keys.has("d") || keys.has("arrowright") ? 1 : 0);
  const handbrake = keys.has(" ");
  const vehicle = VEHICLES.find((v) => v.id === state.vehicle);
  let nx, nz;
  if (player.driving) {
    const max = vehicle.maxSpeed + state.upgrade * 3;
    const acc = vehicle.acceleration + state.upgrade * 2;
    if (throttle) player.speed += acc * dt;
    else if (brake) player.speed -= (player.speed > 0 ? 25 : acc * 0.65) * dt;
    else player.speed *= Math.exp(-0.6 * dt);
    if (handbrake) player.speed *= Math.exp(-1.2 * dt);
    player.speed = T.MathUtils.clamp(player.speed, -10, max);
    const turn =
      ((steer * Math.min(Math.abs(player.speed) / 5, 1) * 1.4) /
        (1 + Math.abs(player.speed) / 32)) *
      Math.sign(player.speed);
    player.heading += turn * dt * (handbrake ? 1.85 : 1);
    const grip = 1 - Math.exp(-(handbrake ? 2.5 : 9) * dt);
    player.vx = T.MathUtils.lerp(
      player.vx,
      Math.sin(player.heading) * player.speed,
      grip,
    );
    player.vz = T.MathUtils.lerp(
      player.vz,
      Math.cos(player.heading) * player.speed,
      grip,
    );
    nx = player.x + player.vx * dt;
    nz = player.z + player.vz * dt;
    if (blocked(nx, nz, world.colliders, 1.25)) {
      player.speed *= -0.24;
      player.vx *= -0.2;
      player.vz *= -0.2;
      nx = player.x;
      nz = player.z;
      if (elapsed - lastCollision > 0.8) {
        lastCollision = elapsed;
        audio.tone(70, 0.15, 0.4, "triangle");
      }
    }
    for (const t of world.traffic) {
      if (Math.hypot(nx - t.model.position.x, nz - t.model.position.z) < 2.6) {
        player.speed *= 0.75;
        if (elapsed - lastCollision > 0.8) {
          lastCollision = elapsed;
          audio.tone(70, 0.13, 0.3);
        }
      }
    }
    state.distance += Math.hypot(nx - player.x, nz - player.z);
    player.x = nx;
    player.z = nz;
    playerCar.position.set(
      nx,
      Math.sin(elapsed * 8) * Math.abs(player.speed) * 0.0007,
      nz,
    );
    playerCar.rotation.y = player.heading;
    playerCar.rotation.z = T.MathUtils.lerp(
      playerCar.rotation.z,
      -steer * player.speed * 0.0009,
      dt * 5,
    );
    for (const w of playerCar.userData.wheels) {
      w.rotation.x += player.speed * dt * 2;
      if (w.position.z > 0) w.rotation.y = steer * 0.3;
    }
    if (handbrake && Math.abs(player.speed) > 10) {
      const p = smoke[smokeIndex++ % smoke.length];
      p.life = 0.8;
      p.mesh.position.set(
        player.x - Math.sin(player.heading) * 1.5,
        0.2,
        player.z - Math.cos(player.heading) * 1.5,
      );
      p.mesh.visible = true;
    }
  } else {
    if (throttle || brake) {
      const speed = (throttle ? 1 : -1) * 4;
      nx = player.x + Math.sin(player.heading) * speed * dt;
      nz = player.z + Math.cos(player.heading) * speed * dt;
      if (!blocked(nx, nz, world.colliders, 0.35)) {
        player.x = nx;
        player.z = nz;
      }
      for (let i = 0; i < 2; i++)
        avatar.userData.legs[i].rotation.x =
          Math.sin(elapsed * 10 + i * Math.PI) * 0.45;
    }
    player.heading += steer * 2.4 * dt;
    avatar.position.set(player.x, 0, player.z);
    avatar.rotation.y = player.heading;
  }
  if (Math.abs(player.speed) > 0.1) dirty = true;
  for (const p of smoke)
    if (p.life > 0) {
      p.life -= dt;
      p.mesh.scale.setScalar(1 + (1 - p.life) * 4);
      p.mesh.position.y += dt * 0.5;
      p.mesh.material.opacity = Math.max(0, p.life * 0.22);
      if (p.life <= 0) p.mesh.visible = false;
    }
  audio.update(player.speed, player.driving);
  updateMission(dt);
}
function updateMission(dt) {
  const m = state.mission;
  if (!m) {
    marker.visible = false;
    police.visible = false;
    return;
  }
  const job = JOBS.find((j) => j.id === m.id);
  const point = job.points[m.index];
  marker.visible = true;
  marker.position.set(point[0], 0.18, point[1]);
  arrow.position.y = 6 + Math.sin(elapsed * 2) * 0.45;
  ring.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.035);
  m.remaining -= dt;
  missionCooldown = Math.max(0, missionCooldown - dt);
  if (m.remaining <= 0) {
    state.mission = null;
    police.visible = false;
    marker.visible = false;
    dirty = true;
    notify("时间到了。打开任务电台，再试一次。");
    save();
    updateHUD();
    return;
  }
  if (m.id === "escape") {
    const delta = new T.Vector3(
      player.x - police.position.x,
      0,
      player.z - police.position.z,
    );
    const d = delta.length();
    if (d > 3) {
      delta.normalize();
      const nx = police.position.x + delta.x * dt * 15,
        nz = police.position.z + delta.z * dt * 15;
      if (!blocked(nx, nz, world.colliders, 1)) {
        police.position.set(nx, 0, nz);
        police.rotation.y = Math.atan2(delta.x, delta.z);
      } else {
        const px = police.position.x,
          pz = police.position.z;
        if (!blocked(nx, pz, world.colliders, 1)) police.position.x = nx;
        else if (!blocked(px, nz, world.colliders, 1)) police.position.z = nz;
      }
    }
    police.children
      .at(-1)
      .material.emissive.set(
        Math.sin(elapsed * 10) > 0 ? "#ff235d" : "#2a65ff",
      );
    if (d < 4 && missionCooldown === 0) {
      m.remaining = Math.max(0, m.remaining - 8);
      missionCooldown = 3;
      notify("被巡逻车逼近 · 时间 -8 秒");
    }
  }
  if (
    Math.hypot(player.x - point[0], player.z - point[1]) < 6 &&
    missionCooldown === 0
  ) {
    m.index++;
    missionCooldown = 0.7;
    audio.tone(660, 0.18, 0.3);
    if (m.index >= job.points.length) {
      completeMission(state, job.reward);
      dirty = true;
      marker.visible = false;
      police.visible = false;
      audio.success();
      $("reward-cash").textContent = "+ $" + job.reward;
      $("reward").classList.add("visible");
      setTimeout(() => $("reward").classList.remove("visible"), 3500);
      save();
    } else {
      notify(`检查点 ${m.index}/${job.points.length} · 继续前往下一个光柱`);
      dirty = true;
      save();
    }
    updateHUD();
  }
}
function updateHUD() {
  $("cash").textContent = "$ " + state.cash.toLocaleString();
  $("wanted").textContent = state.mission?.id === "escape" ? "★ ★ ★" : "";
  const m = state.mission;
  if (m) {
    const j = JOBS.find((j) => j.id === m.id);
    $("mission-label").textContent = j.type + " / ACTIVE CONTRACT";
    $("mission-title").textContent = j.title;
    $("mission-description").textContent = j.subtitle;
    $("mission-progress").textContent =
      `${Math.ceil(m.remaining)}s  /  ${m.index + 1} — ${j.points.length}`;
  } else {
    $("mission-label").textContent = "THE CITY IS YOURS";
    $("mission-title").textContent = "随心出发";
    $("mission-description").textContent = "沿海岸兜风，或按 M 接下一份委托。";
    $("mission-progress").textContent = "";
  }
  const speed = Math.round(Math.abs(player.speed) * 3.6);
  $("speed").textContent = String(player.driving ? speed : 0).padStart(3, "0");
  $("speed-line").style.width = Math.min((speed / 180) * 100, 100) + "%";
  $("car-name").textContent = player.driving
    ? VEHICLES.find((v) => v.id === state.vehicle).name + " / RWD"
    : "ON FOOT / 步行";
  $("district").textContent =
    player.x > 90
      ? "海滨大道 · OCEAN DRIVE"
      : player.z < -100
        ? "北岸 · NORTH SHORE"
        : "棕榈街区 · PALM DISTRICT";
  if (!player.driving)
    $("action-prompt").innerHTML = "<kbd>E</kbd> 靠近车辆后上车";
  else if (Math.hypot(player.x - GARAGE.x, player.z - GARAGE.z) < 23)
    $("action-prompt").innerHTML = "<kbd>G</kbd> 进入 Coast Customs 车库";
  else if (m)
    $("action-prompt").innerHTML =
      "<kbd>M</kbd> 任务电台 &nbsp; · &nbsp; 跟随绿色光柱";
  else $("action-prompt").innerHTML = "<kbd>M</kbd> 接受一份街头委托";
}
function drawMap(canvas, full = false) {
  const ctx = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#18313c";
  ctx.fillRect(0, 0, w, h);
  const scale = full ? w / 480 : w / 255;
  const cx = full ? 20 : player.x,
    cz = full ? 0 : player.z;
  const X = (x) => w / 2 + (x - cx) * scale,
    Y = (z) => h / 2 + (z - cz) * scale;
  ctx.fillStyle = "#285865";
  ctx.fillRect(X(157), 0, w, h);
  ctx.fillStyle = "#8c9b84";
  ctx.fillRect(X(155), 0, 40 * scale, h);
  ctx.fillStyle = "#3b5158";
  for (const b of world.colliders)
    ctx.fillRect(
      X(b.x - b.hx),
      Y(b.z - b.hz),
      b.hx * 2 * scale,
      b.hz * 2 * scale,
    );
  ctx.strokeStyle = "#688285";
  ctx.lineWidth = 11 * scale;
  for (const x of ROAD_X) {
    ctx.beginPath();
    ctx.moveTo(X(x), Y(-205));
    ctx.lineTo(X(x), Y(205));
    ctx.stroke();
  }
  for (const z of ROAD_Z) {
    ctx.beginPath();
    ctx.moveTo(X(-135), Y(z));
    ctx.lineTo(X(135), Y(z));
    ctx.stroke();
  }
  ctx.fillStyle = "#edc392";
  ctx.fillRect(X(GARAGE.x) - 4, Y(GARAGE.z) - 4, 8, 8);
  if (state.mission) {
    const job = JOBS.find((j) => j.id === state.mission.id),
      point = job.points[state.mission.index];
    ctx.fillStyle = "#a6ead4";
    ctx.beginPath();
    ctx.arc(X(point[0]), Y(point[1]), full ? 7 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#a6ead459";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(X(player.x), Y(player.z));
    ctx.lineTo(X(point[0]), Y(point[1]));
    ctx.stroke();
    ctx.setLineDash([]);
    if (!full) {
      const dx = point[0] - player.x,
        dz = point[1] - player.z,
        len = Math.hypot(dx, dz);
      if (len > 106) {
        ctx.beginPath();
        ctx.arc(
          w / 2 + (dx / len) * w * 0.43,
          h / 2 + (dz / len) * h * 0.43,
          7,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
  ctx.save();
  ctx.translate(X(player.x), Y(player.z));
  ctx.rotate(-player.heading);
  ctx.fillStyle = "#fff1d3";
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(-7, -7);
  ctx.lineTo(0, -3);
  ctx.lineTo(7, -7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (full) {
    ctx.fillStyle = "#d8d9c1";
    ctx.font = "11px Arial";
    ctx.fillText("OCEAN DRIVE", X(130), Y(-180));
    ctx.fillText("COAST CUSTOMS", X(GARAGE.x) - 93, Y(GARAGE.z) - 12);
    ctx.fillText("NORTH SHORE", X(-115), Y(-185));
  }
}
function updateCamera(dt) {
  if (!started) {
    const a = Math.sin(elapsed * 0.035) * 0.12;
    camera.position.set(
      playerCar.position.x - 7 + Math.sin(a) * 2,
      3.1,
      playerCar.position.z + 10,
    );
    camera.lookAt(
      playerCar.position.x - (innerWidth < 600 ? 0.7 : 3.7),
      1.25,
      playerCar.position.z - 1.2,
    );
    return;
  }
  const h = player.heading,
    back = cameraMode ? 21 : 11,
    height = player.driving ? (cameraMode ? 15 : 5.7) : 4.5;
  const target = new T.Vector3(
    player.x - Math.sin(h) * back,
    height,
    player.z - Math.cos(h) * back,
  );
  cameraPos.lerp(target, 1 - Math.exp(-dt * 3.6));
  look.lerp(
    new T.Vector3(player.x + Math.sin(h) * 6, 1.15, player.z + Math.cos(h) * 6),
    1 - Math.exp(-dt * 5),
  );
  camera.position.copy(cameraPos);
  camera.lookAt(look);
  camera.fov = T.MathUtils.lerp(
    camera.fov,
    48 + Math.min(Math.abs(player.speed) * 0.22, 9),
    dt * 2,
  );
  camera.updateProjectionMatrix();
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt =
    lastTime === null ? 0 : T.MathUtils.clamp((now - lastTime) / 1000, 0, 0.1);
  lastTime = now;
  elapsed += dt;
  if (started && !paused) advance(dt);
  if (!paused) world.update(started ? dt : dt * 0.4, elapsed, player);
  updateCamera(dt);
  if (elapsed - lastUI > 0.1) {
    updateHUD();
    if (started) drawMap($("minimap"));
    lastUI = elapsed;
  }
  if (
    started &&
    !paused &&
    dirty &&
    elapsed - lastSave > 25 &&
    !saveBusy &&
    !saveFailed
  )
    save();
  composer.render();
}
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fxaa.material.uniforms.resolution.value.set(
    1 / (innerWidth * renderer.getPixelRatio()),
    1 / (innerHeight * renderer.getPixelRatio()),
  );
});
load();
requestAnimationFrame(frame);
