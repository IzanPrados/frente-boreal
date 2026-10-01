import { createGame, snapshotFor } from '../shared/sim.mjs';
import { validateConfig } from '../shared/config.mjs';
import { createMatchControl, timeControlSnapshot, pendingOrderCount, setMatchSpeed, submitMatchCommand, advanceMatch } from '../shared/match-control.mjs';

let game = null;
let suspended = false;
let timer = null;
let clock = null;
let lastStepAt = 0;

function publishState() {
  postMessage({ type: 'state', state: { ...snapshotFor(game, 'local'), timeControl: timeControlSnapshot(clock), pendingOrders: pendingOrderCount(clock, 'local') } });
}

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
      suspended = false;
      clock = createMatchControl(game);
      lastStepAt = performance.now();
      timer = setInterval(() => {
        if (!game) return;
        const now = performance.now();
        const advanced = advanceMatch(game, clock, (now - lastStepAt) / 1000, { suspended });
        lastStepAt = now;
        for (const result of advanced.results) postMessage({ type: 'commandResult', ...result });
        publishState();
      }, 100);
      publishState();
    } else if (data.type === 'command' && game) {
      postMessage({ type: 'ack', ...submitMatchCommand(game, clock, 'local', data.command, data.seq ?? null, { suspended }) });
      publishState();
    } else if (data.type === 'time' && game) {
      const result = setMatchSpeed(game, clock, 'local', data.speed);
      if (!result.ok) postMessage({ type: 'error', message: result.error });
      else { lastStepAt = performance.now(); publishState(); }
    } else if (data.type === 'pause') {
      // Menu/background suspension is independent of the shared manual clock.
      suspended = data.paused === true;
      lastStepAt = performance.now();
      if (clock) clock.accumulator = 0;
    } else if (data.type === 'stop') {
      clearInterval(timer);
      game = null;
    }
  } catch (error) {
    postMessage({ type: 'error', message: 'No se pudo ejecutar la simulación: ' + error.message });
  }
};
