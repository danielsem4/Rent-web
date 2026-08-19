import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { errorHandler } from './shared/middlewares/errorHandler';

/**
 * Builds and configures the Express application.
 *
 * Middleware order is intentional and must not change:
 *   helmet → cors(credentials) → cookieParser → json → urlencoded
 *   → /api/health → module routers → errorHandler (LAST).
 *
 * This factory has NO side effects (it does not call `listen`), so it can be
 * mounted directly by Supertest in tests. The process bootstrap lives in
 * `index.ts`.
 */
export function createApp(): Application {
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(
    cors({
      origin: process.env['CLIENT_URL'] || 'http://localhost:5173',
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check route
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Module routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
