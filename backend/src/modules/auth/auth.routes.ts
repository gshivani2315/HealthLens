import { prisma } from '../../db';
import { Router } from 'express';
import { login, registerDoctor } from './auth.service';
import { requireAuth } from '../../middleware/auth';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await login(email, password);
    if (!result) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/register-doctor', async (req, res, next) => {
  try {
    const { name, email, password, clinicName, phone } = req.body ?? {};
    if (!name || !email || !password || !clinicName) {
      return res.status(400).json({ message: 'Name, email, password, and clinic name are required' });
    }

    const result = await registerDoctor({ name, email, password, clinicName, phone });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      return res.status(409).json({ message: err.message });
    }
    next(err);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, clinicName, phone } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const result = await registerDoctor({
      name,
      email,
      password,
      clinicName: clinicName || 'HealthLens Clinic',
      phone,
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.message?.includes('already exists')) {
      return res.status(409).json({ message: err.message });
    }
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: req.user!.sub },
          { id: req.user!.dbUserId },
          ...(req.user!.email ? [{ email: req.user!.email }] : []),
        ],
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.toLowerCase() as 'patient' | 'doctor',
    });
  } catch (err) {
    next(err);
  }
});

export default router;