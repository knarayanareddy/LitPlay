/**
 * auth-service — process entry point (§10.2).
 */

import { startService } from '@litplay/server-kit';
import { buildApp } from './app.js';

const { app } = buildApp();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

void startService(app, PORT);
