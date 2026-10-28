import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// POST /api/auth/register
router.post('/register', validate({ body: registerSchema }), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const campusDomain = process.env.CAMPUS_EMAIL_DOMAIN?.trim();
    if (campusDomain && !normalizedEmail.endsWith(`@${campusDomain}`)) {
      throw new AppError(
        `Registration is restricted to campus email addresses (@${campusDomain})`,
        400,
        'INVALID_CAMPUS_DOMAIN'
      );
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      throw new AppError('An account with this email already exists', 400, 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertRes = await db.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = insertRes.rows[0];
    const token = signToken(user);

    res.cookie('token', token, COOKIE_OPTIONS);
    return res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email },
      token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const userRes = await db.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (userRes.rows.length === 0) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const user = userRes.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const authUser = { id: user.id, name: user.name, email: user.email };
    const token = signToken(authUser);

    res.cookie('token', token, COOKIE_OPTIONS);
    return res.json({
      user: authUser,
      token,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', COOKIE_OPTIONS);
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
