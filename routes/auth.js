const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const ptero = require('../utils/ptero');

async function getSettings() {
  const [rows] = await db.query('SELECT * FROM settings WHERE id = 1');
  return rows[0] || {};
}

router.get('/register', async (req, res) => {
  const settings = await getSettings();
  res.render('register', { settings, error: req.flash('error'), old: {} });
});

router.post('/register', async (req, res) => {
  const settings = await getSettings();
  const { username, email, password, confirm_password, discord_id } = req.body;

  if (!username || !email || !password || !discord_id) {
    req.flash('error', 'All fields including Discord ID are required.');
    return res.redirect('/register');
  }
  if (password !== confirm_password) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/register');
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
    if (existing.length) {
      req.flash('error', 'Username or email already registered.');
      return res.redirect('/register');
    }

    const hashed = await bcrypt.hash(password, 10);

    // Auto-register the SAME email/username/password on the Pterodactyl panel
    let pteroUser = null;
    try {
      pteroUser = await ptero.createPteroUser({ email, username, password });
    } catch (e) {
      console.error('Ptero user creation failed:', e.message);
    }

    const [result] = await db.query(
      'INSERT INTO users (username, email, password, discord_id, coins, is_admin, ptero_user_id) VALUES (?, ?, ?, ?, 0, 0, ?)',
      [username, email, hashed, discord_id, pteroUser ? pteroUser.id : null]
    );

    req.session.user = {
      id: result.insertId,
      username, email,
      is_admin: 0,
      coins: 0
    };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Registration failed. Try again.');
    res.redirect('/register');
  }
});

router.get('/login', async (req, res) => {
  const settings = await getSettings();
  res.render('login', { settings, error: req.flash('error') });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }
    req.session.user = {
      id: user.id, username: user.username, email: user.email,
      is_admin: user.is_admin, coins: user.coins
    };
    res.redirect(user.is_admin ? '/admin' : '/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Login failed.');
    res.redirect('/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
