import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/pool.js';
import { AppError } from '../middleware/errors.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { validateCollegeEmail } from '../utils/college.js';
import { createVerificationToken, sendVerificationEmail, verifyEmailToken } from '../utils/mailer.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  college_name: z.string().max(100).optional().or(z.literal('')),
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
    const { name, college_name, email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const collegeCheck = validateCollegeEmail(normalizedEmail);
    if (!collegeCheck.valid) {
      throw new AppError(collegeCheck.error, 400, 'INVALID_COLLEGE_EMAIL');
    }
    const collegeDomain = collegeCheck.collegeDomain;

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      throw new AppError('An account with this email already exists', 400, 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertRes = await db.query(
      `INSERT INTO users (name, email, password_hash, college_domain, college_name, email_verified)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, name, email, college_domain, college_name, email_verified`,
      [name.trim(), normalizedEmail, passwordHash, collegeDomain, college_name?.trim() || null]
    );

    const user = insertRes.rows[0];
    const token = signToken(user);

    // Create 24h verification token and send email
    try {
      const rawVerifyToken = await createVerificationToken(user.id);
      sendVerificationEmail(user.email, rawVerifyToken).catch(err => {
        console.error('Failed to dispatch verification email:', err);
      });
    } catch (verifErr) {
      console.error('Failed to create verification token:', verifErr);
    }

    res.cookie('token', token, COOKIE_OPTIONS);
    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        collegeName: user.college_name,
        college_name: user.college_name,
        collegeDomain: user.college_domain,
        college_domain: user.college_domain,
        emailVerified: false,
        email_verified: false,
      },
      token,
      message: 'Registration successful! Please check your email to verify your college account.',
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
      'SELECT id, name, email, password_hash, college_domain, college_name, email_verified FROM users WHERE email = $1',
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

    const authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      collegeName: user.college_name,
      college_name: user.college_name,
      collegeDomain: user.college_domain,
      college_domain: user.college_domain,
      emailVerified: Boolean(user.email_verified),
      email_verified: Boolean(user.email_verified),
    };
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

// POST /api/auth/verify
router.post('/verify', async (req, res, next) => {
  try {
    const token = req.body?.token || req.query?.token;
    if (!token) throw new AppError('Verification token is required', 400, 'TOKEN_REQUIRED');

    const result = await verifyEmailToken(token);
    if (!result.success) {
      throw new AppError(result.error || 'Verification failed', 400, 'VERIFICATION_FAILED');
    }

    const userRes = await db.query(
      'SELECT id, name, email, college_domain, college_name, email_verified FROM users WHERE id = $1',
      [result.userId]
    );

    if (userRes.rows.length > 0) {
      const refreshedUser = userRes.rows[0];
      const newToken = signToken(refreshedUser);
      res.cookie('token', newToken, COOKIE_OPTIONS);
      return res.json({
        message: 'Email verified successfully! You now have full access to campus auctions.',
        user: {
          id: refreshedUser.id,
          name: refreshedUser.name,
          email: refreshedUser.email,
          collegeName: refreshedUser.college_name,
          college_name: refreshedUser.college_name,
          collegeDomain: refreshedUser.college_domain,
          college_domain: refreshedUser.college_domain,
          emailVerified: true,
          email_verified: true,
        },
      });
    }

    return res.json({ message: 'Email verified successfully! You now have full access to campus auctions.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verify
router.get('/verify', async (req, res, next) => {
  try {
    const token = req.query?.token;
    if (!token) throw new AppError('Verification token is required', 400, 'TOKEN_REQUIRED');

    const result = await verifyEmailToken(token);
    if (!result.success) {
      throw new AppError(result.error || 'Verification failed', 400, 'VERIFICATION_FAILED');
    }

    return res.json({ message: 'Email verified successfully! You now have full access to campus auctions.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', requireAuth, async (req, res, next) => {
  try {
    if (req.user.email_verified) {
      return res.json({ message: 'Your college email is already verified.' });
    }

    const recent = await db.query(
      `SELECT created_at FROM email_verifications
       WHERE user_id = $1 AND created_at > now() - interval '60 seconds'`,
      [req.user.id]
    );

    if (recent.rows.length > 0) {
      throw new AppError('Please wait at least 60 seconds before requesting another verification email', 429, 'RATE_LIMITED');
    }

    const rawVerifyToken = await createVerificationToken(req.user.id);
    sendVerificationEmail(req.user.email, rawVerifyToken).catch(console.error);

    return res.json({ message: 'Verification link resent. Please check your inbox or server console.' });
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
