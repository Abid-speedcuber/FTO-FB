import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYBOARD_ASPECT_RATIO, fitKeyboardBox, resizeKeyboardBox } from '../src/trainer-keyboard-geometry.js';

test('keyboard aspect ratio stays fixed when loading old sizes or fitting any viewport', () => {
  for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const box = fitKeyboardBox({ x: 900, y: 800, width: 680, height: 450 }, viewport);
    assert.equal(box.width / box.height, KEYBOARD_ASPECT_RATIO);
    assert.ok(box.x + box.width <= viewport.width - 8);
    assert.ok(box.y + box.height <= viewport.height - 8);
  }
});

test('mouse and touch resizing scale both dimensions together without moving the anchor', () => {
  const viewport = { width: 1400, height: 900 };
  const box = fitKeyboardBox({ x: 20, y: 30, width: 680 }, viewport);
  for (const [dx, dy] of [[200, 0], [0, 200], [-150, -60], [9000, 9000]]) {
    const resized = resizeKeyboardBox(box, dx, dy, viewport);
    assert.equal(resized.width / resized.height, KEYBOARD_ASPECT_RATIO);
    assert.equal(resized.x, box.x); assert.equal(resized.y, box.y);
    assert.ok(resized.x + resized.width <= viewport.width - 8);
    assert.ok(resized.y + resized.height <= viewport.height - 8);
  }
});
