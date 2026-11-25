import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PuzzleViewer } from './vendor/puzzle-viewer.js';
import { FRAMES, frameForCamera, transformedNormal, snappedViewRotation, frameForRotationPair } from './vendor/orientation.js';
import { rotationPairForMove } from './vendor/rotation-actions.js';
import { FACES, solved, slotKey, moves, applyMove, names } from './model/fto.js';
import { pickSurface } from './vendor/picking.js';
import { swipeCandidates, chooseSwipeMove } from './vendor/swipe.js';
import TrainerKeyboard from './TrainerKeyboard.jsx';
import { caseFrames } from './model/cases.js';
import { trainingComplete } from './model/trainer.js';
import { readTrainerKeyboard, SHARED_KEYBOARD_KEY } from './trainer-keyboard.js';
import { readTrainerPointerSettings, SHARED_POINTER_SETTINGS_KEY, SHARED_SOLVE_KEY, SHARED_JOURNAL_PREFIX } from './trainer-pointer-settings.js';
import { moveNamesForFrame } from './view-notation.js';
import { readSession, writeSession, VIEWER_SESSION_KEY } from './session.js';

const slots = new Map(solved.map((s) => [slotKey(s.vertices), s.id]));
const MODES = [['center', 'Centers'], ['arrow', 'Arrow block'], ['fc+1', 'Center+1']];
const choose = (items) => items[Math.floor(Math.random() * items.length)];

