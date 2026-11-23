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
