# Backend Ledger

A ledger application with a Node.js/Express API and a React/Vite frontend. The backend uses MongoDB for persistence and JWT-based authentication with HTTP-only cookies.

## Project layout

- `backend/` — Express API, MongoDB models, authentication, accounts, transactions, and email service
- `frontend/` — React client built with Vite
- `_test_runner.js` — local end-to-end test runner for the backend

## Requirements

- Node.js 18+
- MongoDB running locally or a MongoDB connection string

## Local setup

1. Install backend dependencies:

   ```bash
   cd backend
   npm install
   cp .env.example .env
   ```

2. Fill in the values in `backend/.env`. Never commit `.env`; only `.env.example` belongs in Git.

3. Install frontend dependencies:

   ```bash
   cd ../frontend
   npm install
   ```

4. Start the backend in one terminal:

   ```bash
   cd backend
   npm run dev
   ```

5. Start the frontend in another terminal:

   ```bash
   cd frontend
   npm run dev
   ```

The API runs on `http://localhost:3000` and the frontend runs on `http://localhost:5173` by default.

## Useful commands

```bash
# Backend
cd backend && npm start

# Frontend production build
cd frontend && npm run build
```

## Security note

Environment files, dependencies, build output, logs, and local editor files are excluded from the repository. If credentials were ever committed or shared accidentally, rotate them before publishing the repository.
