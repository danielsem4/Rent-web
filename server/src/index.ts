import dotenv from 'dotenv';
dotenv.config();

import { loadConfig, ConfigError } from './shared/config/env';

// Validate critical configuration at startup and FAIL FAST when it is unsafe
// (SECURITY_PRINCIPLES.md §9/§25). In production a missing/placeholder/weak
// secret aborts boot rather than starting an insecure server. The message names
// the offending variables but never prints their values.
let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`\n[startup] ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}

import { createApp } from './app';

// Build the app from the single validated config (one authoritative config path).
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});

export default app;
