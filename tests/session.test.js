import test from "node:test";
import assert from "node:assert/strict";
import {
  SOLVER_MODES, packSolverSession, unpackSolverSession, readSession, writeSession,
} from "../src/session.js";
const target = { first: [[0, 0], [9, 1]], rotation: 3 };
const session = {
  text: "R U'", colors: [0, 7], mode: "pseudo-arrow", view: "solver",
  active: { scramble: [2, 1], colors: [0], mode: "fc", setup: true },
  solutions: [
    { moves: [1, 2], color: 0, target },
    { moves: [2, 1], color: 7, target: structuredClone(target) },
  ], selected: 1, page: 1, status: "done", message: "", progress: { depth: 2, count: 2 },
};
test("saved results round-trip, deduplicate targets, and preserve draft versus solved input", () => {
  const packed = packSolverSession(session);
  assert.equal(packed.targets.length, 1);
  const restored = unpackSolverSession(JSON.parse(JSON.stringify(packed)));
  assert.deepEqual(restored, { ...session, targets: [target] });
  assert.notEqual(restored.mode, restored.active.mode);
});
test("interrupted searches restore incomplete results without remaining busy", () => {
  const restored = unpackSolverSession(packSolverSession({ ...session, status: "searching" }));
  assert.equal(restored.status, "stopped");
  assert.match(restored.message, /incomplete/);
  assert.deepEqual(restored.solutions, session.solutions);
});
test("invalid stored data is rejected and invalid selection/pages are clamped", () => {
  assert.equal(unpackSolverSession(null), null);
  assert.equal(unpackSolverSession({}), null);
  const packed = packSolverSession(session);
  assert.equal(unpackSolverSession({ ...packed, mode: "removed-mode" }), null);
  assert.equal(unpackSolverSession({ ...packed, solutions: [[[99], 0, 0]] }), null);
  assert.equal(unpackSolverSession({ ...packed, targets: [] }), null);
  const safe = unpackSolverSession({ ...packed, selected: 999, page: 20 });
  assert.equal(safe.selected, -1); assert.equal(safe.page, 1);
});
test("session storage tolerates malformed JSON, unavailable storage, and version changes", () => {
  let value;
  globalThis.localStorage = { getItem: () => value, setItem: (_, data) => { value = data; } };
  writeSession("test", { mode: "fc" });
  assert.deepEqual(readSession("test"), { mode: "fc" });
  value = "bad json"; assert.equal(readSession("test"), null);
  value = '{"version":2,"data":{}}'; assert.equal(readSession("test"), null);
  globalThis.localStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("quota"); } };
  assert.equal(readSession("test"), null);
  assert.doesNotThrow(() => writeSession("test", session));
  delete globalThis.localStorage;
});
test("mode labels follow the requested order", () => {
  assert.deepEqual(SOLVER_MODES.map(([, label]) => label), [
    "Pseudo arrow Block", "First center", "Arrow block", "Pseudo FC+1", "FC+1", "FB",
  ]);
});
