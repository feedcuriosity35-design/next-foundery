# Next Foundery — Businesses Built Better

Official web platform for Next Foundery featuring the **Business Growth Blueprint Masterclass** (₹199 INR launch offer), Cashfree Payment Gateway integration, verified UPI workflows, and session onboarding.

## Key Features
- **Masterclass Registration**: Server-enforced ₹199 pricing.
- **Payment Gateway**: Cashfree PG (UPI, Cards, NetBanking, Wallets) + Direct UPI QR fallback.
- **Support**: Direct email dispatch and contact routing to `nextfoundery@gmail.com`.
- **Admin Verification Portal**: `/admin/orders?pin=admin199` for tracking registrations and transactions.
- **Automated Webhooks**: Idempotent Cashfree & Razorpay payment event processing.

## Tech Stack
- **Backend**: Node.js (v18+) & Express
- **View Engine**: EJS with Vanilla CSS (Dark/Forest green theme & Outfit typography)
- **Database**: SQLite (better-sqlite3) with WAL mode
- **Payment Gateway**: Cashfree PG API v2023-08-01 & Cashfree SDK v3

## Local Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/feedcuriosity35-design/next-foundery.git
   cd next-foundery
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Add your Cashfree App ID and Secret Key to `.env`.
4. Start the server:
   ```bash
   npm start
   ```
   Visit [http://localhost:3000](http://localhost:3000).

## 1-Click Free Deployment on Render
1. Sign up on [Render.com](https://render.com) (free).
2. Click **New +** &rarr; **Web Service**.
3. Connect your GitHub repository: `feedcuriosity35-design/next-foundery`.
4. Render will automatically detect `render.yaml` or you can configure:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. In **Environment Variables**, add:
   - `CASHFREE_APP_ID`: Your Cashfree Client ID
   - `CASHFREE_SECRET_KEY`: Your Cashfree Secret Key
   - `CASHFREE_ENV`: `PRODUCTION` (or `SANDBOX` for testing)
6. Click **Deploy Web Service** & your live website will be accessible globally with free SSL (HTTPS)!
