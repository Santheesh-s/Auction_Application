import jwt from 'jsonwebtoken';
import { db } from '../db/pool.js';
import { AppError } from './errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretcampusauctionjwtkey_change_in_production';

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      college_domain: user.college_domain || user.collegeDomain,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload && typeof payload.id === 'number') {
      return {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        college_domain: payload.college_domain,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function extractToken(req) {
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next(new AppError('Authentication required. Please log in.', 401, 'UNAUTHORIZED'));
  }

  const payload = verifyToken(token);
  if (!payload) {
    return next(new AppError('Invalid or expired session. Please log in again.', 401, 'INVALID_TOKEN'));
  }

  try {
    const userRes = await db.query(
      'SELECT id, name, email, college_domain, email_verified FROM users WHERE id = $1',
      [payload.id]
    );
    if (userRes.rows.length === 0) {
      return next(new AppError('User account not found.', 401, 'USER_NOT_FOUND'));
    }

    const row = userRes.rows[0];
    req.user = {
      id: row.id,
      name: row.name,
      email: row.email,
      college_domain: row.college_domain,
      collegeDomain: row.college_domain,
      email_verified: Boolean(row.email_verified),
      emailVerified: Boolean(row.email_verified),
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireVerified(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required. Please log in.', 401, 'UNAUTHORIZED'));
  }
  if (!req.user.email_verified) {
    return next(
      new AppError(
        'Please verify your college email address to perform this action. Check your inbox or request a new verification link.',
        403,
        'EMAIL_NOT_VERIFIED'
      )
    );
  }
  next();
}

export async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  const payload = verifyToken(token);
  if (!payload) {
    return next();
  }

  try {
    const userRes = await db.query('SELECT id, name, email FROM users WHERE id = $1', [payload.id]);
    if (userRes.rows.length > 0) {
      req.user = userRes.rows[0];
    }
    next();
  } catch {
    next();
  }
}
