// backend/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import { prisma } from '../../db';
import { changePassword, login, refresh, registerDoctor, registerPatient } from './auth.service';
import { requireAuth } from '../../middleware/auth';

const router = Router();

const MIN_PASSWORD = 6;

function handleLinkError(err: any, res: any) {
  if (err?.code === 'ACCOUNT_NOT_LINKED') {
    res.status(403).json({ message: err.message });
    return true;
  }
  return false;
}

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const result = await login(email, password);
    if (!result) return res.status(401).json({ message: 'Invalid email or password' });
    res.json(result);
  } catch (err) {
    if (!handleLinkError(err, res)) next(err);
  }
});

// Exchanges a refresh token for a fresh access token (Supabase access tokens last ~1 hour).
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return res.status(400).json({ message: 'refreshToken is required' });
    }
    const result = await refresh(refreshToken);
    if (!result) return res.status(401).json({ message: 'Session expired, please sign in again' });
    res.json(result);
  } catch (err) {
    if (!handleLinkError(err, res)) next(err);
  }
});

async function registerHandler(req: any, res: any, next: any, defaultClinic?: string) {
  try {
    const { name, email, password, clinicName, phone } = req.body ?? {};
    const clinic = clinicName || defaultClinic;
    if (!name || !email || !password || !clinic) {
      return res.status(400).json({ message: 'Name, email, password, and clinic name are required' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters long` });
    }
    const result = await registerDoctor({ name, email, password, clinicName: clinic, phone });
    res.status(201).json(result);
  } catch (err: any) {
    if (err.message?.includes('already exists')) return res.status(409).json({ message: err.message });
    next(err);
  }
}

router.post('/register-doctor', (req, res, next) => registerHandler(req, res, next));
router.post('/register', (req, res, next) => registerHandler(req, res, next, 'HealthLens Clinic'));

// Self-registration: POST /auth/register-patient
router.post('/register-patient', async (req, res, next) => {
  try {
    const { name, email, password, phone, dateOfBirth, gender, inviteCode } = req.body ?? {};
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters long` });
    }

    const result = await registerPatient({
      name,
      email,
      password,
      phone,
      dateOfBirth,
      gender,
      inviteCode,
    });

    res.status(201).json(result);
  } catch (err: any) {
    if (err.message?.includes('already exists')) return res.status(409).json({ message: err.message });
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  res.json({ message: 'Logged out' });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.dbUserId },
      include: {
        doctor: {
          include: {
            clinic: true, // Direct 1-to-1 clinic relation
          },
        },
        patient: {
          include: {
            careAssignments: {
              where: { status: 'ACTIVE' },
              include: {
                doctor: { include: { user: true } },
                clinic: true,
              },
            },
          },
        },
      },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const clinic = user.doctor?.clinic;
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.toLowerCase() as 'patient' | 'doctor',
      clinicName: clinic?.name ?? user.doctor?.clinicName ?? undefined,
      phone: user.doctor?.phone ?? user.patient?.phone ?? undefined,
      // Single clinic object (doctor belongs to exactly one clinic)
      clinic: clinic
        ? { id: clinic.id, name: clinic.name, phone: clinic.phone, address: clinic.address }
        : undefined,
      activeDoctors: user.patient?.careAssignments?.map((ca) => ({
        assignmentId: ca.id,
        doctorId: ca.doctorId,
        doctorName: ca.doctor.user.name,
        specialty: ca.specialty,
        clinicName: ca.clinic?.name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD} characters long` });
    }
    const status = await changePassword(req.user!.dbUserId, currentPassword, newPassword);
    if (status === 'wrong_password') {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
