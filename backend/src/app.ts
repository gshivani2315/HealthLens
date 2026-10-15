import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.routes';
import patientRoutes from './modules/patients/patients.routes';
import doctorRoutes from './modules/doctor/doctor.routes';
import alertRoutes from './modules/alerts/alerts.routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  // Explicit CORS configuration allowing frontend dev servers and tools
  app.use(
    cors({
      origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:4000',
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'healthlens-backend' });
  });

  // Primary API endpoints matching frontend contract VITE_API_BASE_URL: http://localhost:4000/api
  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/doctor', doctorRoutes);
  app.use('/api/alerts', alertRoutes);

  // Direct root route fallbacks in case frontend calls without /api prefix
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