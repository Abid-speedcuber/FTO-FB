import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FACES, moves, parseScramble, solvedState, applyMove } from "../src/model/fto.js";
import { FRAMES, DEFAULT_CIF_FRAME, frameForCamera, snappedViewRotation } from "../src/vendor/orientation.js";
import { moveNamesForFrame, formatAlgorithm, formatHold, parseHold } from "../src/view-notation.js";

test("default CIF leaves all standard solver move names unchanged", () => {
  assert.deepEqual(moveNamesForFrame(DEFAULT_CIF_FRAME), moves.map((move) => move.name));
  assert.equal(formatAlgorithm(parseScramble("R U' BR L F' BL")), "R U' BR L F' BL");
});
test("all 48 CIF/EIF holds relabel moves without changing their physical turns", () => {
  assert.equal(FRAMES.filter((frame) => frame.notation === "CIF").length, 24);
  assert.equal(FRAMES.filter((frame) => frame.notation === "EIF").length, 24);
  const state = applyMove(solvedState(3), moves[2]);
  for (const frame of FRAMES) {
    const names = moveNamesForFrame(frame);
    assert.equal(new Set(names).size, 16);
    for (const [index, name] of names.entries()) {
      const face = FACES.findIndex((face) => face.name === name.replace("'", "")),
        interpreted = { ...moves[index], normal: frame.normals[face], dir: name.endsWith("'") ? -1 : 1 };
      assert.deepEqual(interpreted.normal, moves[index].normal);
      assert.equal(interpreted.dir, moves[index].dir);
      assert.deepEqual(applyMove(state, interpreted), applyMove(state, moves[index]));
      assert.equal(names[index ^ 1], name.endsWith("'") ? name.slice(0, -1) : name + "'");
    }
  }
});
test("camera holds, including rolls and EIF, determine the displayed face labels", () => {
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  for (const frame of FRAMES) {
    const q = snappedViewRotation(frame).invert();
    camera.position.set(0, 0, 9).applyQuaternion(q);
    camera.quaternion.copy(q);
    camera.up.set(0, 1, 0).applyQuaternion(q);
    const detected = frameForCamera(camera);
    assert.equal(detected, frame);
    assert.deepEqual(moveNamesForFrame(detected), moveNamesForFrame(frame));
  }
  const original = [...parseScramble("R U' F BL'")];
  const snapshot = [...original];
  for (const frame of FRAMES) formatAlgorithm(original, frame);
  assert.deepEqual(original, snapshot, "canonical solver paths stay unchanged");
});

test("hold markers use original CIF face names and round-trip every CIF/EIF frame", () => {
  assert.equal(formatHold(DEFAULT_CIF_FRAME), "{U,F}");
  assert.equal(parseHold("{U,F}"), DEFAULT_CIF_FRAME);
  assert.equal(parseHold(" {r, f} ").notation, "EIF");
  assert.equal(formatHold(parseHold("u,br")), "{U,BR}");
  for (const frame of FRAMES) assert.equal(parseHold(formatHold(frame)), frame);
  for (const invalid of ["", "U", "{U,F", "U,F}", "{U,U}", "{U,D}", "{R,BL}", "{L,BR}", "{F,B}", "{X,F}", "{U,F,R}"])
    assert.equal(parseHold(invalid), null, invalid);
});
