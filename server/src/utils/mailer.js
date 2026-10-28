import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { db } from '../db/pool.js';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * Returns a configured Nodemailer transporter if SMTP credentials are provided.
 */
export function getTransporter() {
  const user = (process.env.SMTP_USER || process.env.SMTP_MAIL || '').trim();
  const rawPass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();
  const pass = rawPass.replace(/\s+/g, '');
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  return null;
}

/**
 * Creates and stores a 24-hour verification token for a user.
 * Stores only the SHA-256 hash in the database.
 * @param {number} userId
 * @returns {Promise<string>} The raw token to be sent in the verification link
 */
export async function createVerificationToken(userId) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Invalidate previous unconsumed verification tokens for this user
  await db.query(
    `UPDATE email_verifications SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  await db.query(
    `INSERT INTO email_verifications (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '24 hours')`,
    [userId, tokenHash]
  );

  return rawToken;
}

/**
 * Sends a verification link to the student's email address,
 * or logs to console in development.
 * @param {string} toEmail
 * @param {string} rawToken
 */
export async function sendVerificationEmail(toEmail, rawToken) {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const verifyUrl = `${clientUrl}/verify?token=${rawToken}`;
  const transporter = getTransporter();

  if (transporter) {
    try {
      const fromEmail =
        process.env.SMTP_FROM ||
        process.env.FROM_EMAIL ||
        process.env.SMTP_MAIL ||
        process.env.SMTP_USER ||
        '"Campus Auction" <no-reply@campusauction.edu>';

      const info = await transporter.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: '🎓 Verify your College Auction Account',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
            <h2 style="color: #1e1b4b; margin-top: 0; font-size: 20px;">Verify Your Campus Auction Account</h2>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Welcome to Campus Auction! Please click the button below to verify your college email address and activate bidding:
            </p>
            <div style="margin: 25px 0;">
              <a href="${verifyUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px;">
                Verify Email Address
              </a>
            </div>
            <p style="color: #64748b; font-size: 13px;">Or copy and paste this link in your browser:</p>
            <p style="color: #4f46e5; font-size: 13px; word-break: break-all;">
              <a href="${verifyUrl}" style="color: #4f46e5;">${verifyUrl}</a>
            </p>
            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">This verification link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
          </div>
        `,
      });
      console.log(`✉️ Verification email sent via SMTP to ${toEmail} (Message ID: ${info.messageId})`);
      return info;
    } catch (err) {
      console.error('SMTP send failed, falling back to console:', err.message);
    }
  }

  // Dev fallback: Print prominently to the server console
  console.log('\n======================================================');
  console.log('✉️  EMAIL VERIFICATION LINK (Development mode):');
  console.log(`Recipient: ${toEmail}`);
  console.log(`Link:      ${verifyUrl}`);
  console.log('======================================================\n');
}

/**
 * Verifies a token and marks the corresponding user as email_verified = true.
 * @param {string} rawToken
 * @returns {Promise<{ success: boolean, userId?: number, error?: string }>}
 */
export async function verifyEmailToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { success: false, error: 'Invalid verification token' };
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT id, user_id, expires_at, used_at
       FROM email_verifications
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (res.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Verification token not found or already used' };
    }

    const row = res.rows[0];
    if (row.used_at !== null) {
      await client.query('ROLLBACK');
      return { success: false, error: 'This verification link has already been used' };
    }

    if (new Date() > new Date(row.expires_at)) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Verification link has expired. Please request a new one.' };
    }

    await client.query(
      `UPDATE email_verifications SET used_at = now() WHERE id = $1`,
      [row.id]
    );

    await client.query(
      `UPDATE users SET email_verified = true WHERE id = $1`,
      [row.user_id]
    );

    await client.query('COMMIT');
    return { success: true, userId: row.user_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
