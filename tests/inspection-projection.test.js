import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { UNDEFINED_COLOR } from "../src/vendor/viewer-colors.js";
const undefinedRGB = new THREE.Color(UNDEFINED_COLOR).toArray();
import {
  InspectionProjection,
  projectionGeometry,
  projectionVisible,
} from "../src/vendor/inspection-projection.js";
import {
  FACES,
  solvedState,
  applyMove,
  moves,
  candidateMask,
} from "../src/model/fto.js";
const colors = Object.fromEntries(FACES.map((f) => [f.name, f.color]));
test("rear sheets preserve all defined and undefined stickers before and after a turn", () => {
  const selection = candidateMask(0);
  for (const state of [solvedState(3), applyMove(solvedState(3), moves[4])]) {
    const faces = projectionGeometry(3, state, selection);
    assert.equal(faces.length, 8);
    assert.equal(faces.flatMap((f) => f.colors.slice(1)).length, 72);
    assert.equal(
      faces.flatMap((f) => f.colors).filter((c) => c === 8).length,
      42,
    );
    const scene = new THREE.Scene(),
      projection = new InspectionProjection(scene);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(6, 4, 7);
    projection.setVisible(true);
    projection.render({ size: 3, state, selection, colors, camera });
    assert.equal(projection.backingMaterial.color.getHex(), 0);
    assert.equal(projection.backingMaterial.opacity, 1);
    assert.equal(projection.backingMaterial.transparent, false);
    faces.forEach((face, i) => {
      const geometry = projection.meshes[i].geometry;
      const rgb = geometry.getAttribute("color").array;
      assert.ok(
        [...geometry.getAttribute("position").array].every(Number.isFinite),
      );
      assert.ok([...rgb.slice(0, 9)].every((v) => v === 0));
      face.colors.forEach((c, sticker) => {
        if (c === 8)
          assert.ok(
            [...rgb.slice(sticker * 9, sticker * 9 + 9)].every(
              (v, i) => Math.abs(v - undefinedRGB[i % 3]) < 1e-6,
            ),
          );
      });
    });
    projection.dispose();
    assert.equal(scene.children.length, 0);
  }
});
test("rear sheets follow camera orbit and selection-only changes without revealing front faces", () => {
  const scene = new THREE.Scene(),
    projection = new InspectionProjection(scene),
    state = solvedState(3),
    camera = new THREE.PerspectiveCamera();
  projection.setVisible(true);
  for (const point of [
    [6, 4, 7],
    [-6, -4, -7],
  ]) {
    camera.position.set(...point);
    projection.render({ size: 3, state, colors, camera });
    assert.ok(projection.meshes.some((m) => m.visible));
    assert.ok(projection.meshes.some((m) => !m.visible));
    projection.meshes.forEach((mesh, i) =>
      assert.equal(
        mesh.visible,
        projectionVisible(
          new THREE.Vector3(...FACES[i].normal).normalize().toArray(),
          point,
        ),
      ),
    );
    assert.ok(
      projection.root.position
        .clone()
        .normalize()
        .dot(camera.position.clone().normalize()) < -0.999,
    );
  }
  projection.render({ size: 3, state, selection: new Set(), colors, camera });
  for (const mesh of projection.meshes)
    assert.ok(
      [...mesh.geometry.getAttribute("color").array.slice(9)].every(
        (v, i) => Math.abs(v - undefinedRGB[i % 3]) < 1e-6,
      ),
    );
  projection.setVisible(false);
  assert.equal(projection.root.visible, false);
  let disposed = 0;
  projection.meshes.forEach((m) =>
    m.geometry.addEventListener("dispose", () => disposed++),
  );
  projection.dispose();
  assert.equal(disposed, 8);
});

test("rear stickers rotate with every move and meet the settled projection exactly", async () => {
  const { PuzzleMeshes } = await import("../src/vendor/puzzle-meshes.js");
  const scene = new THREE.Scene(),
    projection = new InspectionProjection(scene),
    camera = new THREE.PerspectiveCamera(),
    materials = FACES.map((face) => new THREE.MeshBasicMaterial({ color: face.color })),
    puzzle = new PuzzleMeshes(scene, materials, materials[0]),
    state = solvedState(3),
    selection = candidateMask(0);
  camera.position.set(6, 4, 7);
  projection.setVisible(true);
  // Compare ink vertices and colors in world space, independent of mesh/band order.
  const ink = () => projection.activeMeshes.flatMap((mesh) => {
    const position = mesh.geometry.getAttribute("position"),
      color = mesh.geometry.getAttribute("color"),
      start = mesh.userData.backingCount;
    return Array.from({ length: position.count - start }, (_, i) => {
      const index = start + i;
      const point = new THREE.Vector3().fromBufferAttribute(position, index)
        .applyQuaternion(mesh.quaternion).add(mesh.position);
      return [...point.toArray(), color.getX(index), color.getY(index), color.getZ(index)]
        .map((v) => Math.round(v * 1e5) || 0).join(",");
    });
  }).sort();
  for (const move of moves) {
    puzzle.update(3, state, [move], selection);
    for (const progress of [0, 0.5, 1]) {
      puzzle.rotate((band) => band.turns.reduce((angle, turn) =>
        angle - turn.sign * move.dir * 2 * Math.PI / 3 * progress, 0));
      projection.render({ size: 3, state, selection, colors, camera, animation: puzzle });
      assert.equal(ink().length, 72 * 3);
      assert.ok(projection.activeMeshes.some((mesh) => mesh.visible));
      for (const mesh of projection.activeMeshes)
        assert.ok(mesh.quaternion.equals(puzzle.groups[mesh.userData.band].quaternion));
    }
    const endpoint = ink();
    projection.render({ size: 3, state: applyMove(state, move), selection, colors, camera });
    assert.deepEqual(endpoint, ink());
    assert.equal(projection.meshes.filter((mesh) => mesh.visible).length,
      projection.activeMeshes.filter((mesh) => mesh.visible).length);
  }
  projection.dispose();
  puzzle.dispose();
  materials.forEach((material) => material.dispose());
});
