import * as THREE from "three";
import { UNDEFINED_COLOR, OUTLINE_COLOR } from "./viewer-colors.js";
import { FACES, normalOf, selected } from "./puzzle.js";

const faceIndices = new Map(
  FACES.map((face, index) => [face.normal.join(","), index]),
);
export const PROJECTION_OFFSET = 1.5;
export const PROJECTION_BACK_OFFSET = 1.2;
export const MAX_PROJECTION_DISTANCE = 2;
export const PROJECTION_OPACITY = 0.6;
export const clampProjectionOpacity = (value) =>
  Math.round(
    Math.max(
      0,
      Math.min(1, Number.isFinite(value) ? value : PROJECTION_OPACITY),
    ) * 100,
  ) / 100;
export const projectionDistance = (value, fallback) =>
  Math.round(
    Math.max(
      0,
      Math.min(
        MAX_PROJECTION_DISTANCE,
        Number.isFinite(value) ? value : fallback,
      ),
    ) * 100,
  ) / 100;
const STICKER_INSET = 0.003;
const normals = FACES.map((face) =>
  new THREE.Vector3(...face.normal).normalize(),
);

// Offset the actual rear-face geometry along its outward normal. No screen-space
// flattening, inverse angle, or chosen hinge: this stays continuous through rolls
// and pole views, with exactly the same camera and projection as the puzzle.
export function projectionGeometry(size, state, selection = null, bands = null) {
  if (bands) {
    return bands.flatMap((band, bandIndex) =>
      FACES.map((_, faceIndex) => {
        const stickers = state.filter((sticker) =>
          faceIndices.get(normalOf(sticker).join(",")) === faceIndex &&
          (bands.length === 1 || selected(sticker, band.move)),
        );
        const face = projectionGeometry(size, stickers, selection)[faceIndex];
        const backing = stickers.flatMap((sticker) =>
          sticker.vertices.flatMap((vertex) => vertex.map((v) => v * 2 / size)),
        );
        return {
          positions: [...backing, ...face.positions.slice(9)],
          colors: [...stickers.map(() => -1), ...face.colors.slice(1)],
          backingCount: backing.length / 3,
          faceIndex,
          bandIndex,
        };
      }).filter((face) => face.positions.length),
    );
  }
  const faces = FACES.map((face) => ({
    positions: face.normal.flatMap((sign, axis) =>
      [0, 1, 2].map((i) => (i === axis ? 2 * sign : 0)),
    ),
    colors: [-1],
  }));
  for (const sticker of state) {
    const index = faceIndices.get(normalOf(sticker).join(",")),
      face = faces[index],
      normal = normals[index];
    const points = sticker.vertices.map((vertex) =>
      vertex.map((value) => (value * 2) / size),
    );
    const center = [0, 1, 2].map(
      (axis) => points.reduce((sum, p) => sum + p[axis], 0) / 3,
    );
    for (const point of points)
      face.positions.push(
        ...point.map(
          (value, axis) =>
            center[axis] +
            (value - center[axis]) * 0.935 -
            normal.getComponent(axis) * STICKER_INSET,
        ),
      );
    face.colors.push(
      selection && !selection.has(sticker.id) ? 8 : sticker.color,
    );
  }
  return faces;
}
export function projectionVisible(
  normal,
  cameraPosition,
  outward = PROJECTION_OFFSET,
  backward = PROJECTION_BACK_OFFSET,
) {
  // Hand over at the real puzzle face's plane, not at the centre hemisphere
  // or the displaced copy. This keeps hidden faces available in perspective,
  // but never shows a projection after the corresponding real face is visible.
  const radius = Math.hypot(...cameraPosition);
  if (!radius) return false;
  const eyePlane = normal.reduce((sum, n, i) => sum + n * cameraPosition[i], 0);
  const surfacePlane = 2 / Math.sqrt(3);
  if (eyePlane >= surfacePlane - 1e-8) return false;
  // At small outward / large backward distances the displaced sheet can turn
  // front-facing before the real one. Hide it then too, keeping its black backing
  // from facing the camera. The approved default distances retain the same cutoff.
  return (
    eyePlane <
    surfacePlane +
      outward -
      STICKER_INSET -
      (backward * eyePlane) / radius -
      1e-8
  );
}
export class InspectionProjection {
  constructor(
    scene,
    {
      outward = PROJECTION_OFFSET,
      backward = PROJECTION_BACK_OFFSET,
      opacity = PROJECTION_OPACITY,
    } = {},
  ) {
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.meshes = [];
    this.backingMaterial = new THREE.MeshBasicMaterial({
      color: OUTLINE_COLOR,
      side: THREE.DoubleSide,
    });
    this.setDistances(outward, backward);
    this.setOpacity(opacity);
  }
  setDistances(outward, backward) {
    this.outward = projectionDistance(outward, PROJECTION_OFFSET);
    this.backward = projectionDistance(backward, PROJECTION_BACK_OFFSET);
    this.meshes.forEach((mesh) =>
      mesh.position.copy(normals[mesh.userData.face]).applyQuaternion(mesh.quaternion).multiplyScalar(this.outward),
    );
  }
  setOpacity(value) {
    this.opacity = clampProjectionOpacity(value);
    for (const mesh of this.meshes) {
      const transparent = this.opacity < 1;
      const ink = mesh.material[0];
      if (ink.transparent !== transparent) {
        ink.transparent = transparent;
        ink.needsUpdate = true;
      }
      ink.opacity = this.opacity;
      if (!this.opacity) mesh.visible = false;
    }
  }
  setVisible(visible) {
    this.root.visible = visible;
  }
  render({ size, state, colors, camera, selection = null, animation = null }) {
    const bands = animation?.bands ?? null;
    if (!this.root.visible || !this.opacity) return;
    const palette = FACES.map((face) => colors[face.name]),
      key = palette.join(",");
    if (
      this.state !== state ||
      this.size !== size ||
      this.paletteKey !== key ||
      this.selection !== selection ||
      this.bands !== bands
    ) {
      this.state = state;
      this.bands = bands;
      this.selection = selection;
      this.size = size;
      this.paletteKey = key;
      const paletteRGB = [
        new THREE.Color(OUTLINE_COLOR),
        ...palette.map((color) => new THREE.Color(color)),
        new THREE.Color(UNDEFINED_COLOR),
      ];
      this.meshes.forEach((mesh) => { mesh.visible = false; });
      this.activeMeshes = [];
      projectionGeometry(size, state, selection, bands).forEach((face, index) => {
        let mesh = this.meshes[index];
        if (!mesh) {
          mesh = new THREE.Mesh(new THREE.BufferGeometry(), [
            new THREE.MeshBasicMaterial({
              vertexColors: true,
              side: THREE.DoubleSide,
              depthWrite: true,
              opacity: this.opacity,
              transparent: this.opacity < 1,
              forceSinglePass: true,
            }),
            this.backingMaterial,
          ]);
          mesh.frustumCulled = false;
          mesh.userData.face = index;
          this.meshes[index] = mesh;
          this.root.add(mesh);
        }
        mesh.userData.face = face.faceIndex ?? index;
        mesh.userData.band = face.bandIndex;
        this.activeMeshes.push(mesh);
        const backingCount = face.backingCount ?? 3;
        const rgb = face.colors.flatMap((color) =>
          Array.from({ length: 3 }, () =>
            paletteRGB[color + 1].toArray(),
          ).flat(),
        );
        // Rebuild buffers only when the state or turn bands change.
        if (
          mesh.geometry.getAttribute("position")?.count !==
          face.positions.length / 3 ||
          mesh.userData.backingCount !== backingCount
        ) {
          mesh.userData.backingCount = backingCount;
          mesh.geometry.dispose();
          mesh.geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(face.positions, 3),
          );
          mesh.geometry.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(rgb, 3),
          );
          // Keep the black outline opaque while the rear sticker ink stays translucent.
          mesh.geometry.setIndex([
            ...Array.from(
              { length: face.positions.length / 3 - backingCount },
              (_, i) => i + backingCount,
            ),
            ...Array.from({ length: backingCount }, (_, i) => i),
          ]);
          mesh.geometry.clearGroups();
          mesh.geometry.addGroup(0, face.positions.length / 3 - backingCount, 0);
          mesh.geometry.addGroup(face.positions.length / 3 - backingCount, backingCount, 1);
        } else {
          mesh.geometry.attributes.position.array.set(face.positions);
          mesh.geometry.attributes.position.needsUpdate = true;
          mesh.geometry.attributes.color.array.set(rgb);
          mesh.geometry.attributes.color.needsUpdate = true;
        }
      });
    }
    // Move the whole set away from the viewer as well as spreading the faces
    // outward, exposing more of each rear face around the puzzle's silhouette.
    this.root.position
      .copy(camera.position)
      .normalize()
      .multiplyScalar(-this.backward);
    const position = camera.position.toArray();
    this.activeMeshes.forEach((mesh) => {
      const normal = normals[mesh.userData.face].clone();
      const group = animation?.groups[mesh.userData.band];
      if (group) mesh.quaternion.copy(group.quaternion);
      else mesh.quaternion.identity();
      normal.applyQuaternion(mesh.quaternion);
      mesh.position.copy(normal).multiplyScalar(this.outward);
      mesh.visible = projectionVisible(
        normal.toArray(),
        position,
        this.outward,
        this.backward,
      );
    });
  }
  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material[0].dispose();
    }
    this.backingMaterial.dispose();
    this.root.removeFromParent();
  }
}
