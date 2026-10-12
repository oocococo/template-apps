import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  purchase,
  upgrade,
  completeMission,
  blocked,
} from "../src/state.js";
test("mission rewards fund a vehicle purchase and survive JSON save restore", () => {
  const s = initialState();
  s.mission = { id: "race", index: 5, remaining: 8 };
  completeMission(s, 800);
  completeMission(s, 450);
  assert.equal(s.cash, 1550);
  assert.equal(s.completed, 2);
  assert.equal(s.mission, null);
  assert.equal(purchase(s, "turbo").ok, true);
  assert.equal(s.cash, 350);
  assert.deepEqual(JSON.parse(JSON.stringify(s)).owned, ["comet", "turbo"]);
  assert.equal(purchase(s, "turbo").ok, true);
  assert.equal(s.cash, 350);
});
test("insufficient cash does not alter ownership; upgrades spend the displayed cost", () => {
  const s = initialState();
  assert.equal(purchase(s, "night").ok, false);
  assert.deepEqual(s.owned, ["comet"]);
  assert.equal(upgrade(s).ok, false);
  s.cash = 2200;
  for (let i = 0; i < 3; i++) assert.equal(upgrade(s).ok, true);
  assert.equal(s.cash, 100);
  assert.equal(s.upgrade, 3);
  assert.equal(upgrade(s).ok, false);
});
test("street movement respects building and coast collision volumes", () => {
  const buildings = [{ x: 20, z: 20, hx: 10, hz: 10 }];
  assert.equal(blocked(20, 20, buildings, 1.25), true);
  assert.equal(blocked(31, 20, buildings, 1.25), true);
  assert.equal(blocked(33, 20, buildings, 1.25), false);
  assert.equal(blocked(155, 20, buildings, 1.25), true);
  assert.equal(blocked(120, 18, buildings, 1.25), false);
});