export default function Trainer() {
  const [saved] = useState(() => readSession('fto-trainer'));
  const [mode, setMode] = useState(MODES.some(([id]) => id === saved?.mode) ? saved.mode : 'center');
  const [depths, setDepths] = useState(() => [3, 4, 5].filter((d) => (saved?.depths ?? [3]).includes(d)));
  const [any, setAny] = useState(saved?.any === true), [hint, setHint] = useState(saved?.hint === true);
  const [training, setTraining] = useState(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [attempt, setAttempt] = useState([]), [complete, setComplete] = useState(false), [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState(false), [keyboard, setKeyboard] = useState(() => readTrainerKeyboard());
  const [keyboardMode, setKeyboardMode] = useState(keyboard.engine.mode.id), [frame, setFrame] = useState(FRAMES[0]);
  const [colors, setColors] = useState(() => Array.isArray(saved?.colors) ? saved.colors.filter((c) => Number.isInteger(c) && c >= 0 && c < 8).slice(0, 2) : [0]);
  const [keyboardPopup, setKeyboardPopup] = useState(saved?.keyboardPopup === true);
  const [keyboardRevision, setKeyboardRevision] = useState(0);
  const [reviewing, setReviewing] = useState(false), [reviewStep, setReviewStep] = useState(0);
  const [caseIndex, setCaseIndex] = useState(-1);
  const caseHistory = useRef([]), review = useRef({ frames: [], step: 0, progress: 0 });
  const [backStickers, setBackStickers] = useState(true);
  const host = useRef(), viewer = useRef(), worker = useRef(), job = useRef(0), cache = useRef(new Map());
  const puzzle = useRef(), mask = useRef(), history = useRef([]), future = useRef([]), current = useRef();
  const raf = useRef(), queue = useRef([]), animating = useRef(false), playback = useRef(null);
  const pointerSettings = useRef({ mode: 'swipe', outerBias: 0.6, upBias: 0.6, eifUpBias: 0.6 });
  current.current = { training, complete, revealed, loading, playing, keyboard, reviewing };

  function stopAnimation() {
    cancelAnimationFrame(raf.current); queue.current = []; animating.current = false;
    clearTimeout(playback.current); playback.current = null; setPlaying(false);
  }
  function animate() {
    if (animating.current || !queue.current.length) return;
    animating.current = true;
    const turn = queue.current.shift();
    let start;
    function tick(time) {
      start ??= time;
      const progress = Math.min(1, (time - start) / (turn.duration ?? 110));
      viewer.current?.setPuzzle(3, turn.before, mask.current, [{ move: turn.move, progress }]);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
      else {
        viewer.current?.setPuzzle(3, turn.after, mask.current);
        animating.current = false; turn.onFinish?.(); animate();
      }
    }
    raf.current = requestAnimationFrame(tick);
  }
  function evaluate() {
    const partial = new Uint8Array(72);
    for (const s of puzzle.current) if (mask.current.has(s.id)) partial[slots.get(slotKey(s.vertices))] = s.color + 1;
    const solved = trainingComplete(partial, current.current.training.goals);
    const within = current.current.training.limit === null || history.current.length <= current.current.training.limit;
    setComplete(solved && within);
    setAttempt(history.current.map((turn) => turn.label));
  }
  function turn(move, label, action = 'move', animation = {}) {
    if (!puzzle.current) return;
    let actual = move;
    if (action === 'undo') {
      const previous = history.current.pop();
      if (!previous) return;
      future.current.push(previous); actual = { ...previous.move, dir: -previous.move.dir };
    } else if (action === 'redo') {
      const next = future.current.pop();
      if (!next) return;
      history.current.push(next); actual = next.move;
    } else {
      history.current.push({ move, label }); future.current = [];
    }
    const before = puzzle.current, after = applyMove(before, actual);
    puzzle.current = after;
    queue.current.push({ before, after, move: actual, ...animation });
    animate(); evaluate();
  }
  function reset() {
    const training = current.current.training;
    if (!training) return;
    stopAnimation();
    const parts = caseFrames(training.target, training.solution);
    puzzle.current = parts.frames[0]; mask.current = parts.mask;
    review.current = { frames: parts.frames, step: 0, progress: 0 };
    setReviewing(false); setReviewStep(0); current.current.reviewing = false;
    history.current = []; future.current = [];
    viewer.current?.setPuzzle(3, puzzle.current, mask.current);
    setAttempt([]); setComplete(false); setRevealed(false);
    current.current.complete = false;
    current.current.playing = false;
    keyboard.engine.clear();
  }
  function saveCaseCamera() {
    if (caseHistory.current[caseIndex] && viewer.current) caseHistory.current[caseIndex].camera = viewer.current.view();
  }
  function openCase(index) {
    saveCaseCamera(); stopAnimation();
    const entry = caseHistory.current[index];
    if (!entry) return;
    setCaseIndex(index); setTraining(entry.training); setError('');
    viewer.current?.setView(entry.camera);
  }
  function nextCase() {
    if (caseIndex + 1 < caseHistory.current.length) openCase(caseIndex + 1);
    else generateCase();
  }
  async function generateCase() {
    saveCaseCamera();
    const id = ++job.current;
    worker.current?.terminate(); stopAnimation();
    setLoading(true); setError(''); setTraining(null); setComplete(false); setRevealed(false); setAttempt([]);
    puzzle.current = null;
    const depth = any ? 'any' : choose(depths);
    if (depth === undefined || !colors.length) { setLoading(false); return; }
    try {
      let entries = [];
      if (depth !== 'any') {
        const key = `${mode}/${Math.min(depth, 4)}`;
        if (!cache.current.has(key)) {
          const response = await fetch(`${import.meta.env.BASE_URL}cases/${key}.json`);
          if (!response.ok) throw new Error('Could not load training cases. Please try again.');
          const rows = await response.json();
          if (!Array.isArray(rows) || !rows.length) throw new Error('This case list is empty.');
          cache.current.set(key, rows);
        }
        entries = cache.current.get(key);
      }
      if (job.current !== id) return;
      const next = new Worker(new URL('./trainer.worker.js', import.meta.url), { type: 'module' });
      worker.current = next;
      next.onmessage = ({ data }) => {
        if (job.current !== id) return;
        next.terminate(); setLoading(false);
        if (data.error) setError(data.error);
        else {
          const camera = viewer.current ? { ...viewer.current.view(), rotation: snappedViewRotation(choose(FRAMES)).toArray() } : null;
          caseHistory.current.push({ training: data.case, camera });
          setCaseIndex(caseHistory.current.length - 1); setTraining(data.case);
          viewer.current?.setView(camera);
        }
      };
      next.onerror = () => { if (job.current === id) { next.terminate(); setLoading(false); setError('Case generation failed. Please try again.'); } };
      next.postMessage({ mode, depth, entries, colors });
    } catch (error) { if (job.current === id) { setError(error.message); setLoading(false); } }
  }
  useEffect(() => {
    try {
      viewer.current = new PuzzleViewer(host.current);
      const controls = viewer.current.controls, canvas = viewer.current.renderer.domElement;
      const ray = new THREE.Raycaster();
      function hitAt(x, y) {
        const rect = canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1,
          -(y - rect.top) / rect.height * 2 + 1), viewer.current.camera);
        return pickSurface(ray);
      }
      function pointerTurn(normal, event, options = {}) {
        const hold = frameForCamera(viewer.current.camera);
        const face = FACES[hold.normals.findIndex((n) => n.every((v, i) => v === normal[i]))];
        if (face) dispatch.current({ type: 'move', face: face.name, dir: event.button === 2 ? -1 : 1,
          kind: event.shiftKey ? 'slice' : 'outer', depth: event.shiftKey ? 2 : 1, ...options });
      }
      controls.mode = pointerSettings.current.mode;
      controls.pick = (x, y) => {
        if (!puzzle.current || animating.current || current.current.loading || current.current.playing || current.current.reviewing || current.current.complete) return null;
        const hit = hitAt(x, y), rect = canvas.getBoundingClientRect();
        if (hit) hit.candidates = swipeCandidates(hit, viewer.current.camera, rect.width, rect.height, 3);
        return hit;
      };
      controls.addEventListener('swipe', (event) => {
        const hold = frameForCamera(viewer.current.camera), settings = pointerSettings.current;
        const normal = (name) => transformedNormal(FACES.find((f) => f.name === name).normal, hold);
        const move = chooseSwipeMove(event.hit.candidates, event.dx, event.dy, settings.outerBias, {
          upNormal: normal('U'), frontNormal: hold.notation === 'CIF' ? normal('F') : undefined,
          backNormals: hold.notation === 'EIF' ? ['BR', 'BL'].map(normal) : [],
          upBias: settings.upBias, eifUpBias: settings.eifUpBias,
        });
        if (move) pointerTurn(move.normal, event, { dir: move.dir, kind: 'slice', depth: move.depth });
      });
      controls.addEventListener('tap', (event) => {
        if (!puzzle.current || animating.current) return;
        const hit = hitAt(event.x, event.y);
        if (hit) pointerTurn(hit.normal, event);
      });
      canvas.setAttribute('aria-label', 'Virtual FTO. Swipe pieces to turn; drag the background or use two fingers to rotate. Pinch to zoom.');
      const update = () => setFrame(frameForCamera(viewer.current.camera));
      viewer.current.controls.addEventListener('change', update); update();
    } catch (error) { setError(`Virtual FTO unavailable: ${error.message}`); }
    return () => { ++job.current; worker.current?.terminate(); stopAnimation(); viewer.current?.dispose(); };
  }, []);
  useEffect(() => {
    writeSession('fto-trainer', { mode, depths, any, hint, colors, keyboardPopup });
  }, [mode, depths, any, hint, colors, keyboardPopup]);
  useEffect(() => { caseHistory.current = []; setCaseIndex(-1); generateCase(); }, [mode, depths, any, colors]);
  useEffect(() => { if (training) reset(); }, [training]);
  useEffect(() => {
    let revision = 0;
    async function reload(pointerMode) {
      const request = ++revision;
      const settings = await readTrainerPointerSettings({ pointerMode });
      if (request !== revision || !viewer.current) return;
      const controls = viewer.current.controls;
      if (controls.mode !== settings.mode) controls.cancelAll();
      pointerSettings.current = settings; controls.mode = settings.mode;
      viewer.current.renderer.domElement.setAttribute('aria-label', settings.mode === 'swipe'
        ? 'Virtual FTO. Swipe pieces to turn; drag the background or use two fingers to rotate. Pinch to zoom.'
        : 'Virtual FTO. Drag to rotate; click or tap a face to turn.');
    }
    const storage = (event) => {
      if (event.key?.startsWith(SHARED_JOURNAL_PREFIX)) {
        if (!event.newValue) return;
        try { reload(JSON.parse(event.newValue).pointerMode); } catch { /* Ignore an invalid foreign journal. */ }
      } else if (!event.key || event.key === SHARED_POINTER_SETTINGS_KEY || event.key === SHARED_SOLVE_KEY) reload();
    };
    const focus = () => reload();
    reload();
    window.addEventListener('storage', storage); window.addEventListener('focus', focus);
    return () => { revision++; window.removeEventListener('storage', storage); window.removeEventListener('focus', focus); };
  }, []);
  useEffect(() => {
    function reload() { const next = readTrainerKeyboard(); setKeyboard(next); setKeyboardMode(next.engine.mode.id); }
    const storage = (e) => { if (!e.key || e.key === SHARED_KEYBOARD_KEY || e.key === 'master-fto-keyboard-v1') reload(); };
    window.addEventListener('storage', storage); window.addEventListener('focus', reload);
    return () => { window.removeEventListener('storage', storage); window.removeEventListener('focus', reload); };
  }, []);
  function rotate(move, hold) {
    const pair = rotationPairForMove(move, hold.notation);
    let rotation;
    if (pair) rotation = snappedViewRotation(frameForRotationPair(hold, pair));
    else {
      const axis = new THREE.Vector3(...transformedNormal(FACES.find((f) => f.name === move.face).normal, hold));
      if (move.vertex) axis.add(new THREE.Vector3(...transformedNormal(FACES.find((f) => f.name === 'F').normal, hold)));
      rotation = viewer.current.controls.rotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(
        axis.normalize(), -move.dir * (move.angle ?? (move.vertex ? 90 : 120)) * Math.PI / 180));
    }
    viewer.current.setView({ ...viewer.current.view(), rotation: rotation.toArray() });
  }
  const dispatch = useRef();
  dispatch.current = (action) => {
    if (!viewer.current || loading || playing) return;
    const hold = frameForCamera(viewer.current.camera), engine = keyboard.engine;
    if (action.type === 'command') {
      if (action.command === 'undo' || action.command === 'redo') {
        if (reviewing) seekSolution(review.current.step + (action.command === 'undo' ? -1 : 1));
        else turn(null, '', action.command);
      }
      if (action.command === 'reset') reset();
      if (action.command === 'snap-view') viewer.current.setView({ ...viewer.current.view(), rotation: snappedViewRotation(hold).toArray() });
      if (action.command === 'home') viewer.current.setView({ ...viewer.current.view(), rotation: snappedViewRotation(FRAMES.find((f) => f.up === 'U' && f.front === 'BR')).toArray() });
      return;
    }
    if (!['move', 'rotate'].includes(action.type)) return;
    const resolved = engine.resolve(action, { size: 3 });
    if (!resolved.valid) return;
    engine.consume();
    if (resolved.rotation) { rotate(resolved, hold); return; }
    if (complete || reviewing || !training) return;
    const normal = transformedNormal(FACES.find((f) => f.name === resolved.face).normal, hold);
    turn({ ...resolved, normal }, resolved.label);
  };
  useEffect(() => {
    const engine = keyboard.engine, captured = new Set();
    function down(event) {
      engine.syncModifiers(event);
      const result = engine.keyDown(event.code, { repeat: event.repeat, size: 3 });
      if (result.handled || captured.has(event.code)) {
        captured.add(event.code); event.preventDefault(); event.stopImmediatePropagation();
      }
      if (result.action) dispatch.current(result.action);
      setKeyboardMode(engine.mode.id); setKeyboardRevision((n) => n + 1);
    }
    const up = (event) => {
      const result = engine.keyUp(event.code);
      if (captured.delete(event.code) || result?.handled) { event.preventDefault(); event.stopImmediatePropagation(); }
      setKeyboardMode(engine.mode.id); setKeyboardRevision((n) => n + 1);
    };
    const clear = () => { engine.clear(); captured.clear(); };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', clear);
    return () => { clear(); window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', clear); };
  }, [keyboard]);
  function seekSolution(index) {
    if (!training) return;
    stopAnimation();
    const next = Math.max(0, Math.min(training.solution.length, index));
    review.current.step = next; review.current.progress = 0;
    setReviewStep(next); setReviewing(true); setRevealed(true); setComplete(false);
    current.current.reviewing = true; current.current.playing = false;
    puzzle.current = review.current.frames[next];
    viewer.current?.setPuzzle(3, puzzle.current, mask.current);
  }
  function pauseSolution() {
    stopAnimation(); current.current.playing = false;
  }
  function playSolution() {
    if (playing) { pauseSolution(); return; }
    if (!reviewing || review.current.step === training.solution.length) seekSolution(0);
    else stopAnimation();
    setPlaying(true); current.current.playing = true;
    const savedSpeed = readSession(VIEWER_SESSION_KEY)?.speed;
    const duration = [250, 500, 900].includes(savedSpeed) ? savedSpeed : 500;
    function startTurn() {
      let started;
      function tick(time) {
        if (!current.current.playing) return;
        const state = review.current;
        started ??= time - state.progress * duration;
        state.progress = Math.min(1, Math.max(0, (time - started) / duration));
        viewer.current?.setPuzzle(3, state.frames[state.step], mask.current,
          [{ move: moves[training.solution[state.step]], progress: state.progress }]);
        if (state.progress < 1) raf.current = requestAnimationFrame(tick);
        else {
          state.step++; state.progress = 0; setReviewStep(state.step);
          puzzle.current = state.frames[state.step];
          viewer.current?.setPuzzle(3, puzzle.current, mask.current);
          if (state.step === training.solution.length) { setPlaying(false); current.current.playing = false; }
          else playback.current = setTimeout(startTurn, 100);
        }
      }
      raf.current = requestAnimationFrame(tick);
    }
    startTurn();
  }
  const over = training?.limit != null && attempt.length > training.limit;
  return <main className="trainer">
    <div className="trainer-heading"><h2>Trainer</h2><label>Train <select aria-label="Training type" value={mode} onChange={(e) => setMode(e.target.value)}>
      {MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label></div>
    <div className="trainer-layout">
      <section className="trainer-puzzle" aria-label="Training puzzle">
        <div className="stage-head"><label className="back-stickers"><input type="checkbox" checked={backStickers} onChange={(e) => { setBackStickers(e.target.checked); viewer.current?.setBackStickers(e.target.checked); }} />Back stickers</label><span>{keyboard.engine.mode.name} keyboard</span></div>
        <div className="trainer-stage" ref={host} />
        <div className="trainer-status" role="status" aria-live="polite">
          {loading ? 'Preparing…' : !colors.length ? 'Select a color.' : !depths.length && !any ? 'Select a move length.' : reviewing ? '' : complete ? 'Solved!' : training ? (over ? 'Move limit exceeded.' : hint ? `Find a solution in ${training.solution.length} moves.` : '') : ''}
        </div>
        {error && <p className="error" role="alert">{error} <button onClick={nextCase}>Try again</button></p>}
        {keyboard.warning && <p role="alert">{keyboard.warning}</p>}
        <div className="trainer-attempt" hidden={reviewing}><span>{attempt.length} {attempt.length === 1 ? 'move' : 'moves'}{hint && training?.limit ? ` / ${training.limit}` : ''}</span><code>{attempt.join(' ')}</code></div>
        <div className="trainer-actions">
          <button disabled={!attempt.length || playing || loading || reviewing} onClick={() => turn(null, '', 'undo')}>Undo</button>
          <button disabled={!training || loading} onClick={reset}>Retry</button>
          <button disabled={!training || loading || playing} onClick={() => setRevealed(true)}>Show solution</button>
          <div className="trainer-case-navigation"><button disabled={loading || caseIndex <= 0} onClick={() => openCase(caseIndex - 1)}>← Previous case</button><button className="solve" disabled={loading || !colors.length || (!any && !depths.length)} onClick={nextCase}>Next case →</button></div>
        </div>
        {revealed && training && <div className="trainer-solution">
          <div className="trainer-solution-moves" aria-label="Solution moves">{training.solution.map((move, i) => <button key={i} className={reviewing && i < reviewStep ? 'played' : reviewing && i === reviewStep ? 'next' : ''} onClick={() => seekSolution(i + 1)}>{moveNamesForFrame(frame)[move]}</button>)}</div>
          <div className="trainer-solution-controls">
            <button aria-label="Back to scramble" onClick={() => seekSolution(0)}>↶</button>
            <button aria-label="Previous solution move" disabled={reviewStep === 0 && review.current.progress === 0} onClick={() => seekSolution(review.current.progress ? reviewStep : reviewStep - 1)}>‹</button>
            <button onClick={playSolution}>{playing ? 'Pause' : 'Play solution'}</button>
            <button aria-label="Next solution move" disabled={reviewStep === training.solution.length} onClick={() => seekSolution(reviewStep + 1)}>›</button>
            <span>{reviewStep} / {training.solution.length}</span>
          </div>
        </div>}

      </section>
      <aside className="trainer-sidebar">
        <fieldset><legend>What to train</legend>
          {[3, 4, 5].map((depth) => <label key={depth}><input type="checkbox" checked={!any && depths.includes(depth)} onChange={(e) => { setAny(false); setDepths((old) => e.target.checked ? [...new Set([...old, depth])] : old.filter((d) => d !== depth)); }} />{depth} mover</label>)}
          <label><input type="radio" name="trainer-depth" checked={any} onChange={() => setAny(true)} />Any depth</label>
        </fieldset>
        <label className="trainer-hint"><input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} />Show hint</label>
        <fieldset className="trainer-colors" aria-label="Training colors">
          <legend>{colors.length <= 2 ? colors.map((c) => names[c]).join(', ') || 'Colors' : `${colors.length} colors`}</legend>
          <div className="colors">{FACES.map((face, i) => <label key={i} className={`swatch ${colors.includes(i) ? 'chosen' : ''}`} style={{ '--color': face.color }} title={names[i]}>
            <input type="checkbox" aria-label={names[i]} disabled={!colors.includes(i) && colors.length >= 2} checked={colors.includes(i)} onChange={() => setColors((old) => old.includes(i) ? old.filter((c) => c !== i) : [...old, i].sort((a, b) => a - b))} />
            <span aria-hidden="true">{colors.includes(i) ? '✓' : ''}</span>
          </label>)}</div>
        </fieldset>
        <label className="trainer-keyboard-toggle"><input type="checkbox" checked={keyboardPopup} onChange={(e) => setKeyboardPopup(e.target.checked)} />Toggle keyboard popup</label>
      </aside>
    </div>
    {keyboardPopup && <TrainerKeyboard engine={keyboard.engine} revision={keyboardRevision} onAction={(action) => dispatch.current(action)} onModeChange={setKeyboardMode} onClose={() => setKeyboardPopup(false)} />}
  </main>;
}
