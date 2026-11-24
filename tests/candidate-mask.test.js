import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  candidateMask,
  solutionMask,
  parseScramble,
  stickerPositions,
  matchingGoal,
  physicalGroups,
  solved,
} from "../src/model/fto.js";
import {
  defaultCifRotation,
  frameForCamera,
  DEFAULT_CIF_FRAME,
} from "../src/vendor/orientation.js";
const scramble = parseScramble(
  "B R' D' B BR' B' BR' B L R' B L B' BR' D R L B' R' D' U' B' U' L BL' U BL",
);
const solution = parseScramble("B D BR' BL L D L B'");
function assertVisibleBlock(positions, color, target) {
  const visible = candidateMask(color);
  const groups = physicalGroups().filter((g) =>
    g.some((id) => visible.has(id)),
  );
  assert.equal(groups.length, 18);
  assert.equal(visible.size, 30);
  assert.ok(groups.every((g) => g.every((id) => visible.has(id))));
  for (const [slot, c] of target.first) {
    const id = positions.indexOf(slot);
    assert.equal(solved[id].color, c);
    assert.ok(visible.has(id), `required color ${c} at slot ${slot} is hidden`);
  }
}
test("reported white block keeps its interchangeable red center visible", () => {
  const positions = stickerPositions([...scramble, ...solution]);
  const target = matchingGoal(positions, 0);
  assert.ok(target);
  assert.equal(positions[10], 39);
  assert.equal(candidateMask(0).has(10), true);
  assertVisibleBlock(positions, 0, target);
  const cardMask = solutionMask(positions, target);
  assert.ok(cardMask.has(10));
  assert.equal(cardMask.size, 21);
  assert.equal(
    physicalGroups().filter((g) => g.some((id) => cardMask.has(id))).length,
    12,
  );
});
test("default camera is the simulator CIF hold", () => {
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const q = defaultCifRotation().invert();
  camera.position.set(0, 0, 9).applyQuaternion(q);
  camera.up.set(0, 1, 0).applyQuaternion(q);
  camera.lookAt(0, 0, 0);
  assert.equal(frameForCamera(camera).notation, "CIF");
  assert.equal(frameForCamera(camera).up, DEFAULT_CIF_FRAME.up);
  assert.equal(frameForCamera(camera).front, DEFAULT_CIF_FRAME.front);
});

test("18-piece mask includes nine other-orbit centers and three block-color centers", () => {
  for (let color = 0; color < 8; color++) {
    const mask = candidateMask(color);
    const groups = physicalGroups().filter((g) => g.some((id) => mask.has(id)));
    const centers = groups.filter((g) => g.length === 1);
    assert.equal(
      centers.filter(([id]) => solved[id].color === color).length,
      3,
    );
    assert.equal(
      centers.filter(([id]) => solved[id].color !== color).length,
      9,
    );
    assert.equal(groups.filter((g) => g.length === 2).length, 3);
    assert.equal(groups.filter((g) => g.length === 4).length, 3);
  }
});

test("First center defines exactly its three edges and three centers for every color", () => {
  for (let color = 0; color < 8; color++) {
    const mask = candidateMask(color, "fc");
    const groups = physicalGroups().filter((piece) => piece.some((id) => mask.has(id)));
    assert.equal(mask.size, 9);
    assert.equal(groups.length, 6);
    assert.equal(groups.filter((piece) => piece.length === 1).length, 3);
    assert.equal(groups.filter((piece) => piece.length === 2).length, 3);
    assert.ok(groups.every((piece) => piece.every((id) => mask.has(id))));
    assert.ok(groups.every((piece) => piece.some((id) => solved[id].color === color)));
    assert.ok([...mask].every((id) => candidateMask(color).has(id)));
    const solvedGoal = matchingGoal(stickerPositions([]), color, "fc");
    assert.ok(solvedGoal.first.every(([slot]) => mask.has(slot)));
  }
});
