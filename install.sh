#!/bin/bash

# ================================================================
#   Pterodactyl Dashboard - VPS Installer
#   Repo: https://github.com/atifqmi-max/pterodactyl-dashbord
# ================================================================

APP_DIR="/var/www/pterodactyl-dashboard"
REPO_URL="https://github.com/atifqmi-max/pterodactyl-dashbord.git"
SERVICE_NAME="ptero-dashboard"
NGINX_CONF="/etc/nginx/sites-available/ptero-dashboard"
BACKUP_DIR="/root/ptero_dashboard_backups"
ENV_FILE="$APP_DIR/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

center() {
  local text="$1"
  local cols
  cols=$(tput cols 2>/dev/null || echo 80)
  local pad=$(( (cols - ${#text}) / 2 ))
  [ $pad -lt 0 ] && pad=0
  printf "%*s%s\n" "$pad" "" "$text"
}

FIGLET_FONT="standard"

show_banner() {
  clear
  if ! command -v figlet &>/dev/null; then
    apt-get install -y figlet &>/dev/null
  fi
  echo ""
  echo -e "${BOLD}${PURPLE}"
  if command -v figlet &>/dev/null && figlet -f "$FIGLET_FONT" "test" &>/dev/null; then
    figlet -w "$(tput cols 2>/dev/null || echo 120)" -f "$FIGLET_FONT" "Pterodactyl" 2>/dev/null | while IFS= read -r line; do center "$line"; done
    figlet -w "$(tput cols 2>/dev/null || echo 120)" -f "$FIGLET_FONT" "Dashboard" 2>/dev/null | while IFS= read -r line; do center "$line"; done
  else
    center "=============================================="
    center "          PTERODACTYL DASHBOARD"
    center "=============================================="
  fi
  echo -e "${NC}"
  echo -e "${CYAN}"
  center "Made By LashariGamer"
  echo -e "${NC}"
  echo ""
}

pause() { read -rp "$(echo -e "${YELLOW}Press Enter to continue...${NC}")" _; }

ask() {
  local prompt="$1" default="$2" var
  if [ -n "$default" ]; then
    read -rp "$(echo -e "${CYAN}${prompt} [${default}]: ${NC}")" var
    echo "${var:-$default}"
  else
    read -rp "$(echo -e "${CYAN}${prompt}: ${NC}")" var
    echo "$var"
  fi
}

ask_secret() {
  local prompt="$1" var
  read -rsp "$(echo -e "${CYAN}${prompt}: ${NC}")" var
  echo ""
  echo "$var"
}

random_string() { tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c "${1:-24}"; }

# Ensures MySQL is actually installed, running, and reachable before we touch it
ensure_mysql_running() {
  if ! command -v mysql &>/dev/null || ! dpkg -l | grep -q mysql-server; then
    apt-get install -y mysql-server &>/tmp/mysql_install.log
    if [ $? -ne 0 ]; then
      echo -e "${RED}MySQL installation failed. Log:${NC}"
      tail -n 20 /tmp/mysql_install.log
      exit 1
    fi
  fi

  systemctl enable mysql &>/dev/null || systemctl enable mysqld &>/dev/null || true
  systemctl start mysql &>/dev/null || systemctl start mysqld &>/dev/null || true

  local tries=0
  until mysqladmin ping &>/dev/null; do
    tries=$((tries+1))
    if [ $tries -gt 20 ]; then
      echo -e "${RED}MySQL did not start after multiple attempts. Trying a restart...${NC}"
      systemctl restart mysql &>/dev/null || systemctl restart mysqld &>/dev/null || true
      sleep 3
      if ! mysqladmin ping &>/dev/null; then
        echo -e "${RED}MySQL still not reachable. Check: systemctl status mysql${NC}"
        exit 1
      fi
      break
    fi
    sleep 1
  done
}

# ---------------------------------------------------------------
# INSTALL
# ---------------------------------------------------------------
install_dashboard() {
  show_banner
  echo -e "${BOLD}=== Install Dashboard - Setup Wizard ===${NC}"
  echo ""

  PANEL_NAME=$(ask "1. Your Panel Name" "Pterodactyl Dashboard")
  ADMIN_EMAIL=$(ask "2. Admin Email")
  ADMIN_USERNAME=$(ask "3. Admin Username")
  ADMIN_PASS=$(ask_secret "4. Admin Pass")
  ADMIN_PASS_CONFIRM=$(ask_secret "5. Admin Confirm Pass")

  if [ "$ADMIN_PASS" != "$ADMIN_PASS_CONFIRM" ]; then
    echo -e "${RED}Passwords do not match. Please run install again.${NC}"
    exit 1
  fi

  HAS_IPV4=$(ask "6. Kiya Apka Vps ipv4 ha (yes/no)" "yes")
  APP_PORT=$(ask "7. Panel Port" "6000")
  WANT_DOMAIN=$(ask "8. Kiya apko domain connect karna ha (yes/no)" "no")

  DOMAIN=""
  if [[ "$WANT_DOMAIN" == "yes" ]]; then
    DOMAIN=$(ask "9. Enter Your Domain")
  fi

  echo ""
  echo -e "${GREEN}Starting installation... this may take a few minutes.${NC}"
  echo ""

  # Always work from a safe, stable directory so a later "rm -rf $APP_DIR"
  # never deletes the folder we are currently standing in.
  cd /root || cd /tmp || exit 1

  export DEBIAN_FRONTEND=noninteractive

  echo -e "${YELLOW}[1/9] Updating system & installing dependencies...${NC}"
  apt-get update -y &>/tmp/apt_update.log
  apt-get install -y curl git build-essential nginx ufw &>/tmp/apt_install.log
  if [ $? -ne 0 ]; then
    echo -e "${RED}Dependency installation failed. Check /tmp/apt_install.log${NC}"
    tail -n 20 /tmp/apt_install.log
    exit 1
  fi

  if ! command -v node &>/dev/null; then
    echo -e "${YELLOW}[2/9] Installing Node.js 20.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - &>/tmp/node_setup.log
    apt-get install -y nodejs &>>/tmp/node_setup.log
    if ! command -v node &>/dev/null; then
      echo -e "${RED}Node.js installation failed. Check /tmp/node_setup.log${NC}"
      exit 1
    fi
  fi

  if ! command -v pm2 &>/dev/null; then
    echo -e "${YELLOW}[3/9] Installing PM2 process manager...${NC}"
    npm install -g pm2 &>/tmp/pm2_install.log
  fi

  echo -e "${YELLOW}[4/9] Setting up MySQL database...${NC}"
  ensure_mysql_running
  DB_NAME="ptero_dashboard"
  DB_USER="ptero_dash_user"
  DB_PASS=$(random_string 20)

  mysql -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4;"
  mysql -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';"
  mysql -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'127.0.0.1';"
  mysql -e "FLUSH PRIVILEGES;"

  echo -e "${YELLOW}[5/9] Downloading Pterodactyl Dashboard...${NC}"
  mkdir -p "$(dirname "$APP_DIR")"
  cd /root || cd /tmp || exit 1
  if [ -d "$APP_DIR" ]; then rm -rf "$APP_DIR"; fi
  git clone --quiet "$REPO_URL" "$APP_DIR"
  if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}Git clone failed. Check your internet connection / repo URL.${NC}"
    exit 1
  fi
  cd "$APP_DIR" || exit 1

  echo -e "${YELLOW}[6/9] Installing npm packages...${NC}"
  npm install --omit=dev --silent
  if [ $? -ne 0 ]; then
    echo -e "${RED}npm install failed.${NC}"
    exit 1
  fi

  echo -e "${YELLOW}[7/9] Writing configuration (.env)...${NC}"
  cat > "$ENV_FILE" <<EOF
APP_PORT=${APP_PORT}
SESSION_SECRET=$(random_string 40)

DB_HOST=127.0.0.1
DB_USER=${DB_USER}
DB_PASS=${DB_PASS}
DB_NAME=${DB_NAME}

PANEL_URL=
PANEL_API_KEY=
EOF

  mysql "$DB_NAME" < "$APP_DIR/schema.sql"
  mysql -e "UPDATE ${DB_NAME}.settings SET panel_name='${PANEL_NAME}' WHERE id=1;"

  echo -e "${YELLOW}[8/9] Creating your Admin account...${NC}"
  node scripts/create-admin.js "$ADMIN_USERNAME" "$ADMIN_EMAIL" "$ADMIN_PASS"

  echo -e "${YELLOW}[9/9] Starting Dashboard with PM2...${NC}"
  pm2 delete "$SERVICE_NAME" &>/dev/null || true
  pm2 start server.js --name "$SERVICE_NAME"
  pm2 save &>/dev/null
  pm2 startup systemd -u root --hp /root &>/dev/null || true

  ufw allow "$APP_PORT"/tcp &>/dev/null || true
  ufw allow 80/tcp &>/dev/null || true
  ufw allow 443/tcp &>/dev/null || true

  echo -e "${YELLOW}Verifying the app is actually responding on port ${APP_PORT}...${NC}"
  sleep 4
  if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}" | grep -qE "200|302"; then
    echo -e "${GREEN}✔ App is up and responding.${NC}"
  else
    echo -e "${RED}⚠ App did not respond on port ${APP_PORT}. Showing last logs:${NC}"
    pm2 logs "$SERVICE_NAME" --lines 30 --nostream
    echo -e "${YELLOW}Fix the error above, then run: pm2 restart ${SERVICE_NAME}${NC}"
  fi

  if [[ "$WANT_DOMAIN" == "yes" && -n "$DOMAIN" ]]; then
    setup_nginx_domain "$DOMAIN" "$APP_PORT"
  fi

  echo ""
  echo -e "${GREEN}${BOLD}✔ Installation Complete!${NC}"
  echo -e "${GREEN}--------------------------------------------${NC}"
  if [[ "$WANT_DOMAIN" == "yes" && -n "$DOMAIN" ]]; then
    echo -e "Access URL     : ${CYAN}https://${DOMAIN}${NC}"
  else
    SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
    echo -e "Access URL     : ${CYAN}http://${SERVER_IP}:${APP_PORT}${NC}"
  fi
  echo -e "Admin Email    : ${ADMIN_EMAIL}"
  echo -e "Admin Username : ${ADMIN_USERNAME}"
  echo -e "${GREEN}--------------------------------------------${NC}"
  echo -e "${YELLOW}Important: Go to Admin > Settings and set your Panel URL + Pterodactyl API Key.${NC}"
  echo ""
  pause
}

setup_nginx_domain() {
  local domain="$1" port="$2"
  echo -e "${YELLOW}Configuring Nginx for ${domain}...${NC}"
  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/ptero-dashboard
  nginx -t &>/dev/null && systemctl reload nginx

  if ! command -v certbot &>/dev/null; then
    apt-get install -y certbot python3-certbot-nginx &>/dev/null
  fi
  certbot --nginx -d "$domain" --non-interactive --agree-tos -m admin@"$domain" --redirect &>/dev/null || \
    echo -e "${RED}SSL setup failed - you can run certbot manually later: certbot --nginx -d ${domain}${NC}"
}

# ---------------------------------------------------------------
# UNINSTALL
# ---------------------------------------------------------------
uninstall_dashboard() {
  show_banner
  echo -e "${RED}${BOLD}=== Uninstall Dashboard ===${NC}"
  CONFIRM=$(ask "Are you sure you want to uninstall? (yes/no)" "no")
  if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled."
    pause
    return
  fi

  cd /root || cd /tmp || exit 1

  pm2 delete "$SERVICE_NAME" &>/dev/null || true
  pm2 save &>/dev/null || true

  if [ -f "$ENV_FILE" ]; then
    DB_NAME=$(grep DB_NAME "$ENV_FILE" | cut -d '=' -f2)
    mysql -e "DROP DATABASE IF EXISTS ${DB_NAME};" &>/dev/null || true
  fi

  rm -rf "$APP_DIR"
  rm -f "$NGINX_CONF" /etc/nginx/sites-enabled/ptero-dashboard
  systemctl reload nginx &>/dev/null || true

  echo -e "${GREEN}✔ Dashboard uninstalled successfully.${NC}"
  pause
}

# ---------------------------------------------------------------
# CHANGE DOMAIN
# ---------------------------------------------------------------
change_domain() {
  show_banner
  echo -e "${BOLD}=== Change Domain ===${NC}"
  if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}Dashboard is not installed.${NC}"
    pause; return
  fi
  NEW_DOMAIN=$(ask "Enter new domain")
  APP_PORT=$(grep APP_PORT "$ENV_FILE" | cut -d '=' -f2)
  setup_nginx_domain "$NEW_DOMAIN" "$APP_PORT"
  echo -e "${GREEN}✔ Domain updated to ${NEW_DOMAIN}${NC}"
  pause
}

# ---------------------------------------------------------------
# BACKUP
# ---------------------------------------------------------------
take_backup() {
  show_banner
  echo -e "${BOLD}=== Take Backup ===${NC}"
  if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}Dashboard is not installed.${NC}"
    pause; return
  fi
  mkdir -p "$BACKUP_DIR"
  TS=$(date +%Y%m%d_%H%M%S)
  DB_NAME=$(grep DB_NAME "$ENV_FILE" | cut -d '=' -f2)

  echo -e "${YELLOW}Dumping database...${NC}"
  mysqldump "$DB_NAME" > "$BACKUP_DIR/db_${TS}.sql"

  echo -e "${YELLOW}Archiving app files (excluding node_modules)...${NC}"
  tar --exclude="node_modules" -czf "$BACKUP_DIR/app_${TS}.tar.gz" -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")"

  echo -e "${GREEN}✔ Backup saved to ${BACKUP_DIR}/${NC}"
  echo "   - db_${TS}.sql"
  echo "   - app_${TS}.tar.gz"
  pause
}

