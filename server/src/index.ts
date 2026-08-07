import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes';
import { errorHandler } from './shared/middlewares/errorHandler';

const app = express();
const PORT = process.env['PORT'] || 5001;

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

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
