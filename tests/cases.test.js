import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  caseDefinitions,
  partialTarget,
  partialKey,
  applyPartial,
  inverseAlgorithm,
  mirrorAlgorithm,
  caseFrames,
} from "../src/model/cases.js";
import {
  parseScramble,
  moves,
  physicalGroups,
  solved,
  slotKey,
} from "../src/model/fto.js";
import {
  shorterDistances,
  preserveCaseEdits,
  generateCases,
  groupCases,
  commutingKey,
} from "../scripts/generate-cases.mjs";
const definitions = caseDefinitions();
const manifest = JSON.parse(
  await readFile(
    new URL("../public/cases/manifest.json", import.meta.url),
    "utf8",
  ),
);
test("case targets use only the pictured pieces and defined white centers", () => {
  for (const [mode, definition] of Object.entries(definitions)) {
    const state = partialTarget(definition.target),
      white = [...state].filter((c) => c === 1).length;
    const pieces = physicalGroups().filter((g) => g.some((id) => state[id]));
    assert.equal(pieces.length, mode === "fc+1" ? 9 : 6);
    assert.ok(pieces.every((g) => g.every((id) => state[id])));
    assert.equal(
      [...state].filter(Boolean).length,
      mode === "arrow" ? 11 : mode === "fc+1" ? 15 : 9,
    );
    const centers = physicalGroups().filter(
      (g) => g.length === 1 && state[g[0]] === 1,
    );
    assert.equal(centers.length, mode === "arrow" ? 1 : 3);
    assert.deepEqual(manifest.modes[mode].target, definition.target);
  }
  const arrow = new Map(definitions.arrow.target),
    groups = physicalGroups();
  const edges = groups
    .filter((g) => g.length === 2 && g.every((id) => arrow.has(id)))
    .map((g) =>
      g
        .map((id) => arrow.get(id))
        .sort()
        .join(","),
    );
  assert.deepEqual(edges.sort(), ["0,1", "0,2"]);
  const corner = groups.find(
    (g) => g.length === 4 && g.every((id) => arrow.has(id)),
  );
  assert.equal(
    corner.find((id) => Math.floor(id / 9) === 3),
    35,
  );
  assert.equal(arrow.get(35), 6);
  assert.deepEqual(
    groups
      .filter((g) => g.length === 1 && arrow.has(g[0]))
      .map(([id]) => arrow.get(id))
      .sort(),
    [0, 2, 4],
  );
});
test("mirror substitution matches the requested move pairs and is reversible", () => {
  assert.equal(
    mirrorAlgorithm(parseScramble("R BR U D B F L BL R'"))
      .map((m) => moves[m].name)
      .join(" "),
    "L' BL' U' D' B' F' R' BR' L",
  );
  for (let m = 0; m < 16; m++) {
    assert.deepEqual(mirrorAlgorithm(mirrorAlgorithm([m])), [m]);
    assert.equal(mirrorAlgorithm([m ^ 1])[0], mirrorAlgorithm([m])[0] ^ 1);
  }
});
test("catalog groups identical patterns and keeps only noncommuting shortest alternatives", async () => {
  let alternateCount = 0;
  for (const [mode, definition] of Object.entries(definitions)) {
    const target = partialTarget(definition.target),
      shorter = shorterDistances(definition.target, 3, definition.goals),
      allowed = new Set(definition.firstMoves);
    for (let depth = 1; depth <= 4; depth++) {
      const records = JSON.parse(await readFile(
        new URL(`../public/cases/${mode}/${depth}.json`, import.meta.url), "utf8"));
      assert.equal(records.length, manifest.modes[mode].counts[depth]);
      const ids = new Set(), seenStates = new Set();
      for (const entry of records) {
        assert.equal(typeof entry.name, "string");
        assert.ok(!ids.has(entry.id)); ids.add(entry.id);
        assert.ok(entry.solutions.length);
        const state = applyPartial(target, inverseAlgorithm(parseScramble(entry.solutions[0]))),
          key = partialKey(state), equivalences = new Set();
        assert.ok(!seenStates.has(key), "one card per pattern, including its mirror");
        seenStates.add(key);
        assert.ok((shorter.get(key) ?? Infinity) >= depth);
        for (const text of entry.solutions) {
          const solution = parseScramble(text), setup = inverseAlgorithm(solution);
          assert.equal(solution.length, depth);
          assert.ok(allowed.has(setup[0]));
          assert.equal(partialKey(applyPartial(target, setup)), key);
          assert.equal(partialKey(applyPartial(state, solution)), partialKey(target));
          const equivalence = commutingKey(state, solution);
          assert.ok(!equivalences.has(equivalence), "commuting alternatives are collapsed");
          equivalences.add(equivalence);
          if (definition.mirrors) {
            const mirrorState = applyPartial(target, inverseAlgorithm(mirrorAlgorithm(solution))),
              mirrorKey = partialKey(mirrorState);
            assert.ok((shorter.get(mirrorKey) ?? Infinity) >= depth);
            if (mirrorKey !== key) {
              // Multiple alternatives must produce the same derived mirror card.
              if (text === entry.solutions[0]) {
                assert.ok(!seenStates.has(mirrorKey)); seenStates.add(mirrorKey);
              } else assert.ok(seenStates.has(mirrorKey));
            }
          }
        }
        alternateCount += entry.solutions.length - 1;
      }
      // Sample actual animated frames, including each retained alternative.
      for (const entry of [records[0], records.at(-1)]) if (entry)
        for (const text of entry.solutions) {
          const { frames, mask } = caseFrames(definition.target, parseScramble(text)),
            slots = new Map(solved.map((s) => [slotKey(s.vertices), s.id])), end = new Uint8Array(72);
          for (const sticker of frames.at(-1)) if (mask.has(sticker.id))
            end[slots.get(slotKey(sticker.vertices))] = sticker.color + 1;
          assert.equal(partialKey(end), partialKey(target));
        }
      assert.deepEqual(groupCases(records, definition), records, "grouping is idempotent");
    }
  }
  assert.ok(alternateCount > 0, "distinct shortest alternatives are preserved");
});

