import dotenv from 'dotenv';
dotenv.config();

import { loadConfig, ConfigError } from './shared/config/env';
import { logger } from './shared/logging/logger';

// Validate critical configuration at startup and FAIL FAST when it is unsafe
// (SECURITY_PRINCIPLES.md §9/§25). In production a missing/placeholder/weak
// secret aborts boot rather than starting an insecure server. The message names
// the offending variables but never prints their values.
let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    logger.error('startup_config_invalid', { message: err.message });
    process.exit(1);
  }
  throw err;
}

import { createApp } from './app';

// Build the app from the single validated config (one authoritative config path).
const app = createApp(config);

app.listen(config.port, () => {
  logger.info('server_listening', { port: config.port });
});

export default app;
