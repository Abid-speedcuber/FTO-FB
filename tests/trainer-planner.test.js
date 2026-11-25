import test from 'node:test';
import assert from 'node:assert/strict';
import { planTrainingSolution, trainingGoals, trainingComplete } from '../src/model/trainer.js';
import { partialTarget, partialKey, applyPartial, stepPartial, inverseAlgorithm } from '../src/model/cases.js';
import { parseScramble } from '../src/model/fto.js';

test('Trainer shares the solver search and returns shortest shallow routes using only defined pieces', () => {
  for (const mode of ['center', 'arrow', 'fc+1']) {
    const definition = trainingGoals(mode);
    for (const scramble of [[], parseScramble("R U' L"), parseScramble("BR F R'")]) {
      const initial = applyPartial(partialTarget(definition.target), scramble);
      const solution = planTrainingSolution(mode, initial, 3);
      let frontier = [initial], seen = new Set([partialKey(initial)]), depth = 0;
      while (!frontier.some((state) => trainingComplete(state, definition.goals))) {
        const next = [];
        for (const state of frontier) for (let m = 0; m < 16; m++) {
          const child = stepPartial(state, m), key = partialKey(child);
          if (!seen.has(key)) { seen.add(key); next.push(child); }
        }
        frontier = next; depth++;
        assert.ok(depth <= 3);
      }
      assert.equal(solution.moves.length, depth);
      assert.equal(trainingComplete(applyPartial(initial, solution.moves), definition.goals), true);
    }
  }
});

test('long random scrambles receive actual solver plans without changing the case', () => {
  const scramble = parseScramble("R U' L BR D F' B BL R' U F L' D BR' BL U' R B' F D' L BL' U R' F");
  for (const mode of ['center', 'arrow', 'fc+1']) {
    const definition = trainingGoals(mode), initial = applyPartial(partialTarget(definition.target), scramble);
    const solution = planTrainingSolution(mode, initial, scramble.length);
    assert.ok(solution.moves.length < scramble.length);
    assert.equal(trainingComplete(applyPartial(initial, solution.moves), definition.goals), true);
    assert.deepEqual(applyPartial(partialTarget(solution.target.first), inverseAlgorithm(solution.moves)), initial);
  }
});