test("regeneration preserves manually edited names and file order", () => {
  const generated = [
    { id: "a", name: "", solution: "R'" },
    { id: "b", name: "", solution: "R" },
    { id: "c", name: "", solution: "U" },
  ];
  const edited = [
    { ...generated[1], name: "Recognizable" },
    { ...generated[0], name: "Another" },
  ];
  const merged = preserveCaseEdits(edited, generated);
  assert.deepEqual(
    merged.map((c) => c.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    merged.map((c) => c.name),
    ["Recognizable", "Another", ""],
  );
  assert.ok(merged.every((c) => !Object.hasOwn(c, "order")));
});

test("shorter completions on another face or slot are rejected using only defined pieces", async () => {
  for (const [mode, count] of [
    ["arrow", 24],
    ["fc+1", 72],
    ["center", 12],
  ]) {
    const definition = definitions[mode];
    assert.equal(definition.goals.length, count);
    const signature = (pattern) => {
      const colors = new Array(8).fill(0);
      for (const [, c] of pattern) colors[c]++;
      return colors;
    };
    for (const goal of definition.goals)
      assert.deepEqual(signature(goal), signature(definition.target));
    const shorter = shorterDistances(definition.target, 3, definition.goals);
    assert.equal(shorter.get(partialKey(partialTarget(definition.target))), 0);
    if (mode === "arrow") {
      const twoMoveCase = applyPartial(
        partialTarget(definition.target),
        parseScramble("U F'"),
      );
      const distance = shorter.get(partialKey(twoMoveCase));
      assert.ok(
        distance < 2,
        `U F' should have a shorter completion; found ${distance}`,
      );
      const records = JSON.parse(
        await readFile(
          new URL("../public/cases/arrow/2.json", import.meta.url),
          "utf8",
        ),
      );
      assert.equal(distance, 1);
      assert.ok(
        generateCases(
          { ...definition, goals: [definition.target] },
          2,
        ).byDepth[2].some((c) => c.solution === "F U'"),
      );
      assert.ok(
        !records.some((c) => c.solutions.some((s) => s === "F U'" || s === "F' U")),
      );
    }
  }
});

test("adjacent swaps commute on defined pieces only, without collapsing unrelated routes", () => {
  const definition = definitions.arrow, target = partialTarget(definition.target);
  const stateFor = (text) => applyPartial(target, inverseAlgorithm(parseScramble(text)));
  const key = (text) => commutingKey(stateFor(text), parseScramble(text));
  assert.equal(key("B' F' R'"), key("F' B' R'"));
  // Find a swap which commutes on the pattern but not on all 72 stickers.
  const full = Uint8Array.from({ length: 72 }, (_, i) => i + 1);
  let found = false;
  for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) {
    const path = [a, b], swapped = [b, a];
    if (partialKey(applyPartial(target, path)) === partialKey(applyPartial(target, swapped)) &&
        partialKey(applyPartial(full, path)) !== partialKey(applyPartial(full, swapped))) {
      assert.equal(commutingKey(target, path), commutingKey(target, swapped));
      found = true;
    }
  }
  assert.ok(found, "partial-piece commutation differs from full-puzzle commutation");
  assert.notEqual(commutingKey(target, parseScramble("R U")),
    commutingKey(target, parseScramble("U R")));
  const records = ["B' F' R'", "F' B' R'"].map((solution, i) => ({ id: String(i), name: "", solution }));
  assert.equal(groupCases(records, definition).length, 1);
  assert.deepEqual(groupCases(records, definition)[0].solutions, ["B' F' R'"]);
});

test("grouping preserves distinct routes, case order, names, and derived mirror alternatives", () => {
  const definition = definitions.arrow;
  const records = [
    { id: "keep-first", name: "Recognizable", solution: "R BR' R'" },
    { id: "other-pattern", name: "", solution: "R'" },
    { id: "alternate", name: "", solution: "U' B U" },
    { id: "mirror-alternate", name: "", solution: "U B' U'" },
  ];
  const grouped = groupCases(records, definition);
  assert.deepEqual(grouped, [
    { id: "keep-first", name: "Recognizable", solutions: ["R BR' R'", "U' B U"] },
    { id: "other-pattern", name: "", solutions: ["R'"] },
  ]);
});
