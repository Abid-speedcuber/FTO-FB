import { Vector3 } from "three";

// Keep the complete visible silhouette inside the canvas, including rear sheets
// during turns. Radius still controls orbit/zoom; fitting only adds room as needed.
export function fitCameraToMeshes(camera, meshes, padding = 0.08) {
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  const point = new Vector3();
  let extent = 0;
  for (const mesh of meshes) {
    if (!mesh.visible) continue;
    const positions = mesh.geometry.getAttribute("position");
    if (!positions) continue;
    const count = Math.min(positions.count, mesh.geometry.drawRange.count);
    for (let i = 0; i < count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
      extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
    }
  }
  camera.zoom = extent ? Math.min(1, (1 - padding) / extent) : 1;
  camera.updateProjectionMatrix();
}
