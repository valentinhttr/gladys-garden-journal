import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/store.js';
import { Journal } from '../../src/journal.js';
import { normalizeConfig } from '../../src/config.js';
export async function context(t) {
  const dir = await mkdtemp(join(tmpdir(), 'garden-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new Store(dir).load();
  let now = Date.parse('2026-10-12T10:00:00Z');
  const clock = () => now;
  const journal = new Journal(store, { clock, externalId: (id) => `ext:garden:plant:${id}` });
  return {
    store,
    journal,
    clock,
    config: normalizeConfig(),
    advance: (ms) => {
      now += ms;
    },
    async plant(fields = {}) {
      return journal.add({
        name: 'Citronnier',
        location: 'Terrasse',
        environment: 'outside',
        ...fields,
      });
    },
  };
}
export function fakeGladys() {
  const handlers = { events: {}, actions: {}, scenes: {}, widgets: {}, widgetActions: {} },
    events = [],
    published = [],
    discoveries = [],
    statuses = [];
  return {
    handlers,
    events,
    published,
    discoveries,
    statuses,
    hostApiUrl: 'http://gladys.test:80',
    externalIds(type, id) {
      const device = `ext:garden:${type}:${id}`;
      return { device, feature: (k) => `${device}:${k}` };
    },
    on(name, cb) {
      handlers.events[name] = cb;
    },
    onScanRequest(cb) {
      handlers.scan = cb;
    },
    onPoll(cb) {
      handlers.poll = cb;
    },
    onConfigUpdated(cb) {
      handlers.config = cb;
    },
    onAction(key, cb) {
      handlers.actions[key] = cb;
    },
    onSceneAction(key, cb) {
      handlers.scenes[key] = cb;
    },
    onWidgetGet(key, cb) {
      handlers.widgets[key] = cb;
    },
    onWidgetAction(key, cb) {
      handlers.widgetActions[key] = cb;
    },
    async getConfig() {
      return {};
    },
    async getDevices() {
      return discoveries.at(-1) ?? [];
    },
    async publishDiscoveredDevices(list) {
      discoveries.push(list);
    },
    async publishStates(s) {
      published.push(...s);
    },
    requestWidgetRefresh() {},
    async setConnectionStatus(...s) {
      statuses.push(s);
    },
    async publishSceneEvent(key, data) {
      events.push({ key, data });
      return { success: true };
    },
  };
}
