import { FACES, solvedState, applyMove } from "./puzzle.js";
import { builtinPatterns } from "./solve-phases.js";
export { FACES, solvedState, applyMove };
export const names = [
  "White",
  "Red",
  "Purple",
  "Green",
  "Blue",
  "Gray",
  "Orange",
  "Yellow",
];
export const slotKey = (vertices) =>
  vertices
    .map((v) => v.join(","))
    .sort()
    .join("|");
export const solved = solvedState(3);
const slots = new Map(solved.map((s) => [slotKey(s.vertices), s.id]));
// Conventional CIF labels are distinct from the simulator's geometric face IDs.
// Keep input, search output, and animation on the same csTimer convention.
export const CIF_FACES = Object.freeze({
  U: "U",
  F: "BR",
  R: "R",
  L: "F",
  BR: "B",
  BL: "BL",
  B: "L",
  D: "D",
});
const notationByGeometricFace = Object.fromEntries(
  Object.entries(CIF_FACES).map(([notation, geometric]) => [
    geometric,
    notation,
  ]),
);
export function notationFaceAtSlot(slot) {
  return notationByGeometricFace[FACES[Math.floor(slot / 9)].name];
}
export const moves = FACES.flatMap((label) =>
  [1, -1].map((dir) => ({
    name: label.name + (dir < 0 ? "'" : ""),
    normal: FACES.find((f) => f.name === CIF_FACES[label.name]).normal,
    layer: "outer",
    dir,
  })),
);
export const permutations = moves.map((m) =>
  Uint8Array.from(applyMove(solved, m), (s) => slots.get(slotKey(s.vertices))),
);
export function parseScramble(text) {
  if (!text.trim()) return [];
  return text
    .trim()
    .replaceAll("’", "'")
    .split(/\s+/)
    .map((token) => {
      const match = /^(BR|BL|U|R|F|L|B|D)('|2)?$/i.exec(token);
      if (!match)
        throw new Error(
          `Unknown move “${token}”. Use U, R, F, L, B, D, BR, BL, with ' or 2.`,
        );
      return moves.findIndex(
        (m) => m.name === match[1].toUpperCase() + (match[2] ? "'" : ""),
      );
    });
}
export function stickerPositions(algorithm) {
  let positions = Uint8Array.from({ length: 72 }, (_, i) => i);
  for (const m of algorithm)
    positions = positions.map((p) => permutations[m][p]);
  return positions;
}
export function colorsAt(positions) {
  const colors = new Uint8Array(72);
  positions.forEach((p, i) => (colors[p] = solved[i].color));
  return colors;
}
export function goalsFor(color, mode = "fb") {
  const fields = {
    fb: "first",
    "fc+1": "plusOne",
    arrow: "arrow",
    fc: "firstCenter",
  };
  if (!Object.hasOwn(fields, mode)) throw new Error(`Unknown mode: ${mode}`);
  const { families, variants } = builtinPatterns();
  let goals = variants.filter(
    (v) => families[v.family].axes[v.center].name === FACES[color].name,
  );
  if (mode === "fc") {
    // The center has no triplet choice: retain one copy of each rigid pose.
    const seen = new Set();
    goals = goals.filter((v) => {
      if (seen.has(v.rotation)) return false;
      seen.add(v.rotation);
      return true;
    });
  }
  return mode === "fb"
    ? goals
    : goals.map((v) => ({ ...v, first: v[fields[mode]] }));
}
export function matchingGoal(positions, color, mode = "fb") {
  const colors = colorsAt(positions);
  return goalsFor(color, mode).find((v) =>
    v.first.every(([p, c]) => colors[p] === c),
  );
}
export function physicalGroups() {
  const parent = solved.map((s) => s.id),
    edges = new Map(),
    root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (const s of solved)
    for (let k = 0; k < 3; k++) {
      const key = [s.vertices[k].join(","), s.vertices[(k + 1) % 3].join(",")]
        .sort()
        .join("|");
      const t = edges.get(key);
      if (t && t.color !== s.color) parent[root(s.id)] = root(t.id);
      else if (!t) edges.set(key, s);
    }
  const groups = new Map();
  for (const s of solved) {
    const r = root(s.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(s.id);
  }
  return [...groups.values()];
}
export const orbits = [];
for (let i = 0; i < 72; i++) {
  if (orbits.some((o) => o.includes(i))) continue;
  const o = [i],
    set = new Set(o);
  for (let j = 0; j < o.length; j++)
    for (const p of permutations)
      if (!set.has(p[o[j]])) {
        set.add(p[o[j]]);
        o.push(p[o[j]]);
      }
  orbits.push(o);
}

// Include all interchangeable centers of the block's four colors. This fixed
// 18-piece mask follows identities through moves and is shared by every card.
export function candidateMask(color) {
  const bases = goalsFor(color).filter((v) =>
    v.first.every(([p, c]) => solved[p].color === c),
  );
  const visible = new Set(bases.flatMap((v) => v.first.map(([p]) => p)));
  const centers = physicalGroups()
    .filter((g) => g.length === 1)
    .map(([id]) => id);
  const colors = new Set(
    centers.filter((id) => visible.has(id)).map((id) => solved[id].color),
  );
  centers
    .filter((id) => colors.has(solved[id].color))
    .forEach((id) => visible.add(id));
  return visible;
}
