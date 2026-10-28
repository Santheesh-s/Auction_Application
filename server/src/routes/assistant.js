import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  handleAssistantChat,
  confirmProposal,
  cancelProposal,
} from '../services/assistantService.js';

const router = Router();

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string().min(1),
    })
  ).min(1, 'At least one message is required'),
});

// POST /api/assistant/chat
router.post('/chat', requireAuth, validate({ body: chatSchema }), async (req, res, next) => {
  try {
    const { messages } = req.body;
    const response = await handleAssistantChat(req.user.id, messages);
    return res.json(response);
  } catch (err) {
    next(err);
  }
});

// POST /api/assistant/proposals/:id/confirm
router.post('/proposals/:id/confirm', requireAuth, async (req, res, next) => {
  try {
    const proposalId = parseInt(req.params.id, 10);
    if (isNaN(proposalId)) throw new AppError('Invalid proposal ID', 400, 'INVALID_ID');

    const result = await confirmProposal(proposalId, req.user.id);
    return res.json({
      message: 'Bid confirmed and auto-bid activated successfully!',
      result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/assistant/proposals/:id/cancel
router.post('/proposals/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const proposalId = parseInt(req.params.id, 10);
    if (isNaN(proposalId)) throw new AppError('Invalid proposal ID', 400, 'INVALID_ID');

    const result = await cancelProposal(proposalId, req.user.id);
    return res.json({
      message: 'Proposal cancelled',
      result,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
