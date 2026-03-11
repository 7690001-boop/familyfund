# Family Money (saveing)

A Hebrew RTL family finance app for parents and kids to manage shared investments, savings goals, and investment simulations together.

## Architecture

- **Frontend**: Vanilla JS (ES modules), no framework — component-based with reactive store pattern
- **Backend**: Firebase (Auth + Firestore), Firebase Cloud Functions (Node.js 20)
- **Worker**: Cloudflare Workers — CORS proxy for Yahoo Finance & Globes APIs, admin operations
- **Hosting**: Firebase Hosting

## Key Features

- Manager (parent) and member (kid) roles with family-scoped permissions
- Investment portfolio tracking with real-time prices (stocks, ETFs, Israeli mutual funds)
- Personal savings goals and investment simulations per member
- Kid login via username + family code (synthetic email: `member.saveing.local`)
- Avatar customization, member impersonation for testing

## Project Structure

- `index.html` — SPA entry point
- `js/` — frontend modules (components/views, services, stores)
- `cloudflare-worker/worker.js` — Cloudflare Worker (API proxy + admin)
- `functions/` — Firebase Cloud Functions
- `firestore.rules` — Firestore security rules
- `styles.css` — RTL responsive styles with CSS variables

## Dev Commands

- `npm test` — run tests (vitest)
- `npm run test:watch` — watch mode
- `npx wrangler deploy` — deploy Cloudflare Worker
- `firebase deploy` — deploy hosting, functions, rules

## Notes

- Firebase SDK loaded from CDN (v10.14.1), not bundled
- All UI text is in Hebrew
- Uses Fredoka font for kid-friendly design
