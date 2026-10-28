import { db } from '../db/pool.js';
import { realtime } from '../realtime/socket.js';

export async function createNotification(userId, type, message, listingId = null) {
  const result = await db.query(
    `INSERT INTO notifications (user_id, type, listing_id, message, read)
     VALUES ($1, $2, $3, $4, false)
     RETURNING id, user_id, type, listing_id, message, read, created_at`,
    [userId, type, listingId || null, message]
  );

  const notif = result.rows[0];
  realtime.emitNotification(userId, notif);
  return notif;
}
