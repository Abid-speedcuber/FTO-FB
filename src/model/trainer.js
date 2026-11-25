import { caseDefinitions, partialTarget, partialKey, applyPartial, inverseAlgorithm, mirrorAlgorithm } from './cases.js';
import { permutations, parseScramble, solved, moves, applyMove, slotKey, orbits } from './fto.js';
import { preparePartial, solvePartial } from './search.js';
import { builtinPatterns } from './solve-phases.js';

const caches = new Map();
// Check the same single-turn actions offered by the virtual puzzle, including
// slice and wide turns, so hints cannot hide a shorter input solution.
export const trainingMoves = [...moves, ...['inner', 'wide'].flatMap((layer) =>
  moves.map((move) => ({ ...move, layer })))];
const slots = new Map(solved.map((s) => [slotKey(s.vertices), s.id]));
export const trainingPermutations = trainingMoves.map((move) =>
  Uint8Array.from(applyMove(solved, move), (s) => slots.get(slotKey(s.vertices))));
export function stepTraining(state, move) {
  const next = new Uint8Array(72), permutation = trainingPermutations[move];
  for (let i = 0; i < 72; i++) if (state[i]) next[permutation[i]] = state[i];
  return next;
}
const orbitColors = new Map(orbits.flatMap((orbit) => {
  const colors = new Set(orbit.map((slot) => solved[slot].color));
  return orbit.map((slot) => [slot, colors]);
}));
const pick = (items, random) => items[Math.floor(random() * items.length)];

// Two turns out from every legal completion. Meeting this frontier from the
// scramble proves an optimum without building the enormous depth-four graph.
export function trainingGoals(mode) {
  if (caches.has(mode)) return caches.get(mode);
  const definition = caseDefinitions()[mode];
  if (!definition) throw new Error('Unknown training mode');
  const reverse = new Map(), queue = [];
  for (const goal of definition.goals) {
    const state = partialTarget(goal), key = partialKey(state);
    if (!reverse.has(key)) { reverse.set(key, []); queue.push({ state, path: [] }); }
  }
  for (let i = 0; i < queue.length; i++) {
    const { state, path } = queue[i];
    if (path.length === 2) continue;
    for (let m = 0; m < trainingMoves.length; m++) {
      const next = stepTraining(state, m), key = partialKey(next);
      if (reverse.has(key)) continue;
      const solution = [m ^ 1, ...path];
      reverse.set(key, solution);
      queue.push({ state: next, path: solution });
    }
  }
  const result = { ...definition, reverse };
  caches.set(mode, result);
  return result;
}

export function shortestTrainingSolution(state, mode, maxDepth = 5) {
  const { reverse } = trainingGoals(mode);
  function visit(current, left, path) {
    const tail = reverse.get(partialKey(current));
    if (tail && tail.length <= left) return [...path, ...tail];
    if (left <= 2) return null;
    for (let m = 0; m < trainingMoves.length; m++) {
      if (path.length && (path.at(-1) >> 1) === (m >> 1)) continue;
      const found = visit(stepTraining(current, m), left - 1, [...path, m]);
      if (found) return found;
    }
    return null;
  }
  for (let depth = 0; depth <= maxDepth; depth++) {
    const result = visit(state, depth, []);
    if (result) return result;
  }
  return null;
}

export function randomizeTrainingCase(mode, solution, random = Math.random, colors = [0], target) {
  const definition = trainingGoals(mode), rotations = builtinPatterns().g.permutations;
  const color = pick(colors, random);
  const paletteRotation = pick(rotations.filter((r) => solved[r[0]].color === color), random);
  const palette = Array.from({ length: 8 }, (_, color) => solved[paletteRotation[color * 9]].color);
  const seedTarget = target ?? definition.target;
  const rotation = pick(rotations.filter((r) => seedTarget.every(([slot, c]) =>
    orbitColors.get(r[slot]).has(palette[c]))), random);
  const transform = (target) => target.map(([slot, color]) => [rotation[slot], palette[color]]);
  const moveMap = permutations.map((p) => permutations.findIndex((q) =>
    p.every((slot, i) => q[rotation[i]] === rotation[slot])));
  return {
    mode, color,
    target: transform(seedTarget),
    goals: definition.goals.map(transform),
    solution: solution.map((m) => moveMap[m]),
  };
}

export function generateTrainingCase(mode, depth, entries, random = Math.random, colors = [0]) {
  if (!colors.length || colors.some((c) => !Number.isInteger(c) || c < 0 || c > 7)) throw new Error('Select a color.');
  const definition = trainingGoals(mode);
  for (let attempt = 0; attempt < 500; attempt++) {
    let solution;
    if (depth === 'any') {
      const scramble = [], length = 1 + Math.floor(random() * 30);
      for (let i = 0; i < length; i++) {
        const allowed = Array.from({ length: 16 }, (_, m) => m)
          .filter((m) => !i || (m >> 1) !== (scramble.at(-1) >> 1));
        scramble.push(pick(allowed, random));
      }
      solution = inverseAlgorithm(scramble);
    } else {
      solution = parseScramble(pick(pick(entries, random).solutions, random));
      if (definition.mirrors && random() < 0.5) solution = mirrorAlgorithm(solution);
      if (depth === 5) solution = [Math.floor(random() * 16), ...solution];
    }
    const state = applyPartial(partialTarget(definition.target), inverseAlgorithm(solution));
    if (depth === 'any') {
      if (definition.goals.some((goal) => partialKey(partialTarget(goal)) === partialKey(state))) continue;
    } else {
      const shorter = shortestTrainingSolution(state, mode, depth - 1);
      if (shorter) continue;
    }
    let target;
    if (depth === 'any') {
      const planned = planTrainingSolution(mode, state, solution.length);
      solution = planned.moves; target = planned.target.first;
    }
    return { ...randomizeTrainingCase(mode, solution, random, colors, target), limit: depth === 'any' ? null : depth,
      source: depth === 'any' ? 'Random scramble' : depth === 5 ? 'Generated five-mover' : 'Case list' };
  }
  throw new Error('Could not generate this depth. Try another case.');
}

const completionCache = new WeakMap();
export function trainingComplete(state, goals) {
  if (!completionCache.has(goals)) completionCache.set(goals, new Set(goals.map((goal) => partialKey(partialTarget(goal)))));
  return completionCache.get(goals).has(partialKey(state));
}


const plannerTables = new Map();
export function planTrainingSolution(mode, state, maxDepth = Infinity) {
  if (!plannerTables.has(mode)) {
    const definition = trainingGoals(mode);
    plannerTables.set(mode, preparePartial(definition.target, definition.goals));
  }
  let solution;
  solvePartial(plannerTables.get(mode), state, { maxDepth, onSolution: (found) => { solution = found; } });
  if (!solution) throw new Error('Could not solve this training case.');
  return solution;
}
