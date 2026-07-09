const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const ptero = require('../utils/ptero');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

router.use(isAuthenticated, isAdmin);

async function getSettings() {
  const [rows] = await db.query('SELECT * FROM settings WHERE id = 1');
  return rows[0] || {};
}

// ---------- DASHBOARD ----------
router.get('/', async (req, res) => {
  const settings = await getSettings();
  const [[{ totalUsers }]] = await db.query('SELECT COUNT(*) as totalUsers FROM users');
  const [[{ totalServers }]] = await db.query('SELECT COUNT(*) as totalServers FROM servers');
  const [[{ totalCoins }]] = await db.query('SELECT COALESCE(SUM(coins),0) as totalCoins FROM users');
  const [expiringSoon] = await db.query(
    `SELECT s.*, u.username, u.email, u.discord_id, p.name as plan_name FROM servers s
     JOIN users u ON u.id = s.user_id JOIN plans p ON p.id = s.plan_id
     WHERE s.status = 'active' AND s.expires_at <= DATE_ADD(NOW(), INTERVAL 5 DAY)
     ORDER BY s.expires_at ASC`
  );
  res.render('admin/dashboard', { settings, totalUsers, totalServers, totalCoins, expiringSoon, user: req.session.user });
});

// ---------- USERS ----------
router.get('/users', async (req, res) => {
  const settings = await getSettings();
  const [users] = await db.query('SELECT * FROM users ORDER BY created_at DESC');
  res.render('admin/users', { settings, users, user: req.session.user, success: req.flash('success'), error: req.flash('error') });
});

router.post('/users/:id/coins', async (req, res) => {
  const { coins } = req.body;
  await db.query('UPDATE users SET coins = ? WHERE id = ?', [coins, req.params.id]);
  req.flash('success', 'Coins updated.');
  res.redirect('/admin/users');
});

router.post('/users/:id/make-admin', async (req, res) => {
  await db.query('UPDATE users SET is_admin = 1 WHERE id = ?', [req.params.id]);
  req.flash('success', 'User is now an admin.');
  res.redirect('/admin/users');
});

router.post('/users/:id/remove-admin', async (req, res) => {
  await db.query('UPDATE users SET is_admin = 0 WHERE id = ?', [req.params.id]);
  req.flash('success', 'Admin rights removed.');
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (rows.length && rows[0].ptero_user_id) {
      try { await ptero.deletePteroUser(rows[0].ptero_user_id); } catch (e) { console.error(e.message); }
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    req.flash('success', 'User deleted.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Delete failed.');
  }
  res.redirect('/admin/users');
});

// Create a new admin directly
router.post('/users/new-admin', async (req, res) => {
  const { username, email, password, discord_id } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    let pteroUser = null;
    try { pteroUser = await ptero.createPteroUser({ email, username, password }); } catch (e) { console.error(e.message); }
    await db.query(
      'INSERT INTO users (username, email, password, discord_id, coins, is_admin, ptero_user_id) VALUES (?, ?, ?, ?, 0, 1, ?)',
      [username, email, hashed, discord_id || 'N/A', pteroUser ? pteroUser.id : null]
    );
    req.flash('success', 'New admin created.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create admin: ' + err.message);
  }
  res.redirect('/admin/users');
});

// ---------- PLANS ----------
router.get('/plans', async (req, res) => {
  const settings = await getSettings();
  const [plans] = await db.query('SELECT * FROM plans ORDER BY created_at DESC');
  res.render('admin/plans', { settings, plans, user: req.session.user, success: req.flash('success'), error: req.flash('error') });
});

