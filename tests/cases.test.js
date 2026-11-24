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
test("every precalculated entry is minimal, uses an allowed last move, and stores no mirror twice", async () => {
  let alternateCount = 0;
  for (const [mode, definition] of Object.entries(definitions)) {
    const target = partialTarget(definition.target),
      shorter = shorterDistances(definition.target, 3, definition.goals),
      allowed = new Set(definition.firstMoves);
    for (let depth = 1; depth <= 4; depth++) {
      const text = await readFile(
          new URL(`../public/cases/${mode}/${depth}.json`, import.meta.url),
          "utf8",
        ),
        records = JSON.parse(text);
      assert.equal(records.length, manifest.modes[mode].counts[depth]);
      const algorithms = new Set(records.map((r) => r.solution)),
        ids = new Set(),
        seenStates = new Set();
      for (const entry of records) {
        assert.equal(typeof entry.name, "string");
        assert.ok(!ids.has(entry.id));
        ids.add(entry.id);
        const solution = parseScramble(entry.solution),
          setup = inverseAlgorithm(solution);
        assert.equal(solution.length, depth);
        assert.ok(allowed.has(setup[0]));
        const state = applyPartial(target, setup),
          key = partialKey(state);
        assert.ok((shorter.get(key) ?? Infinity) >= depth);
        assert.equal(
          partialKey(applyPartial(state, solution)),
          partialKey(target),
        );
        if (seenStates.has(key)) alternateCount++;
        seenStates.add(key);
        if (definition.mirrors) {
          const mirror = mirrorAlgorithm(solution),
            name = mirror.map((m) => moves[m].name).join(" ");
          assert.ok(!algorithms.has(name));
          assert.ok(
            (shorter.get(
              partialKey(applyPartial(target, inverseAlgorithm(mirror))),
            ) ?? Infinity) >= depth,
          );
        }
      }
      // White-center labels never enter the state representation; equal colors
      // stay equal and undefined pieces cannot acquire a visible color.
      for (const entry of [records[0], records.at(-1)])
        if (entry) {
          const solution = parseScramble(entry.solution),
            { frames, mask } = caseFrames(definition.target, solution);
          const slots = new Map(solved.map((s) => [slotKey(s.vertices), s.id]));
          const end = new Uint8Array(72);
          for (const sticker of frames.at(-1))
            if (mask.has(sticker.id))
              end[slots.get(slotKey(sticker.vertices))] = sticker.color + 1;
          assert.equal(partialKey(end), partialKey(target));
        }
    }
  }
  assert.ok(
    alternateCount > 0,
    "equal-depth alternatives must remain in the list",
  );
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
        !records.some((c) => c.solution === "F U'" || c.solution === "F' U"),
      );
    }
  }
});
