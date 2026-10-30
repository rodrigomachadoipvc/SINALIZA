import { listen } from '@sinaliza/service-kit';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { app } = await createApp(config);
await listen(app, config.port, 'municipal-service');
