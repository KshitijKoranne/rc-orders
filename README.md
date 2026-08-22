# Rithya Creations

Private, single-user order and product manager for Rithya Creations.

## What it does

- Maintain a product catalogue by R-code, price, photo, and notes.
- Create and edit customer orders with automatic amount and payment status.
- Search and filter orders by customer, phone, R-code, or status.
- Export CSV files and create/restore JSON backups.

## Data and access

The workbench requires the `RITHYA_ACCESS_PASSWORD` environment secret. The
password is never committed to the repository. Sessions use an HttpOnly cookie
and expire after five minutes without activity. Products and orders are stored
in PostgreSQL on the VPS through the `DATABASE_URL` environment variable. The
application creates its two tables on first use and keeps the database private
on Coolify's internal network. Use **Backup** to download an additional JSON
copy before making a large change.

Because customer details can include phone numbers, keep the VPS route private
with a VPN, IP allowlist, or reverse-proxy access control if the app is reachable
outside your own network.

## Local development

Use Node.js `>=22.13.0`:

```sh
npm ci
npm run dev
```

## Production

The included Dockerfile runs the locked install, builds the Vinext application,
and starts it on port `3000`. Coolify deploys this repository from the `main`
branch alongside a persistent PostgreSQL service. Set `DATABASE_URL` on the
application before the first deploy.

Useful checks:

```sh
npm run build
npm run lint
npm test
```
