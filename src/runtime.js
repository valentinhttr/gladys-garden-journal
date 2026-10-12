import { normalizeConfig } from './config.js';
import { Journal } from './journal.js';
import { WeatherService } from './weather.js';
import { Engine } from './engine.js';
import { buildDevices, publishPlantStates, resetPublishedStates } from './devices.js';
import { ACTION_KEYS, SCENE_KEYS, runAction } from './actions.js';
import { WIDGET_KEYS, widgetContent, widgetAction, refreshWidgets } from './widgets.js';
export function registerIntegration(
  gladys,
  store,
  { clock = () => Date.now(), fetcher = fetch, logger = console } = {},
) {
  const journal = new Journal(store, {
    clock,
    externalId: (id) => gladys.externalIds('plant', id).device,
  });
  const weather = new WeatherService(store, { host: gladys.hostApiUrl, fetcher, clock });
  const engine = new Engine({ store, journal, gladys, clock });
  const context = { store, journal, weather, clock, config: normalizeConfig() };
  let timer = null,
    connected = false,
    lastWeather = 0,
    cycle = null,
    needsSync = true;
  const sync = async () => {
    await gladys.publishDiscoveredDevices(buildDevices(gladys, store.snapshot()));
    await publishPlantStates(gladys, store.snapshot(), clock());
    refreshWidgets(gladys);
    needsSync = false;
  };
  const afterMutation = async () => {
    // Persistence already succeeded; a transient sync error must not make the
    // user retry a successful add or care operation. Reconnection resyncs it.
    try {
      await sync();
    } catch {
      needsSync = true;
      logger.warn('Journal saved; Gladys synchronization will retry.');
    }
  };
  const tick = () => {
    if (cycle) return cycle;
    cycle = (async () => {
      if (!connected) return;
      if (needsSync) await sync();
      if (
        context.config.weather_enabled &&
        clock() - lastWeather >= context.config.weather_interval * 60000
      ) {
        lastWeather = clock();
        try {
          await weather.refresh(context.config);
        } catch {
          logger.warn('Weather configuration is incomplete.');
        }
      }
      await engine.tick(context.config);
      await publishPlantStates(gladys, store.snapshot(), clock());
      refreshWidgets(gladys);
    })()
      .catch(() => {
        logger.warn('Garden Journal refresh failed; retrying next minute.');
      })
      .finally(() => {
        cycle = null;
      });
    return cycle;
  };
  gladys.onScanRequest(sync);
  gladys.onPoll(() => publishPlantStates(gladys, store.snapshot(), clock()));
  for (const key of ACTION_KEYS)
    gladys.onAction(key, async (fields) => {
      const result = await runAction(context, key, fields);
      await afterMutation();
      return result;
    });
  for (const key of SCENE_KEYS)
    gladys.onSceneAction(key, async (fields) => {
      const result = await runAction(context, key, fields, { scene: true });
      await afterMutation();
      return result;
    });
  for (const key of WIDGET_KEYS) {
    gladys.onWidgetGet(key, (request) => widgetContent(key, context, request));
    if (key === 'garden_tasks')
      gladys.onWidgetAction(key, async (action, params, request) => {
        const result = await widgetAction(context, key, action, params, request);
        await afterMutation();
        return result;
      });
  }
  gladys.onConfigUpdated(async (raw) => {
    context.config = normalizeConfig(raw);
    connected = true;
    clearInterval(timer);
    timer = setInterval(tick, 60000);
    await gladys.setConnectionStatus(true);
    lastWeather = 0;
    await tick();
    refreshWidgets(gladys);
  });
  gladys.on('connected', async () => {
    connected = true;
    needsSync = true;
    lastWeather = 0;
    resetPublishedStates(gladys);
    clearInterval(timer);
    timer = setInterval(async () => {
      if (needsSync) {
        try {
          context.config = normalizeConfig(await gladys.getConfig());
          await sync();
          await gladys.setConnectionStatus(true);
        } catch {
          logger.warn('Initialization will retry next minute.');
          return;
        }
      }
      await tick();
    }, 60000);
    try {
      context.config = normalizeConfig(await gladys.getConfig());
      await sync();
      await gladys.setConnectionStatus(true);
      await tick();
    } catch {
      needsSync = true;
      await gladys
        .setConnectionStatus(false, {
          en: 'Check configuration and data permissions.',
          fr: 'Vérifiez la configuration et les permissions des données.',
        })
        .catch(() => {});
    }
  });
  gladys.on('disconnected', () => {
    connected = false;
    clearInterval(timer);
    timer = null;
  });
  return {
    context,
    tick,
    async close() {
      connected = false;
      clearInterval(timer);
      await cycle;
      await weather.busy;
      await store.close();
    },
  };
}
