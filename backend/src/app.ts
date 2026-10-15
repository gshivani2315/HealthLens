import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes';
import patientRoutes from './modules/patients/patients.routes';
import doctorRoutes from './modules/doctor/doctor.routes';
import alertRoutes from './modules/alerts/alerts.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'healthlens-backend' });
  });

  // Mount API modules under /api (matching VITE_API_BASE_URL: http://localhost:4000/api)
  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/doctor', doctorRoutes);
  app.use('/api/alerts', alertRoutes);

  // Fallback direct routes in case frontend calls without /api prefix
  app.use('/auth', authRoutes);
  app.use('/patients', patientRoutes);
  app.use('/doctor', doctorRoutes);
  app.use('/alerts', alertRoutes);

  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
}