import { createGame, applyCommand, stepGame, snapshotFor } from '../shared/sim.mjs';
import { validateConfig } from '../shared/config.mjs';

let game = null;
let paused = false;
let timer = null;

function publishState() { postMessage({ type: 'state', state: snapshotFor(game, 'local') }); }

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'start') {
      const checked = validateConfig(data.config);
      if (!checked.ok) { postMessage({ type: 'error', message: checked.error }); return; }
      clearInterval(timer);
      game = createGame({
        mode: 'solo', config: checked.config,
        players: [{ id: 'local', name: data.name, team: 0, deck: data.deck }],
        seed: Date.now() >>> 0,
      });
      paused = false;
      timer = setInterval(() => {
        if (game && !paused) { stepGame(game, .1); publishState(); }
      }, 100);
      publishState();
    } else if (data.type === 'command' && game) {
      postMessage({ type: 'ack', ...applyCommand(game, 'local', data.command) });
    } else if (data.type === 'pause') {
      paused = data.paused === true;
    } else if (data.type === 'stop') {
      clearInterval(timer);
      game = null;
    }
  } catch (error) {
    postMessage({ type: 'error', message: 'No se pudo ejecutar la simulación: ' + error.message });
  }
};
