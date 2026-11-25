import React, { useEffect, useRef, useState } from 'react';
import { readSession, writeSession } from './session.js';

import { keyboardLayout } from './vendor/keyboard-layout.js';
import { fitKeyboardBox, resizeKeyboardBox } from './trainer-keyboard-geometry.js';
const viewport = () => ({ width: innerWidth, height: innerHeight });
const keyLabel = (code) => ({ Backquote: '`', Minus: '−', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', CapsLock: 'Caps', Backspace: '⌫' }[code] ?? code.replace(/^(Key|Digit)/, '').replace(/(Left|Right)$/, ''));
const fit = (box) => fitKeyboardBox(box, viewport());

export default function TrainerKeyboard({ engine, onAction, onClose, onModeChange, revision }) {
  const [box, setBox] = useState(() => {
    const saved = readSession('fto-trainer-keyboard');
    return fit(saved && ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(saved[k])) ? saved : { x: 24, y: innerHeight - 290, width: 680, height: 265 });
  });
  const layout = keyboardLayout({ layout: engine.config.display?.layout === 'iso' ? 'iso' : 'ansi' });
  const keysLayout = layout.keys.filter((key) => key.x < 15 && key.y >= 1.5);
  const [, redraw] = useState(0), gesture = useRef(), keys = useRef(new Map());
  useEffect(() => { writeSession('fto-trainer-keyboard', box); }, [box]);
  useEffect(() => {
    const resize = () => setBox((old) => fit(old));
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); for (const code of keys.current.values()) engine.keyUp(code, { cancel: true }); };
  }, [engine]);
  function start(event, type) {
    if (event.button !== 0 || event.target.closest('button, select')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { type, id: event.pointerId, x: event.clientX, y: event.clientY, box };
  }
  function move(event) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x, dy = event.clientY - g.y;
    setBox(fit(g.type === 'drag' ? { ...g.box, x: g.box.x + dx, y: g.box.y + dy } : resizeKeyboardBox(g.box, dx, dy, viewport())));
  }
  function release(event) {
    const code = keys.current.get(event.pointerId);
    if (code) { engine.keyUp(code, { cancel: event.type !== 'pointerup' }); keys.current.delete(event.pointerId); onModeChange(engine.mode.id); redraw((n) => n + 1); }
  }
  return <section className="trainer-keyboard-popup" aria-label="Keyboard popup" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} data-revision={revision}>
    <div className="trainer-keyboard-title" onPointerDown={(e) => start(e, 'drag')} onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
      <select aria-label="Keyboard mode" value={engine.mode.id} onChange={(e) => { engine.setMode(e.target.value); onModeChange(e.target.value); }}>
        {engine.config.modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button aria-label="Close keyboard popup" onClick={onClose}>×</button>
    </div>
    <div className="trainer-keyboard-keys">
      {keysLayout.map(({ code, x, y, w, h, shape }) => <button
        key={code} className={`${engine.pressed.has(code) ? 'pressed' : ''} ${shape === 'iso-enter' ? 'iso-enter' : ''}`}
        style={{ left: `${x / 15 * 100}%`, top: `${(y - 1.5) / 5 * 100}%`, width: `${w / 15 * 100}%`, height: `${h / 5 * 100}%` }}
        title={`${keyLabel(code)}: ${engine.label(code, { size: 3 })}`} aria-label={`Keyboard ${keyLabel(code)}`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          engine.logicalModifiers = null;
          event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); keys.current.set(event.pointerId, code);
          const result = engine.keyDown(code, { size: 3 });
          if (result.action) onAction(result.action);
          onModeChange(engine.mode.id); redraw((n) => n + 1);
        }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
        <span>{engine.label(code, { size: 3 }).replace(/^Rot /, 'Rot\n')}</span>
      </button>)}
    </div>
    <div className="trainer-keyboard-resize" role="separator" aria-label="Resize keyboard popup" onPointerDown={(e) => start(e, 'resize')} onPointerMove={move} onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }} />
  </section>;
}
