# Run Chunked with XAMPP on Windows

This is the local demo setup for the Day-first version. The Laravel app uses MySQL; it does not use the workspace's PostgreSQL service.

## 1. Check the tools

In PowerShell, check that PHP is 8.2 or newer and that Composer, Node.js, and pnpm are available:

```powershell
php -v
composer --version
node --version
pnpm --version
```

Laravel 12 requires PHP 8.2+. If XAMPP's PHP is older, use a compatible XAMPP/PHP installation before continuing.

## 2. Start XAMPP and create the database

1. Start **Apache** and **MySQL** in the XAMPP Control Panel.
2. Open phpMyAdmin and create a database named `chunked`, using `utf8mb4_unicode_ci`.

Apache is only needed here for phpMyAdmin. The application itself runs with Laravel's local development server.

## 3. Install packages and configure Laravel

Run these commands from the workspace root (the folder containing `pnpm-workspace.yaml`):

```powershell
pnpm install
composer install --working-dir=artifacts/chunked/laravel
Copy-Item artifacts/chunked/laravel/.env.example artifacts/chunked/laravel/.env
```

Edit `artifacts/chunked/laravel/.env` for your local MySQL connection:

```dotenv
APP_NAME=Chunked
APP_URL=http://127.0.0.1:8000
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=chunked
DB_USERNAME=root
DB_PASSWORD=
```

The blank password is only the common local XAMPP default. If your MySQL account has a password, put it in your local `.env`; never share or commit that file.

Then run:

```powershell
cd artifacts/chunked/laravel
php artisan key:generate
php artisan migrate
cd ../../..
pnpm --filter @workspace/chunked run build
cd artifacts/chunked/laravel
php artisan serve
```

Open `http://127.0.0.1:8000`, create an account, and choose or skip the day-rhythm setup. Migrations create the tables; no database import is needed.

## Scope and data

The current milestone includes registration/login, day-rhythm setup, chunks, dated tasks, completion, editing, moving, deleting, and basic appearance/navigation preferences. Unfinished-task choices are manual: move to another chunk/date, mark done, leave for later, or delete. No AI action runs in this version. Arabic currently changes page direction only; the text is still English.

Goals, Focus, payments, dashboard card rearranging, decorative profile covers, and 3D elements are not part of this Day-first milestone. The Replit preview uses a temporary local MariaDB instance for development; its data resets when that workflow restarts. Use XAMPP/MySQL for the local demo data you need to keep.
