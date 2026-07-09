# 🦖 Pterodactyl Dashboard

A full coin-based dashboard for [Pterodactyl Panel](https://pterodactyl.io/) — members buy hosting plans with coins, servers auto-deploy on your panel, redeem codes give out coins, and admins get complete control (users, plans, servers, coins, theme, settings).

**Made By LashariGamer**

---

## ✨ Features

- 👤 **User Dashboard** — coin balance, buy plans, view/manage/renew servers, redeem codes
- 🛠️ **Admin Dashboard** — manage users, coins, admins, plans, redeem codes, servers, settings & theme
- 🎟️ **Redeem Codes** — admin sets coin amount + total claim limit; each user can claim a code only once (new codes can always be claimed again)
- 📦 **Plans** — admin sets price (coins), RAM, CPU, Disk, Allocation, Backup limit, Duration
- 🚀 **Auto Server Deploy** — buying a plan instantly creates a real server on your Pterodactyl panel
- 🔗 **Auto Panel Registration** — when a user registers on the dashboard, the same email/username/password is created on the Pterodactyl panel automatically
- ⏰ **Expiry System** — servers appear in Admin > Overview 5 days before expiry; fully expired servers auto-delete from the panel
- 🔁 **Renew** — users can renew with the same plan's coin cost
- 🎨 **Theming** — admin can change panel name, accent color, and background image
- ⚙️ **Settings** — admin sets Panel URL + API Key directly from the dashboard (no code editing needed)
- 🖥️ Move servers between owners or between panel nodes, edit resources, delete — all from Admin > Servers

---

## 📥 Installation (One Command)

Run this on a fresh Ubuntu/Debian VPS (root access required, works with or without a static IPv4):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/atifqmi-max/pterodactyl-dashbord/main/install.sh)
```

This launches an interactive installer menu:

```
1. Install Dashboard
2. Uninstall Dashboard
3. Change Domain
4. Take Backup
5. Load Backup
```

### Install Dashboard — you'll be asked:

1. Your Panel Name
2. Admin Email
3. Admin Username
4. Admin Password
5. Confirm Password
6. Does your VPS have an IPv4? (yes/no)
7. Panel Port (default `6000`)
8. Do you want to connect a domain? (yes/no)
9. Your Domain (only if step 8 was `yes`)

The installer then automatically:
- Installs Node.js 20, MySQL, Nginx, PM2
- Creates the database and imports the schema
- Clones this repository and installs dependencies
- Creates your first Admin account
- Starts the app with PM2 (auto-restarts on reboot)
- If you provided a domain, configures Nginx + free SSL (Let's Encrypt) automatically

Once done, log in and go to **Admin → Settings** to set your **Pterodactyl Panel URL** and **Application API Key** — this connects the dashboard to your actual panel.

---

## 🔧 Manual Setup (for development)

```bash
git clone https://github.com/atifqmi-max/pterodactyl-dashbord.git
cd pterodactyl-dashbord
npm install
cp .env.example .env
# edit .env with your DB credentials
mysql -u root -p < schema.sql
node scripts/create-admin.js myusername admin@example.com MyPassword123
npm start
```

The app runs on `http://localhost:6000` by default (configurable via `APP_PORT` in `.env`).

---

## 🗂️ Project Structure

```
pterodactyl-dashboard/
├── config/db.js          # MySQL connection pool
├── utils/ptero.js         # Pterodactyl Application API wrapper
├── middleware/auth.js      # Auth + admin guards
├── routes/                # auth, user, admin routes
├── views/                 # EJS pages (user + admin)
├── cron/expiryCheck.js     # 5-day expiry warning + auto-delete
├── scripts/create-admin.js # Creates first admin (used by installer)
├── schema.sql              # Database schema
├── install.sh              # VPS installer (menu-driven)
└── server.js                # App entrypoint
```

---

## 🛠️ Requirements

- Ubuntu 20.04 / 22.04 / 24.04 (or Debian) VPS, root access
- A running Pterodactyl Panel (any node/location) with an **Application API key**
- Works on VPS with or without a dedicated IPv4 (domain optional)

---

## 📄 License

Free to use and modify for your own hosting community.
