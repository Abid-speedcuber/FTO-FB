import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateTrainingCase, shortestTrainingSolution, trainingComplete, trainingGoals, trainingMoves, stepTraining, randomizeTrainingCase } from '../src/model/trainer.js';
import { partialTarget, applyPartial, inverseAlgorithm, caseFrames } from '../src/model/cases.js';
import { solved, slotKey, orbits } from '../src/model/fto.js';
import { readTrainerKeyboard, SHARED_KEYBOARD_KEY } from '../src/trainer-keyboard.js';
import { defaultConfig } from '../src/vendor/keyboard-engine.js';

function randomSeed(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const rows = (mode, depth) => readFile(new URL(`../public/cases/${mode}/${depth}.json`, import.meta.url), 'utf8').then(JSON.parse);

test('3/4/5 movers have the promised optimum, and randomized cases solve with their own pieces', async () => {
  const slots = new Map(solved.map((s) => [slotKey(s.vertices), s.id]));
  for (const mode of ['center', 'arrow', 'fc+1']) {
    for (const depth of [3, 4, 5]) {
      const entries = await rows(mode, Math.min(depth, 4));
      const c = generateTrainingCase(mode, depth, entries, randomSeed(depth * 57));
      assert.equal(c.solution.length, depth);
      assert.ok(c.solution.every((m) => m >= 0 && m < 16));
      const initial = applyPartial(partialTarget(c.target), inverseAlgorithm(c.solution));
      assert.equal(trainingComplete(initial, c.goals), false);
      assert.equal(trainingComplete(applyPartial(initial, c.solution), c.goals), true);
      // Recoloring and rotations preserve the shape; check the actual rendered
      // puzzle agrees with the partial model used for completion checks.
      const frames = caseFrames(c.target, c.solution);
      for (const index of [0, depth]) {
        const partial = new Uint8Array(72);
        for (const s of frames.frames[index]) if (frames.mask.has(s.id)) partial[slots.get(slotKey(s.vertices))] = s.color + 1;
        assert.equal(trainingComplete(partial, c.goals), index === depth);
      }
      // Independent breadth-first frontiers in the full interactive move set:
      // intersecting radii floor((n-1)/2) and ceil((n-1)/2) catches every shorter route.
      function frontier(seeds, radius) {
        const all = new Map(seeds.map((state) => [String.fromCharCode(...state), state]));
        let level = [...all.values()];
        for (let d = 0; d < radius; d++) {
          const next = [];
          for (const state of level) for (let m = 0; m < trainingMoves.length; m++) {
            const child = stepTraining(state, m), key = String.fromCharCode(...child);
            if (!all.has(key)) { all.set(key, child); next.push(child); }
          }
          level = next;
        }
        return all;
      }
      const forward = frontier([initial], Math.floor((depth - 1) / 2));
      const reverse = frontier(c.goals.map(partialTarget), Math.ceil((depth - 1) / 2));
      assert.equal([...forward.keys()].some((key) => reverse.has(key)), false);
    }
  }
});

test('completion accepts every valid goal pose, including pseudo alternatives', () => {
  for (const mode of ['center', 'arrow', 'fc+1']) {
    const definition = trainingGoals(mode);
    assert.ok(definition.goals.length > 1);
    for (const goal of definition.goals) {
      assert.equal(trainingComplete(partialTarget(goal), definition.goals), true);
      assert.deepEqual(shortestTrainingSolution(partialTarget(goal), mode, 0), []);
    }
  }
});

test('any-depth generates unsolved cases with valid known solutions and no move cap', () => {
  const lengths = new Set();
  for (let seed = 1; seed <= 15; seed++) {
    const c = generateTrainingCase('arrow', 'any', [], randomSeed(seed * 999));
    const state = applyPartial(partialTarget(c.target), inverseAlgorithm(c.solution));
    assert.equal(c.limit, null);
    assert.equal(trainingComplete(state, c.goals), false);
    assert.equal(trainingComplete(applyPartial(state, c.solution), c.goals), true);
    lengths.add(c.solution.length);
  }
  assert.ok(lengths.size > 5);
  assert.ok([...lengths].some((n) => n > 5));
});

test('Trainer reads simulator 3×3 bindings without changing the saved profiles', () => {
  const config = defaultConfig(3);
  config.modes[0].bindings.find((b) => b.trigger === 'J').action.face = 'D';
  const data = JSON.stringify({ version: 2, profiles: { 3: config, 4: defaultConfig(4) } });
  const readKeys = [];
  const storage = { getItem(key) { readKeys.push(key); return key === SHARED_KEYBOARD_KEY ? data : null; } };
  const { engine, warning } = readTrainerKeyboard(storage);
  assert.equal(warning, '');
  assert.equal(engine.keyDown('KeyJ', { size: 3 }).action.face, 'D');
  assert.deepEqual(readKeys, [SHARED_KEYBOARD_KEY]);
  assert.equal(readTrainerKeyboard({ getItem() { throw Error('disabled'); } }).engine.config.modes[0].id, 'cif');
});


test('selected colors stay on legal orbits while every allowed face and orientation varies', () => {
  const slotsByColor = new Map();
  for (let color = 0; color < 8; color++) {
    const seen = new Set();
    for (let seed = 1; seed <= 80; seed++) {
      const c = randomizeTrainingCase('center', [0, 2, 4], randomSeed(seed * 7151), [color]);
      assert.equal(c.color, color);
      for (const target of [c.target, ...c.goals]) for (const [slot, paint] of target) {
        assert.ok(orbits.find((orbit) => orbit.includes(slot)).some((id) => solved[id].color === paint));
      }
      seen.add([...c.target].sort((a, b) => a[0] - b[0]).map(([slot, paint]) => `${slot}:${paint}`).join(','));
    }
    assert.ok(seen.size >= 12, `color ${color} must cover its four faces and three orientations`);
    slotsByColor.set(color, seen);
  }
  const selected = new Set();
  for (let seed = 1; seed < 40; seed++) selected.add(randomizeTrainingCase('arrow', [0], randomSeed(seed * 7373), [0, 7]).color);
  assert.deepEqual([...selected].sort(), [0, 7]);
  assert.throws(() => generateTrainingCase('center', 3, [], Math.random, []), /Select a color/);
});
