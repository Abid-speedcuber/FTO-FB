export const KEYBOARD_ASPECT_RATIO = 2.75;

export function fitKeyboardBox(box, viewport) {
  const maximum = Math.max(1, Math.min(viewport.width - 16, (viewport.height - 16) * KEYBOARD_ASPECT_RATIO));
  const width = Math.min(Math.max(Math.min(320, maximum), box.width), maximum);
  const height = width / KEYBOARD_ASPECT_RATIO;
  return { width, height, x: Math.max(8, Math.min(box.x, viewport.width - width - 8)),
    y: Math.max(8, Math.min(box.y, viewport.height - height - 8)) };
}

export function resizeKeyboardBox(box, dx, dy, viewport) {
  const ratio = KEYBOARD_ASPECT_RATIO;
  const delta = (dx + dy / ratio) / (1 + 1 / ratio ** 2);
  const maximum = Math.min(viewport.width - box.x - 8, (viewport.height - box.y - 8) * ratio);
  return fitKeyboardBox({ ...box, width: Math.min(box.width + delta, maximum) }, viewport);
}
