import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { Store } from './src/store.js';
import { registerIntegration } from './src/runtime.js';
try {
  const store = await new Store(process.env.GARDEN_DATA_DIR || '/data').load();
  const gladys = new GladysIntegration();
  const runtime = registerIntegration(gladys, store, { logger });
  gladys.handleShutdown(() => runtime.close());
  logger.info('Starting Garden Journal');
  await gladys.connect();
} catch {
  logger.error(
    'Garden Journal could not start. Check environment, data permissions and journal format. Existing data was not reset.',
  );
  process.exitCode = 1;
}
