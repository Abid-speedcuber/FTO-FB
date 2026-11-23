import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PuzzleMeshes } from "../src/vendor/puzzle-meshes.js";
import { solvedState } from "../src/model/puzzle.js";
test("pooled vertex buffers stay finite and have whole vertices", () => {
  const materials = Array.from(
    { length: 8 },
    () => new THREE.MeshBasicMaterial({ color: "#ffffff" }),
  );
  const geometry = new PuzzleMeshes(new THREE.Scene(), materials, materials[0]);
  const state = solvedState(3);
  geometry.update(3, state, [], new Set(state.slice(0, 27).map((s) => s.id)));
  geometry.refreshDimColors();
  for (const mesh of geometry.pool) {
    const attribute = mesh.geometry.getAttribute("position");
    assert.equal(attribute.array.length % 3, 0);
    assert.ok([...attribute.array].every(Number.isFinite));
    mesh.geometry.computeBoundingSphere();
    assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius));
  }
  for (const material of geometry.dimMaterials.filter(Boolean))
    assert.equal(material.color.getHex(), 0);
  geometry.dispose();
  materials.forEach((m) => m.dispose());
});
