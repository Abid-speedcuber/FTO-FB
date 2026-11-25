import { generateTrainingCase } from './model/trainer.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ case: generateTrainingCase(data.mode, data.depth, data.entries, Math.random, data.colors) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
