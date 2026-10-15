import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes';
import { errorHandler } from './middleware/errorHandler';
export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'healthlens-backend' });
  });

  app.use('/api/auth', authRoutes);


  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
}