const cron = require('node-cron');
const db = require('../config/db');
const ptero = require('../utils/ptero');

// Runs every hour
function startExpiryCron() {
  cron.schedule('0 * * * *', async () => {
    try {
      // Mark servers expiring within 5 days as "notified" so admin panel shows them
      // (admin/dashboard already queries this live, this just logs it)
      const [soon] = await db.query(
        `SELECT s.id, u.username FROM servers s JOIN users u ON u.id = s.user_id
         WHERE s.status = 'active' AND s.expires_at <= DATE_ADD(NOW(), INTERVAL 5 DAY) AND s.notified = 0`
      );
      if (soon.length) {
        await db.query(
          `UPDATE servers SET notified = 1
           WHERE status = 'active' AND expires_at <= DATE_ADD(NOW(), INTERVAL 5 DAY) AND notified = 0`
        );
        console.log(`[expiry-cron] ${soon.length} server(s) entering 5-day expiry window.`);
      }

      // Auto-delete servers that have fully expired
      const [expired] = await db.query(
        `SELECT * FROM servers WHERE status = 'active' AND expires_at <= NOW()`
      );
      for (const server of expired) {
        try {
          await ptero.deleteServer(server.ptero_server_id);
          await db.query('UPDATE servers SET status = "expired" WHERE id = ?', [server.id]);
          console.log(`[expiry-cron] Auto-deleted expired server #${server.id} on panel.`);
        } catch (e) {
          console.error(`[expiry-cron] Failed to delete server #${server.id}:`, e.message);
        }
      }
    } catch (err) {
      console.error('[expiry-cron] Error:', err.message);
    }
  });
}

module.exports = startExpiryCron;