router.post('/plans/new', async (req, res) => {
  const { name, price, ram, cpu, disk, allocations, backups, duration_days } = req.body;
  await db.query(
    `INSERT INTO plans (name, price, ram, cpu, disk, allocations, backups, duration_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, price, ram, cpu, disk, allocations, backups, duration_days]
  );
  req.flash('success', 'Plan created and now visible to members.');
  res.redirect('/admin/plans');
});

router.post('/plans/:id/delete', async (req, res) => {
  await db.query('DELETE FROM plans WHERE id = ?', [req.params.id]);
  req.flash('success', 'Plan removed.');
  res.redirect('/admin/plans');
});

// ---------- REDEEM CODES ----------
router.get('/redeem-codes', async (req, res) => {
  const settings = await getSettings();
  const [codes] = await db.query('SELECT * FROM redeem_codes ORDER BY created_at DESC');
  res.render('admin/redeem_codes', { settings, codes, user: req.session.user, success: req.flash('success'), error: req.flash('error') });
});

router.post('/redeem-codes/new', async (req, res) => {
  const { code, coins, max_claims } = req.body;
  try {
    await db.query('INSERT INTO redeem_codes (code, coins, max_claims) VALUES (?, ?, ?)', [code, coins, max_claims]);
    req.flash('success', 'Redeem code created.');
  } catch (err) {
    req.flash('error', 'Code already exists or invalid.');
  }
  res.redirect('/admin/redeem-codes');
});

router.post('/redeem-codes/:id/delete', async (req, res) => {
  await db.query('DELETE FROM redeem_codes WHERE id = ?', [req.params.id]);
  req.flash('success', 'Redeem code deleted.');
  res.redirect('/admin/redeem-codes');
});

// ---------- SERVERS ----------
router.get('/servers', async (req, res) => {
  const settings = await getSettings();
  const [servers] = await db.query(
    `SELECT s.*, u.username, u.email, p.name as plan_name FROM servers s
     JOIN users u ON u.id = s.user_id JOIN plans p ON p.id = s.plan_id ORDER BY s.created_at DESC`
  );
  const locations = await ptero.listLocations().catch(() => []);
  res.render('admin/servers', { settings, servers, locations, user: req.session.user, success: req.flash('success'), error: req.flash('error') });
});

router.post('/servers/:id/delete', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM servers WHERE id = ?', [req.params.id]);
    if (rows.length) {
      try { await ptero.deleteServer(rows[0].ptero_server_id); } catch (e) { console.error(e.message); }
      await db.query('DELETE FROM servers WHERE id = ?', [req.params.id]);
    }
    req.flash('success', 'Server deleted.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Delete failed: ' + err.message);
  }
  res.redirect('/admin/servers');
});

// Move server to another user
router.post('/servers/:id/move-owner', async (req, res) => {
  const { new_user_id } = req.body;
  await db.query('UPDATE servers SET user_id = ? WHERE id = ?', [new_user_id, req.params.id]);
  req.flash('success', 'Server ownership moved.');
  res.redirect('/admin/servers');
});

// Move server to another node/location on the panel
router.post('/servers/:id/move-node', async (req, res) => {
  const { location_id } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM servers WHERE id = ?', [req.params.id]);
    if (rows.length) await ptero.moveServer(rows[0].ptero_server_id, location_id);
    req.flash('success', 'Server transfer initiated.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Move failed: ' + err.message);
  }
  res.redirect('/admin/servers');
});

// Edit server resources (change plan)
router.post('/servers/:id/edit', async (req, res) => {
  const { plan_id } = req.body;
  try {
    const [srows] = await db.query('SELECT * FROM servers WHERE id = ?', [req.params.id]);
    const [prows] = await db.query('SELECT * FROM plans WHERE id = ?', [plan_id]);
    if (srows.length && prows.length) {
      const server = srows[0], plan = prows[0];
      const details = await ptero.getServerDetails(server.ptero_server_id);
      const allocationId = details.relationships?.allocations?.data[0]?.attributes?.id;
      await ptero.updateServerBuild(server.ptero_server_id, plan, allocationId);
      await db.query('UPDATE servers SET plan_id = ? WHERE id = ?', [plan_id, req.params.id]);
    }
    req.flash('success', 'Server updated.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Edit failed: ' + err.message);
  }
  res.redirect('/admin/servers');
});

// ---------- SETTINGS (Panel URL/API key + Theme) ----------
router.get('/settings', async (req, res) => {
  const settings = await getSettings();
  res.render('admin/settings', { settings, user: req.session.user, success: req.flash('success'), error: req.flash('error') });
});

router.post('/settings', async (req, res) => {
  const { panel_url, panel_api_key, panel_name, theme_color, background_url,
          default_location_id, default_nest_id, default_egg_id } = req.body;
  await db.query(
    `UPDATE settings SET panel_url=?, panel_api_key=?, panel_name=?, theme_color=?, background_url=?,
     default_location_id=?, default_nest_id=?, default_egg_id=? WHERE id = 1`,
    [panel_url, panel_api_key, panel_name, theme_color, background_url,
     default_location_id || 1, default_nest_id || 1, default_egg_id || 1]
  );
  req.flash('success', 'Settings saved.');
  res.redirect('/admin/settings');
});

module.exports = router;
