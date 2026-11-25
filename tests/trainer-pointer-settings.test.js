import test from 'node:test';
import assert from 'node:assert/strict';
import { readTrainerPointerSettings } from '../src/trainer-pointer-settings.js';

const storage = (entries = {}) => ({ getItem: (key) => entries[key] ? JSON.stringify(entries[key]) : null });
test('Trainer defaults to the virtual swipe mode and reads legacy mode and gesture biases', async () => {
  assert.deepEqual(await readTrainerPointerSettings({ storage: storage(), database: null }),
    { mode: 'swipe', outerBias: 0.6, upBias: 0.6, eifUpBias: 0.6 });
  const settings = await readTrainerPointerSettings({ database: null, storage: storage({
    'master-fto-v1': { pointerMode: 'legacy' },
    'master-fto-settings-v1': { outerTurnBias: 25, uTurnBias: 100, eifUTurnBias: -1 },
  }) });
  assert.deepEqual(settings, { mode: 'legacy', outerBias: 0.25, upBias: 1, eifUpBias: 0 });
  assert.equal((await readTrainerPointerSettings({ database: null, storage: { getItem() { throw Error('blocked'); } } })).mode, 'swipe');
});

test('Trainer reads the virtual database mode without changing its schema or data', async () => {
  let closed = false;
  const database = { open(name, version) {
    assert.equal(name, 'master-fto-solves-v2'); assert.equal(version, undefined);
    const request = {};
    queueMicrotask(() => {
      request.result = { objectStoreNames: { contains: (name) => name === 'meta' }, close() { closed = true; }, transaction(name, mode) {
        assert.equal(name, 'meta'); assert.equal(mode, 'readonly');
        const transaction = { objectStore() { return { get(key) {
          assert.equal(key, 'root');
          const root = { result: { pointerMode: 'legacy' } };
          queueMicrotask(() => { root.onsuccess(); transaction.oncomplete(); });
          return root;
        } }; } };
        return transaction;
      } };
      request.onsuccess();
    });
    return request;
  } };
  assert.equal((await readTrainerPointerSettings({ database, storage: storage({ 'master-fto-v1': { pointerMode: 'swipe' } }) })).mode, 'legacy');
  assert.equal(closed, true);
});

test('live simulator journals take precedence while its database commit is pending', async () => {
  const settings = await readTrainerPointerSettings({ pointerMode: 'legacy', storage: storage(), database: { open() { throw Error('must not open'); } } });
  assert.equal(settings.mode, 'legacy');
});
