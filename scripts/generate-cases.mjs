import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  caseDefinitions,
  partialTarget,
  partialKey,
  stepPartial,
  applyPartial,
  mirrorAlgorithm,
  inverseAlgorithm,
  algorithmText,
} from "../src/model/cases.js";
import { parseScramble } from "../src/model/fto.js";
const root = new URL("../public/cases/", import.meta.url);
export function shorterDistances(target, maxDepth = 3, goals = [target]) {
  const seen = new Map();
  let level = [];
  for (const goal of goals) {
    const state = partialTarget(goal),
      key = partialKey(state);
    if (!seen.has(key)) {
      seen.set(key, 0);
      level.push(state);
    }
  }
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [];
    for (const state of level)
      for (let m = 0; m < 16; m++) {
        const moved = stepPartial(state, m),
          key = partialKey(moved);
        if (!seen.has(key)) {
          seen.set(key, depth);
          next.push(moved);
        }
      }
    level = next;
  }
  return seen;
}
export function generateCases(definition, maxDepth = 4) {
  const start = partialTarget(definition.target),
    shorter = shorterDistances(
      definition.target,
      maxDepth - 1,
      definition.goals,
    ),
    byDepth = {};
  let level = [{ state: start, path: [] }];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next = [],
      records = [],
      represented = new Set();
    for (const node of level)
      for (const move of depth === 1
        ? definition.firstMoves
        : Array.from({ length: 16 }, (_, m) => m)) {
        if (node.path.length && node.path.at(-1) >> 1 === move >> 1) continue;
        const state = stepPartial(node.state, move),
          key = partialKey(state);
        if ((shorter.get(key) ?? Infinity) < depth) continue;
        const path = [...node.path, move];
        next.push({ state, path });
        const sequence = path.map((m) => m.toString(16)).join("");
        if (represented.has(sequence)) continue;
        if (definition.mirrors) {
          const reflected = mirrorAlgorithm(path),
            reflectedState = applyPartial(start, reflected);
          if ((shorter.get(partialKey(reflectedState)) ?? Infinity) < depth)
            throw new Error(
              "Mirror has a shorter solution: " + algorithmText(reflected),
            );
          represented.add(reflected.map((m) => m.toString(16)).join(""));
        }
        represented.add(sequence);
        records.push({
          id: `${depth}-${sequence}`,
          name: "",
          solution: algorithmText(inverseAlgorithm(path)),
        });
      }
    byDepth[depth] = records;
    level = next;
  }
  return { byDepth, shorter };
}
// Two solutions are equivalent only when connected by adjacent swaps that
// leave the defined partial state unchanged at the point of each swap.
export function commutingKey(state, algorithm) {
  const encode = (path) => path.map((move) => move.toString(16)).join("");
  const seen = new Set([encode(algorithm)]), queue = [algorithm];
  for (let n = 0; n < queue.length; n++) {
    const path = queue[n];
    let prefix = state;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      if (a !== b && partialKey(stepPartial(stepPartial(prefix, a), b)) ===
          partialKey(stepPartial(stepPartial(prefix, b), a))) {
        const swapped = [...path];
        [swapped[i], swapped[i + 1]] = [b, a];
        const key = encode(swapped);
        if (!seen.has(key)) { seen.add(key); queue.push(swapped); }
      }
      prefix = stepPartial(prefix, a);
    }
  }
  return [...seen].sort()[0];
}

export function groupCases(records, definition) {
  const target = partialTarget(definition.target), lookup = new Map(), groups = [];
  for (const record of records) {
    for (const text of record.solutions ?? [record.solution]) {
      let algorithm = parseScramble(text);
      const state = applyPartial(target, inverseAlgorithm(algorithm)), key = partialKey(state);
      let match = lookup.get(key);
      if (!match) {
        const group = { id: record.id, name: record.name, solutions: [], state, keys: new Set() };
        groups.push(group);
        match = { group, reflected: false };
        lookup.set(key, match);
        if (definition.mirrors) {
          const mirror = mirrorAlgorithm(algorithm),
            mirrorKey = partialKey(applyPartial(target, inverseAlgorithm(mirror)));
          if (mirrorKey !== key) lookup.set(mirrorKey, { group, reflected: true });
        }
      }
      const { group, reflected } = match;
      if (!group.name && record.name) group.name = record.name;
      if (reflected) algorithm = mirrorAlgorithm(algorithm);
      if (partialKey(applyPartial(target, inverseAlgorithm(algorithm))) !== partialKey(group.state))
        throw new Error("Mirrored alternative does not match its case");
      const equivalence = commutingKey(group.state, algorithm);
      if (!group.keys.has(equivalence)) {
        group.keys.add(equivalence);
        group.solutions.push(algorithmText(algorithm));
      }
    }
  }
  return groups.map(({ state, keys, ...record }) => record);
}

export function preserveCaseEdits(previous, generated) {
  const existing = new Map(
    previous.map((c, i) => [c.id, { name: c.name, index: i }]),
  );
  return generated
    .map((c, i) => ({
      ...c,
      name: existing.get(c.id)?.name ?? "",
      order: existing.get(c.id)?.index ?? previous.length + i,
    }))
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...c }) => c);
}
async function main() {
  const definitions = caseDefinitions(),
    manifest = {
      version: 2,
      pageSize: 40,
      goal: "fixed pictured seed; reject shorter formations on any face/slot using only defined pieces",
      modes: {},
    };
  for (const [mode, definition] of Object.entries(definitions)) {
    const { byDepth } = generateCases(definition);
    await mkdir(new URL(mode + "/", root), { recursive: true });
    const counts = {};
    for (let depth = 1; depth <= 4; depth++) {
      const url = new URL(`${mode}/${depth}.json`, root);
      let previous = [];
      try {
        previous = JSON.parse(await readFile(url, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const records = groupCases(preserveCaseEdits(previous, byDepth[depth]), definition);
      await writeFile(
        url,
        "[\n" +
          records.map((c) => "  " + JSON.stringify(c)).join(",\n") +
          "\n]\n",
      );
      counts[depth] = records.length;
    }
    manifest.modes[mode] = {
      target: definition.target,
      mirrors: definition.mirrors,
      firstMoves: algorithmText(definition.firstMoves),
      counts,
      completionGoals: definition.goals.length,
    };
    console.log(mode, counts);
  }
  manifest.revision = createHash("sha256")
    .update(JSON.stringify(manifest))
    .digest("hex")
    .slice(0, 12);
  await writeFile(
    new URL("manifest.json", root),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}
if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").href === import.meta.url
)
  await main();
