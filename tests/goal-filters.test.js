import test from "node:test";
import assert from "node:assert/strict";
import { goalsFor, solved, colorsAt, stickerPositions, permutations, parseScramble } from "../src/model/fto.js";
import { goalCategory, filterOptions, matchesFilter, categoryDepths, mergeSolutions,
  filteredSolutions, completeSolutionTargets } from "../src/model/goal-filters.js";
import { prepare, solveSelected } from "../src/model/search.js";
import { packSolverSession, unpackSolverSession } from "../src/session.js";

test("filters have three relative slots and six ordered pseudo triplets for every color", () => {
  for (let color = 0; color < 8; color++) for (const mode of ["arrow", "fc+1", "fb", "pseudo-arrow", "pseudo-fc+1"]) {
    const pseudo = mode.startsWith("pseudo"), options = filterOptions(color, mode),
      categories = new Set();
    assert.equal(options.slots.length, pseudo ? 3 : 0);
    assert.equal(options.triplets.length, pseudo ? 6 : 3);
    for (const goal of goalsFor(color, mode)) {
      const category = goalCategory(goal, color, mode);
      categories.add(category.key);
      assert.ok(options.triplets.some((o) => o.id === category.triplet));
      const filter = { [color]: { slot: category.slot, triplet: category.triplet } };
      assert.ok(matchesFilter(goal, color, mode, filter));
      if (pseudo) assert.ok(options.slots.some((o) => o.id === category.slot));
    }
    assert.equal(categories.size, pseudo ? 18 : 3);
  }
  assert.deepEqual(filterOptions(0, "fc"), { slots: [], triplets: [] });
});

test("relative slot/triplet labels are invariant under rigid poses and FB refers to the omitted triplet", () => {
  const normal = goalsFor(0, "fc+1");
  for (const goal of normal) {
    const sameTriplet = normal.filter((g) => g.up === goal.up);
    assert.equal(new Set(sameTriplet.map((g) => goalCategory(g, 0, "fc+1").triplet)).size, 1);
    const fb = goalsFor(0, "fb").find((g) => g.up === goal.up && g.rotation === goal.rotation);
    assert.deepEqual(goalCategory(fb, 0, "fb"), goalCategory(goal, 0, "fc+1"));
  }
  for (const goal of goalsFor(0, "pseudo-arrow")) {
    const kind = goalCategory(goal, 0, "pseudo-arrow");
    const others = goalsFor(0, "pseudo-arrow").filter((g) => g.up === goal.up && g.cornerSource === goal.cornerSource);
    assert.equal(new Set(others.map((g) => goalCategory(g, 0, "pseudo-arrow").slot)).size, 1);
    assert.ok(others.some((g) => goalCategory(g, 0, "pseudo-arrow").triplet === kind.triplet));
  }
});

function independentCategoryDepths(color, mode, scramble, maxDepth) {
  const goals = goalsFor(color, mode), found = {}, start = colorsAt(stickerPositions(scramble));
  let level = [{ state: start, last: -1 }];
  for (let depth = 0; depth <= maxDepth; depth++) {
    const next = [];
    for (const { state, last } of level) {
      for (const goal of goals) if (goal.first.every(([slot, color]) => state[slot] === color)) {
        const key = goalCategory(goal, color, mode).key;
        found[key] ??= depth;
      }
      if (depth === maxDepth) continue;
      for (let move = 0; move < 16; move++) {
        if (move >> 1 === last) continue;
        const moved = new Uint8Array(72);
        for (let slot = 0; slot < 72; slot++) moved[permutations[move][slot]] = state[slot];
        next.push({ state: moved, last: move >> 1 });
      }
    }
    level = next;
  }
  return found;
}

test("deeper filtered search retains the optimal depth of every other reached category", () => {
  const color = 0, mode = "pseudo-arrow", scramble = parseScramble("R"),
    expected = independentCategoryDepths(color, mode, scramble, 3),
    chosen = Object.entries(expected).sort((a, b) => b[1] - a[1])[0];
  assert.ok(chosen[1] > Math.min(...Object.values(expected)));
  const tables = prepare(color, () => {}, mode), resolved = {}, found = [];
  let pending = {};
  const result = solveSelected([{ color, tables }], scramble, {
    maxDepth: 3,
    acceptTarget: (target) => goalCategory(target, color, mode).key === chosen[0],
    includeTarget: (target, c, depth) => (resolved[goalCategory(target, c, mode).key] ?? Infinity) >= depth,
    onSolution: (solution) => {
      found.push(solution);
      for (const target of solution.targets) pending[goalCategory(target, color, mode).key] = solution.moves.length;
    },
    onDepthComplete: () => { Object.assign(resolved, pending); pending = {}; },
  });
  assert.equal(result.depth, chosen[1]);
  const cached = categoryDepths(found, mode);
  for (const [category, depth] of Object.entries(expected)) if (depth <= result.depth)
    assert.equal(cached[category], depth, `lost optimum for ${category}`);
  assert.ok(found.some((s) => !s.targets.some((t) => goalCategory(t, color, mode).key === chosen[0])),
    "retain solutions outside the active filter");
  for (const [category, depth] of Object.entries(cached)) {
    const [, slot, triplet] = category.split(":"), filter = { [color]: { slot, triplet } },
      selected = filteredSolutions(found, mode, filter);
    assert.ok(selected.length);
    assert.ok(selected.every((s) => s.moves.length === depth));
    const merged = mergeSolutions(found, selected);
    assert.equal(merged.length, found.length);
  }
});

test("legacy solutions recover other valid targets; session memory retains all target alternatives", () => {
  const color = 0, mode = "fb", target = goalsFor(color, mode).find((g) => g.first.every(([slot, c]) => solved[slot].color === c)),
    records = completeSolutionTargets([{ moves: [], color, target }], mode, []);
  assert.equal(new Set(records[0].targets.map((t) => goalCategory(t, color, mode).key)).size, 3);
  const session = { text: "", colors: [color], mode, active: { scramble: [], colors: [color], mode, setup: true },
    solutions: records, selected: 0, page: 1, status: "done", progress: { depth: 0 },
    filters: { fb: { 0: { triplet: "1-2" } } },
    memory: { scramble: [], queries: { '["fb",[0]]': { records, depth: 0, baseDepth: 0 } } } };
  const loaded = unpackSolverSession(JSON.parse(JSON.stringify(packSolverSession(session))));
  assert.deepEqual(loaded.memory, session.memory);
  assert.deepEqual(loaded.filters, session.filters);
  assert.deepEqual(loaded.solutions, records);
});

test("reversed pseudo triplets use the same color pair plus flipped", () => {
  for (let color = 0; color < 8; color++) {
    const options = filterOptions(color, "pseudo-arrow").triplets;
    for (let i = 0; i < options.length; i += 2) {
      assert.equal(options[i + 1].label, `${options[i].label} flipped`);
      assert.equal(options[i + 1].id, options[i].id.split("-").reverse().join("-"));
    }
  }
});
