import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import { prisma } from '../../db';
import { createCareInvite, getDoctorInvites, getInviteDetails, acceptCareInvite } from './invite.service';

const router = Router();

// GET /invites/info/:code - public endpoint to preview invite before login/registration
router.get('/info/:code', async (req, res, next) => {
  try {
    const details = await getInviteDetails(req.params.code);
    if (!details) return res.status(404).json({ message: 'Invite not found' });
    res.json(details);
  } catch (err) {
    next(err);
  }
});

// Doctor routes
router.post('/', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.dbUserId } });
    if (!doctor) return res.status(403).json({ message: 'Doctor profile not found' });

    const { clinicId, specialty, patientEmail, daysValid } = req.body ?? {};
    const invite = await createCareInvite({
      doctorId: doctor.id,
      clinicId,
      specialty,
      patientEmail,
      daysValid: daysValid ? Number(daysValid) : 14,
    });

    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user!.dbUserId } });
    if (!doctor) return res.status(403).json({ message: 'Doctor profile not found' });

    const invites = await getDoctorInvites(doctor.id);
    res.json(invites);
  } catch (err) {
    next(err);
  }
});

// Patient route: link using invite code
router.post('/accept', requireAuth, requireRole('PATIENT'), async (req, res, next) => {
  try {
    const { code } = req.body ?? {};
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ message: 'Invite code is required' });
    }

    const result = await acceptCareInvite(code, req.user!.dbUserId);
    if ('error' in result) {
      return res.status(result.error).json({ message: result.message });
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

