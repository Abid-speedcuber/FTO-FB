import { defaultConfig, KeyboardEngine, upgradeKeyboardDefaults, upgradeEIFDefaults } from './vendor/keyboard-engine.js';

export const SHARED_KEYBOARD_KEY = 'master-fto-keyboard-v2';
export function readTrainerKeyboard(storage = localStorage) {
  let config = defaultConfig(3), warning = '';
  try {
    const saved = JSON.parse(storage.getItem(SHARED_KEYBOARD_KEY) || 'null');
    const legacy = !saved && JSON.parse(storage.getItem('master-fto-keyboard-v1') || 'null');
    config = structuredClone(saved?.profiles?.[3] ?? legacy ?? config);
    config = upgradeKeyboardDefaults(upgradeEIFDefaults(config));
    return { engine: new KeyboardEngine(config), warning };
  } catch {
    warning = 'Saved simulator bindings could not be loaded. Using the default 3×3 bindings.';
    return { engine: new KeyboardEngine(defaultConfig(3)), warning };
  }
}
