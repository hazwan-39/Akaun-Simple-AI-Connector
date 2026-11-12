# Deployment Guide — Classroom Akaun Simple

## Pre-requisites
- PHP 8.2+
- MySQL (create a database: `classroom_akaunsimple`)
- Composer on the server (or upload vendor/ locally built)
- Node.js (to build assets locally before upload)

---

## Step 1 — Build Assets Locally

Run these on your local machine before zipping:

```bash
cd apps
composer install --no-dev --optimize-autoloader
npm install
npm run build
```

After this, the `public/build/` folder will be generated.

---

## Step 2 — Configure `.env`

Copy `.env.example` to `.env` and fill in:

```
APP_NAME="Classroom - Akaun Simple"
APP_ENV=production
APP_KEY=           ← generate with: php artisan key:generate
APP_URL=https://yourdomain.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=classroom_akaunsimple
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password

MAIL_MAILER=smtp
MAIL_SCHEME=ssl
MAIL_HOST=smtp.resend.com
MAIL_PORT=465
MAIL_USERNAME=resend
MAIL_PASSWORD=re_Z4SJa5ZD_QEeg8QipVLNAkqrQxrpDbWLF
MAIL_FROM_ADDRESS="notifications@akaunsimple.plus"
MAIL_FROM_NAME="Classroom - Akaun Simple"
```

---

## Step 3 — Upload via File Manager

1. ZIP the entire `apps/` folder.
2. Upload and extract to your hosting root (e.g., `public_html/`).
3. The root `.htaccess` will redirect traffic to `public/`.

---

## Step 4 — Run Migrations & Seeders (via SSH or cPanel Terminal)

```bash
cd /path/to/public_html
php artisan key:generate
php artisan migrate --force
php artisan db:seed --force
php artisan storage:link
```

---

## Step 5 — Set Permissions

```bash
chmod -R 775 storage
chmod -R 775 bootstrap/cache
```

---

## Default Admin Account

- **Email:** admin@akaunsimple.plus
- **Password:** Admin@123456

> Change password immediately after first login!

---

## Roles

| Role    | Default for |
|---------|-------------|
| admin   | Seeded admin user |
| trainer | Manually assigned |
| student | All new registrations |
