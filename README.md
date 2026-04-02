# Clothing Store (Express + MongoDB + Vanilla JS)

This is a complete clothing shopping website with:
- Responsive homepage (navbar, hero banner, category filters, product grid)
- Login/Register
- Cart drawer with dynamic add/update/remove
- Checkout page
- Backend REST APIs (`/api/*`) and MongoDB persistence

## Prerequisites
1. Install **Node.js** (LTS recommended)
2. Install and start **MongoDB**
   - Default URI used in `.env`: `mongodb://127.0.0.1:27017/clothing_store`

## Setup
1. Open PowerShell in this folder: `clothing-store`
2. Create your `.env` file:
   - Copy `.env.example` -> `.env`
   - Set `JWT_SECRET` to a long random string
   - If MongoDB runs on a different host/DB name, update `MONGODB_URI`

3. Install dependencies:
   - `npm install`

## Run
1. Start the server:
   - `npm start`
2. Open:
   - `http://localhost:3000`

## Notes
- Product images are loaded from free Unsplash image endpoints (real image URLs).
- Checkout places an order into MongoDB (no payment integration).

