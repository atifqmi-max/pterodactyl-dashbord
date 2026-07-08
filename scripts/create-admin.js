// Used by install.sh to create the first Admin account.
// Usage: node scripts/create-admin.js "username" "email" "password"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const axios = require('axios');

(async () => {
  const [,, username, email, password] = process.argv;
  if (!username || !email || !password) {
    console.error('Usage: node create-admin.js <username> <email> <password>');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  const hashed = await bcrypt.hash(password, 10);

  // Try to also create this admin on the Pterodactyl panel itself
  let pteroUserId = null;
  try {
    const [[settings]] = await conn.query('SELECT * FROM settings WHERE id = 1');
    if (settings && settings.panel_url && settings.panel_api_key) {
      const client = axios.create({
        baseURL: `${settings.panel_url.replace(/\/$/, '')}/api/application`,
        headers: { Authorization: `Bearer ${settings.panel_api_key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        validateStatus: () => true
      });
      const res = await client.post('/users', {
        email, username, first_name: username, last_name: 'Admin', password, root_admin: true
      });
      if (res.status === 201) pteroUserId = res.data.attributes.id;
    }
  } catch (e) {
    console.error('Panel admin sync skipped:', e.message);
  }

  await conn.query(
    'INSERT INTO users (username, email, password, discord_id, coins, is_admin, ptero_user_id) VALUES (?, ?, ?, ?, 0, 1, ?)',
    [username, email, hashed, 'N/A', pteroUserId]
  );

  console.log('✔ Admin account created successfully.');
  await conn.end();
  process.exit(0);
})();