# ---------------------------------------------------------------
# LOAD BACKUP
# ---------------------------------------------------------------
load_backup() {
  show_banner
  echo -e "${BOLD}=== Load Backup ===${NC}"
  if [ ! -d "$BACKUP_DIR" ]; then
    echo -e "${RED}No backups found.${NC}"
    pause; return
  fi

  echo "Available DB backups:"
  select DB_FILE in "$BACKUP_DIR"/db_*.sql; do
    [ -n "$DB_FILE" ] && break
  done

  echo "Available app archives:"
  select APP_FILE in "$BACKUP_DIR"/app_*.tar.gz; do
    [ -n "$APP_FILE" ] && break
  done

  DB_NAME=$(grep DB_NAME "$ENV_FILE" | cut -d '=' -f2)
  echo -e "${YELLOW}Restoring database...${NC}"
  mysql "$DB_NAME" < "$DB_FILE"

  echo -e "${YELLOW}Restoring app files...${NC}"
  cd /root || cd /tmp || exit 1
  pm2 delete "$SERVICE_NAME" &>/dev/null || true
  rm -rf "$APP_DIR"
  tar -xzf "$APP_FILE" -C "$(dirname "$APP_DIR")"
  cd "$APP_DIR" && npm install --omit=dev --silent
  pm2 start server.js --name "$SERVICE_NAME"
  pm2 save &>/dev/null

  echo -e "${GREEN}✔ Backup restored successfully.${NC}"
  pause
}

# ---------------------------------------------------------------
# MAIN MENU
# ---------------------------------------------------------------
main_menu() {
  while true; do
    show_banner
    echo -e "${BOLD}1. Install Dashboard${NC}"
    echo -e "${BOLD}2. Uninstall Dashboard${NC}"
    echo -e "${BOLD}3. Change Domain${NC}"
    echo -e "${BOLD}4. Take Backup${NC}"
    echo -e "${BOLD}5. Load Backup${NC}"
    echo -e "${BOLD}0. Exit${NC}"
    echo ""
    CHOICE=$(ask "Select an option")

    case "$CHOICE" in
      1) install_dashboard ;;
      2) uninstall_dashboard ;;
      3) change_domain ;;
      4) take_backup ;;
      5) load_backup ;;
      0) exit 0 ;;
      *) echo -e "${RED}Invalid option.${NC}"; sleep 1 ;;
    esac
  done
}

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run this script as root (sudo bash install.sh)${NC}"
  exit 1
fi

main_menu
