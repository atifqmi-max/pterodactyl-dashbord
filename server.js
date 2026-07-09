require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const startExpiryCron = require('./cron/expiryCheck');
const db = require('./config/db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'ptero_dashboard_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());

app.get('/', (req, res) => res.redirect(req.session.user ? (req.session.user.is_admin ? '/admin' : '/dashboard') : '/login'));

app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => res.status(404).send('404 - Page not found'));

const PORT = process.env.APP_PORT || 6000;

db.query('SELECT 1').then(() => {
  app.listen(PORT, () => {
    console.log(`Pterodactyl Dashboard running on port ${PORT}`);
    startExpiryCron();
  });
}).catch(err => {
  console.error('Database connection failed:', err.message);
  process.exit(1);
});
