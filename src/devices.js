import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { dueCare } from './journal.js';
export function buildDevices(gladys, state) {
  // Archived plants remain discoverable so the same stable device can restore
  // a record; archiving never deletes Gladys devices or scene references.
  return state.plants.map((p) => {
    const ids = gladys.externalIds('plant', p.id);
    return {
      name: p.name,
      external_id: ids.device,
      model: p.species || 'Garden Journal',
      should_poll: false,
      features: [
        {
          name: 'Soins à vérifier / Care checks due',
          external_id: ids.feature('care_due'),
          category: C.COUNTER_SENSOR,
          type: T.SENSOR.INTEGER,
          min: 0,
          max: 6,
          read_only: true,
          has_feedback: false,
          keep_history: false,
        },
        {
          name: 'Jours dehors / Days outside',
          external_id: ids.feature('days_outside'),
          category: C.DURATION,
          type: T.DURATION.INTEGER,
          unit: U.DAYS,
          min: 0,
          max: 100000,
          read_only: true,
          has_feedback: false,
          keep_history: true,
        },
      ],
    };
  });
}
const delivery = new WeakMap();
function channel(gladys) {
  if (!delivery.has(gladys))
    delivery.set(gladys, { values: new Map(), sent: [], tail: Promise.resolve() });
  return delivery.get(gladys);
}
export function resetPublishedStates(gladys) {
  channel(gladys).values.clear();
}
export function publishPlantStates(gladys, state, now = Date.now()) {
  const queue = channel(gladys);
  const job = queue.tail.then(() => publish(gladys, state, now, queue));
  queue.tail = job.catch(() => {});
  return job;
}
async function publish(gladys, state, now, queue) {
  const devices = await gladys.getDevices();
  const owned = new Set(devices.flatMap((d) => (d.features ?? []).map((f) => f.external_id)));
  const due = dueCare(state, now),
    states = [];
  for (const p of state.plants) {
    const ids = gladys.externalIds('plant', p.id);
    for (const [key, value] of [
      ['care_due', due.filter((d) => d.plant.id === p.id).length],
      [
        'days_outside',
        !p.archived && p.outsideSince
          ? Math.max(0, Math.floor((now - Date.parse(p.outsideSince)) / 86400000))
          : 0,
      ],
    ])
      if (owned.has(ids.feature(key)))
        states.push({ device_feature_external_id: ids.feature(key), state: value });
  }
  queue.sent = queue.sent.filter((at) => now - at < 60000);
  const changed = states
    .filter((s) => queue.values.get(s.device_feature_external_id) !== s.state)
    .slice(0, Math.max(0, 300 - queue.sent.length));
  for (let i = 0; i < changed.length; i += 100) {
    const batch = changed.slice(i, i + 100);
    await gladys.publishStates(batch);
    for (const s of batch) {
      queue.values.set(s.device_feature_external_id, s.state);
      queue.sent.push(now);
    }
  }
}
