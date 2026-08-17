# Rithya Creations

Private, single-user order and product manager for Rithya Creations.

## What it does

- Maintain a product catalogue by R-code, price, photo, and notes.
- Create and edit customer orders with automatic amount and payment status.
- Search and filter orders by customer, phone, R-code, or status.
- Export CSV files and create/restore JSON backups.

## Data and access

This version deliberately has no login and no server database. Products and
orders are stored in the browser's local storage, which fits the current
single-user workflow. Use **Backup** regularly and keep the JSON file somewhere
safe; clearing browser storage removes the local copy.

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
and starts it on port `3000`. Coolify can deploy this repository directly from
the `main` branch.

Useful checks:

```sh
npm run build
npm run lint
npm test
```
