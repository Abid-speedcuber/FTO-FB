import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { fitCameraToMeshes } from "../src/vendor/camera-framing.js";
import { PuzzleMeshes } from "../src/vendor/puzzle-meshes.js";
import { InspectionProjection } from "../src/vendor/inspection-projection.js";
import { FACES, solvedState, moves } from "../src/model/fto.js";

test("rear sheets fit the canvas through orbit, roll, narrow layouts, and animated turns", () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 4 / 3, 0.1, 100),
    materials = FACES.map((face) => new THREE.MeshBasicMaterial({ color: face.color })),
    puzzle = new PuzzleMeshes(scene, materials, materials[0]),
    projection = new InspectionProjection(scene), state = solvedState(3),
    colors = Object.fromEntries(FACES.map((face) => [face.name, face.color]));
  projection.setVisible(true);
  for (const aspect of [4 / 3, 0.8, 2]) {
    camera.aspect = aspect;
    for (let orbit = 0; orbit < 24; orbit++) {
      const angle = orbit * 2 * Math.PI / 24;
      camera.position.set(Math.sin(angle) * 6, Math.cos(angle * 2) * 5, Math.cos(angle) * 6).setLength(8);
      camera.up.set(Math.sin(angle * 3), Math.cos(angle * 3), 0);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const move = moves[orbit % moves.length];
      puzzle.update(3, state, [move]);
      puzzle.rotate((band) => band.turns.reduce((a, t) => a - t.sign * move.dir * 2 * Math.PI / 3 * 0.5, 0));
      projection.render({ size: 3, state, colors, camera, animation: puzzle });
      scene.updateMatrixWorld(true);
      const meshes = [...puzzle.pool.filter((mesh) => mesh.parent?.visible), ...projection.activeMeshes];
      fitCameraToMeshes(camera, meshes);
      for (const mesh of meshes.filter((mesh) => mesh.visible)) {
        const positions = mesh.geometry.getAttribute("position");
        for (let i = 0; i < Math.min(positions.count, mesh.geometry.drawRange.count); i++) {
          const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
          assert.ok(Math.abs(point.x) <= 0.920001 && Math.abs(point.y) <= 0.920001,
            `clipped vertex at orbit ${orbit}, aspect ${aspect}: ${point.toArray()}`);
        }
      }
      assert.ok(camera.zoom > 0 && camera.zoom <= 1);
    }
  }
  projection.dispose(); puzzle.dispose(); materials.forEach((material) => material.dispose());
});
