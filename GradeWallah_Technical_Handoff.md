# GradeWallah – Technical Handoff Guide

This guide explains how a buyer can receive, set up, and run GradeWallah after a one-time transfer.

## What the buyer receives
- Complete React + Vite frontend codebase
- Pages, components, utilities, and calculation logic
- Configuration files needed to run and deploy the app
- Domain `gradewallah.com`
- One-time ownership transfer

## High-level project structure
- `src/` contains the application code
- `src/pages/` contains page-level components
- `src/pages/components/` contains shared UI components
- `src/lib/` contains utilities, auth helpers, grades engine, content logic, and data helpers
- `index.html` is the app entry point
- `vite.config.js` is the build configuration
- `.env.example` shows required environment variables

## Required environment variables
The project expects the following variables:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PYTHON_BACKEND_URL`

The buyer should create a `.env` file from `.env.example` and fill in real values before starting the app.

## Local setup steps
1. Clone or copy the repository
2. Run `npm install`
3. Copy `.env.example` to `.env`
4. Add real Clerk, Supabase, and backend URL values
5. Run `npm run dev`
6. Open `http://localhost:5173`

## Other useful commands
- `npm run build`
- `npm run preview`
- `npm run lint`

## Deployment
The project is deployment-ready for Vercel.

Before going live, the buyer should confirm:
- Clerk auth is working
- Supabase connection is working
- Backend URL is correct
- Domain DNS is moved to the buyer's hosting / Vercel account

## Auth and data model
- Authentication is handled by Clerk
- Supabase is used as the database / content layer
- The app uses protected routes for authenticated access
- Content gating logic waits for live CMS content before granting access to certain pages

## Important handoff notes
- The buyer should treat the seller as a one-time transfer provider, not a long-term maintainer
- After transfer, debugging, updates, and infrastructure management are the buyer's responsibility
- A clean handoff works best when the buyer already has access to Clerk, Supabase, and Vercel dashboards
- If the buyer does not have a developer, they should arrange one before final transfer

## Recommended handoff checklist
- Transfer repository access
- Transfer domain
- Share Clerk dashboard access
- Share Supabase dashboard access
- Share Vercel project access
- Share `.env.example` with real values separately
- Walk through local run and production deploy
- Share this handoff document

## Simple maintenance expectations after sale
- Bug fixing
- Dependency updates
- Deployment management
- Content updates in Supabase / CMS
- Minor feature changes if required

This makes the sale cleaner because the buyer knows exactly what ownership means in practice.
