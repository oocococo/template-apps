export const VEHICLES = [
  {
    id: "comet",
    name: "COMET S",
    label: "彗星 · 复古双门轿跑",
    color: "#e78fa5",
    price: 0,
    maxSpeed: 34,
    acceleration: 15,
  },
  {
    id: "turbo",
    name: "TURBO 86",
    label: "涡轮 · 街道性能版",
    color: "#87cac2",
    price: 1200,
    maxSpeed: 44,
    acceleration: 19,
  },
  {
    id: "night",
    name: "NIGHTRUNNER",
    label: "夜行者 · 海岸特别版",
    color: "#e4c078",
    price: 2400,
    maxSpeed: 52,
    acceleration: 23,
  },
];
export const initialState = () => ({
  cash: 300,
  owned: ["comet"],
  vehicle: "comet",
  upgrade: 0,
  completed: 0,
  distance: 0,
  x: 120,
  z: 18,
  heading: Math.PI,
  mission: null,
});
export function purchase(state, id) {
  const item = VEHICLES.find((v) => v.id === id);
  if (!item) return { ok: false, message: "车辆不存在" };
  if (state.owned.includes(id)) {
    state.vehicle = id;
    return { ok: true, message: "车辆已就绪" };
  }
  if (state.cash < item.price)
    return { ok: false, message: "余额不足，先去完成几份委托" };
  state.cash -= item.price;
  state.owned.push(id);
  state.vehicle = id;
  return { ok: true, message: "新车已送达车库" };
}
export function upgrade(state) {
  if (state.upgrade >= 3) return { ok: false, message: "引擎已完全升级" };
  const cost = (state.upgrade + 1) * 350;
  if (state.cash < cost)
    return { ok: false, message: "余额不足，完成任务可赚取现金" };
  state.cash -= cost;
  state.upgrade++;
  return { ok: true, message: "引擎升级完成" };
}
export function completeMission(state, reward) {
  state.cash += reward;
  state.completed++;
  state.mission = null;
}
export function blocked(x, z, colliders, radius) {
  if (x < -137 || x > 154 || z < -206 || z > 206) return true;
  return colliders.some(
    (b) =>
      Math.abs(x - b.x) < b.hx + radius && Math.abs(z - b.z) < b.hz + radius,
  );
}
