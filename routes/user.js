const express = require('express');
const router = express.Router();
const db = require('../config/db');
const ptero = require('../utils/ptero');
const { isAuthenticated } = require('../middleware/auth');

async function getSettings() {
  const [rows] = await db.query('SELECT * FROM settings WHERE id = 1');
  return rows[0] || {};
}

async function refreshUser(req) {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
  if (rows.length) {
    req.session.user.coins = rows[0].coins;
    return rows[0];
  }
}

router.get('/dashboard', isAuthenticated, async (req, res) => {
  const settings = await getSettings();
  const user = await refreshUser(req);
  const [servers] = await db.query(
    `SELECT s.*, p.name as plan_name, p.ram, p.cpu, p.disk FROM servers s
     JOIN plans p ON p.id = s.plan_id WHERE s.user_id = ? ORDER BY s.created_at DESC`,
    [req.session.user.id]
  );
  res.render('user/dashboard', { settings, user, servers, panelUrl: await ptero.getPanelUrl() });
});

router.get('/plans', isAuthenticated, async (req, res) => {
  const settings = await getSettings();
  const user = await refreshUser(req);
  const [plans] = await db.query('SELECT * FROM plans ORDER BY price ASC');
  res.render('user/plans', { settings, user, plans, msg: req.flash('error'), success: req.flash('success') });
});

router.post('/plans/:id/buy', isAuthenticated, async (req, res) => {
  const planId = req.params.id;
  try {
    const [planRows] = await db.query('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!planRows.length) {
      req.flash('error', 'Plan not found.');
      return res.redirect('/plans');
    }
    const plan = planRows[0];
    const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
    const user = userRows[0];

    if (user.coins < plan.price) {
      req.flash('error', 'Not enough coins to buy this plan.');
      return res.redirect('/plans');
    }
    if (!user.ptero_user_id) {
      req.flash('error', 'Your panel account is not linked yet. Contact admin.');
      return res.redirect('/plans');
    }

    const settings = await getSettings();
    const locations = await ptero.listLocations();
    const locationId = locations[0] ? locations[0].attributes.id : settings.default_location_id;

    const created = await ptero.createServer({
      name: `${user.username}-${plan.name}`,
      pteroUserId: user.ptero_user_id,
      plan,
      locationId,
      nestId: settings.default_nest_id,
      eggId: settings.default_egg_id
    });

    const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000);

    await db.query(
      `INSERT INTO servers (user_id, plan_id, ptero_server_id, ptero_identifier, name, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, plan.id, created.id, created.identifier, created.name, expiresAt]
    );

    await db.query('UPDATE users SET coins = coins - ? WHERE id = ?', [plan.price, user.id]);

    req.flash('success', 'Server purchased and created successfully!');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Server creation failed: ' + err.message);
    res.redirect('/plans');
  }
});

// Renew an existing (expired or active) server for the same plan's coin price
router.post('/servers/:id/renew', isAuthenticated, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, p.price, p.duration_days FROM servers s JOIN plans p ON p.id = s.plan_id
       WHERE s.id = ? AND s.user_id = ?`, [req.params.id, req.session.user.id]
    );
    if (!rows.length) { req.flash('error', 'Server not found.'); return res.redirect('/dashboard'); }
    const server = rows[0];

    const [userRows] = await db.query('SELECT * FROM users WHERE id = ?', [req.session.user.id]);
    const user = userRows[0];
    if (user.coins < server.price) {
      req.flash('error', 'Not enough coins to renew.');
      return res.redirect('/dashboard');
    }

    const newExpiry = new Date(Date.now() + server.duration_days * 24 * 60 * 60 * 1000);
    await db.query('UPDATE servers SET expires_at = ?, notified = 0, status = "active" WHERE id = ?', [newExpiry, server.id]);
    await db.query('UPDATE users SET coins = coins - ? WHERE id = ?', [server.price, user.id]);

    if (server.status === 'suspended') {
      await ptero.unsuspendServer(server.ptero_server_id);
    }

    req.flash('success', 'Server renewed successfully!');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Renew failed: ' + err.message);
    res.redirect('/dashboard');
  }
});

router.get('/redeem', isAuthenticated, async (req, res) => {
  const settings = await getSettings();
  const user = await refreshUser(req);
  res.render('user/redeem', { settings, user, error: req.flash('error'), success: req.flash('success') });
});

router.post('/redeem', isAuthenticated, async (req, res) => {
  const { code } = req.body;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [codes] = await conn.query('SELECT * FROM redeem_codes WHERE code = ? FOR UPDATE', [code]);
    if (!codes.length) {
      await conn.rollback();
      req.flash('error', 'Invalid redeem code.');
      return res.redirect('/redeem');
    }
    const rc = codes[0];
    if (rc.claims_used >= rc.max_claims) {
      await conn.rollback();
      req.flash('error', 'This redeem code has reached its claim limit.');
      return res.redirect('/redeem');
    }
    const [already] = await conn.query(
      'SELECT id FROM redeem_claims WHERE redeem_code_id = ? AND user_id = ?',
      [rc.id, req.session.user.id]
    );
    if (already.length) {
      await conn.rollback();
      req.flash('error', 'You already claimed this code.');
      return res.redirect('/redeem');
    }

    await conn.query('INSERT INTO redeem_claims (redeem_code_id, user_id) VALUES (?, ?)', [rc.id, req.session.user.id]);
    await conn.query('UPDATE redeem_codes SET claims_used = claims_used + 1 WHERE id = ?', [rc.id]);
    await conn.query('UPDATE users SET coins = coins + ? WHERE id = ?', [rc.coins, req.session.user.id]);

    await conn.commit();
    req.flash('success', `Redeemed! You received ${rc.coins} coins.`);
    res.redirect('/redeem');
  } catch (err) {
    await conn.rollback();
    console.error(err);
    req.flash('error', 'Redeem failed.');
    res.redirect('/redeem');
  } finally {
    conn.release();
  }
});

module.exports = router;
