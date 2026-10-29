import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { getChatAssignmentsForUser, getAssignmentMessages, sendMessage } from './chat.service';

const router = Router();

router.use(requireAuth);

// GET /chat/assignments - list threads for current user
router.get('/assignments', async (req, res, next) => {
  try {
    const list = await getChatAssignmentsForUser(req.user!.dbUserId, req.user!.role);
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// GET /chat/assignments/:assignmentId/messages - get message history
router.get('/assignments/:assignmentId/messages', async (req, res, next) => {
  try {
    const result = await getAssignmentMessages(req.params.assignmentId, req.user!.dbUserId);
    if ('error' in result) {
      return res.status(result.error).json({ message: result.message });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /chat/assignments/:assignmentId/messages - send message in thread
router.post('/assignments/:assignmentId/messages', async (req, res, next) => {
  try {
    const { content } = req.body ?? {};
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'Content string is required' });
    }

    const result = await sendMessage(req.params.assignmentId, req.user!.dbUserId, content);
    if ('error' in result) {
      return res.status(result.error).json({ message: result.message });
    }
    res.status(201).json(result.message);
  } catch (err) {
    next(err);
  }
});

export default router;

