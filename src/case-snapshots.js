import { PuzzleViewer } from "./vendor/puzzle-viewer.js";
import { caseFrames } from "./model/cases.js";
export const CASE_CAMERA_RADIUS = 8;
export class CaseSnapshots {
  constructor() {
    this.cache = new Map();
    this.pending = new Map();
    this.queue = [];
    this.closed = false;
  }
  request(key, target, solution) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return Promise.resolve(value);
    }
    if (this.pending.has(key)) return this.pending.get(key);
    const promise = new Promise((resolve, reject) =>
      this.queue.push({ key, target, solution, resolve, reject }),
    );
    this.pending.set(key, promise);
    this.schedule();
    return promise;
  }
  schedule() {
    if (!this.frame && !this.closed && this.queue.length)
      this.frame = requestAnimationFrame(() => this.draw());
  }
  draw() {
    this.frame = null;
    const job = this.queue.shift();
    if (!job || this.closed) return;
    try {
      if (!this.viewer) {
        this.host = document.createElement("div");
        this.host.setAttribute("aria-hidden", "true");
        this.host.style.cssText =
          "position:fixed;left:-10000px;top:0;width:320px;height:240px;pointer-events:none";
        document.body.append(this.host);
        this.viewer = new PuzzleViewer(this.host);
        this.viewer.renderer.setPixelRatio(1);
        this.viewer.resize();
        this.home = { ...this.viewer.view(), radius: CASE_CAMERA_RADIUS };
      }
      const { frames, mask } = caseFrames(job.target, job.solution);
      this.viewer.setFrame(3, frames[0], mask, [], this.home);
      const url = this.viewer.renderer.domElement.toDataURL("image/webp", 0.85);
      this.cache.set(job.key, url);
      while (this.cache.size > 256)
        this.cache.delete(this.cache.keys().next().value);
      job.resolve(url);
    } catch (error) {
      job.reject(error);
    } finally {
      this.pending.delete(job.key);
      this.schedule();
    }
  }
  dispose() {
    this.closed = true;
    cancelAnimationFrame(this.frame);
    this.viewer?.dispose();
    this.host?.remove();
    for (const job of this.queue) job.reject(new Error("Preview closed"));
    this.queue = [];
    this.pending.clear();
    this.cache.clear();
  }
}
