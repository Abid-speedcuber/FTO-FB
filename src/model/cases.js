import {
  orbits,
  solved,
  solvedState,
  physicalGroups,
  goalsFor,
  moves,
  parseScramble,
  applyMove,
  permutations,
} from "./fto.js";
export const CASE_MODES = [
  { id: "arrow", label: "Arrow block" },
  { id: "fc+1", label: "FC+1" },
  { id: "center", label: "Center" },
];
export function inverseAlgorithm(algorithm) {
  return [...algorithm].reverse().map((m) => m ^ 1);
}
export function mirrorAlgorithm(algorithm) {
  const swapped = { R: "L", L: "R", BR: "BL", BL: "BR" };
  return algorithm.map((m) => {
    const name = moves[m].name,
      face = name.replace("'", "");
    return moves.findIndex(
      (turn) =>
        turn.name === (swapped[face] ?? face) + (name.endsWith("'") ? "" : "'"),
    );
  });
}
export const algorithmText = (algorithm) =>
  algorithm.map((m) => moves[m].name).join(" ");
export function caseDefinitions() {
  const pieces = physicalGroups(),
    centers = new Set(pieces.filter((g) => g.length === 1).flat());
  const arrow = goalsFor(0, "pseudo-arrow").find((v) => {
    const face = v.shapeFirst.find(([s, c]) => c === 0 && centers.has(s));
    if (Math.floor(face[0] / 9) !== 3) return false;
    const source = pieces.find((g) => g.includes(v.cornerSource));
    if (
      source
        .map((id) => solved[id].color)
        .sort()
        .join(",") !== "0,2,4,6"
    )
      return false;
    const corner = pieces.find((g) => g.includes(v.cornerSlot));
    if (!corner.some((id) => solved[id].vertices.some((p) => p[0] === 3)))
      return false;
    const shape = new Map(v.shapeFirst),
      edgeColors = pieces
        .filter((g) => g.length === 2 && g.every((id) => shape.has(id)))
        .flatMap((g) => g.map((id) => shape.get(id)))
        .filter((c) => c !== 0)
        .sort();
    return (
      edgeColors.join(",") === "1,2" &&
      v.triplet.some(
        ([s, c]) => Math.floor(s / 9) === 3 && corner.includes(s) && c === 6,
      )
    );
  });
  if (!arrow) throw new Error("Case-list arrow target is missing");
  const fc = goalsFor(0, "pseudo-fc+1").find(
    (v) =>
      v.rotation === arrow.rotation &&
      v.up === arrow.up &&
      v.cornerSource === arrow.cornerSource &&
      v.cornerSlot === arrow.cornerSlot,
  );
  const definitions = {
    arrow: {
      target: arrow.first,
      firstMoves: parseScramble("R R' L L' U U'"),
      mirrors: true,
    },
    "fc+1": {
      target: fc.first,
      firstMoves: parseScramble("R R' L L' D D' U U'"),
      mirrors: true,
    },
    center: {
      target: arrow.firstCenter,
      firstMoves: parseScramble("R R'"),
      mirrors: false,
    },
  };
  const bag = (pattern) => {
    const paint = new Map(pattern);
    return pieces
      .filter((piece) => piece.every((id) => paint.has(id)))
      .map(
        (piece) =>
          `${piece.length}:${piece
            .map((id) => paint.get(id))
            .sort()
            .join(",")}`,
      )
      .sort()
      .join("|");
  };
  const orbitBySlot = new Map(
    orbits.flatMap((orbit, i) => orbit.map((slot) => [slot, i])),
  );
  const signature = (pattern) => {
    const counts = new Array(orbits.length * 8).fill(0);
    for (const [slot, color] of pattern)
      counts[orbitBySlot.get(slot) * 8 + color]++;
    return counts.join(",");
  };
  for (const [mode, definition] of Object.entries(definitions)) {
    const wanted = bag(definition.target),
      orbitCounts = signature(definition.target),
      seen = new Set();
    const variants = goalsFor(
      0,
      mode === "center"
        ? "fc"
        : mode === "arrow"
          ? "pseudo-arrow"
          : "pseudo-fc+1",
    );
    definition.goals = variants
      .map((v) => v.first)
      .filter((pattern) => {
        if (bag(pattern) !== wanted || signature(pattern) !== orbitCounts)
          return false;
        const key = partialKey(partialTarget(pattern));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  return definitions;
}
export function partialTarget(target) {
  const state = new Uint8Array(72);
  for (const [slot, color] of target) state[slot] = color + 1;
  return state;
}
export const partialKey = (state) => String.fromCharCode(...state);
export function stepPartial(state, move) {
  const next = new Uint8Array(72),
    p = permutations[move];
  for (let i = 0; i < 72; i++) if (state[i]) next[p[i]] = state[i];
  return next;
}
export function applyPartial(state, algorithm) {
  for (const m of algorithm) state = stepPartial(state, m);
  return state;
}
export function caseFrames(target, solution) {
  const colors = new Map(target),
    mask = new Set(colors.keys());
  let state = solvedState(3).map((s) => ({
    ...s,
    color: colors.get(s.id) ?? s.color,
  }));
  for (const m of inverseAlgorithm(solution))
    state = applyMove(state, moves[m]);
  const frames = [state];
  for (const m of solution) {
    state = applyMove(state, moves[m]);
    frames.push(state);
  }
  return { frames, mask };
}
