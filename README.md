# Freelancer Hub

A full-stack Freelancer Hub project built with Node.js, Express, MongoDB, Passport, Stripe, Redis session support, and EJS templating.

## Features

- User registration, login, and authentication
- Role-based access for clients, freelancers, and admins
- Project posting, bidding, and project management
- Messaging, disputes, reviews, and notification support
- Stripe webhook support for payments
- AI and email service integrations
- Jest + Supertest API testing with in-memory MongoDB

## Tech Stack

- Node.js
- Express
- MongoDB / Mongoose
- Passport.js
- Redis (session support)
- EJS views
- Stripe payments
- Jest + Supertest for tests

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- MongoDB (or use the app with an external MongoDB URI)
- Redis (optional for session storage in production)

### Install dependencies

```bash
npm install
```

### Configure environment variables

Copy `.env.example` or create a new `.env` file at the project root and add the required variables.

Example variables:

```env
PORT=3000
MONGO_URL=mongodb://localhost:27017/freelancehub
JWT_SECRET_KEY=your_jwt_secret
SESSION_SECRET=your_session_secret
BASE_URL=http://localhost:3000
CLIENT_ORIGIN=http://localhost:3000
REDIS_URL=redis://localhost:6379
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=your@email.com
MAIL_PASS=your_email_password
MAIL_FROM="FreelancerHub" <no-reply@example.com>
STRIPE_SECRET_KEY=sk_test_...
```

### Run the application

```bash
npm start
```

### Seed roles

```bash
npm run seed
```

## Testing

Run the full Jest test suite:

```bash
npm test
```

Run a specific test file:

```bash
npx jest tests/projectApi.test.js --runInBand
```

## Project Structure

- `app/` - Express application code
- `app/config/` - configuration modules
- `app/controllers/` - controller logic
- `app/routers/` - API and web route definitions
- `app/services/` - third-party and helper services
- `app/models/` - Mongoose models
- `public/` - static assets
- `view/` - EJS templates
- `tests/` - Jest and Supertest API tests

## Notes

- The app disables Redis and email transport during `NODE_ENV=test`.
- Tests use `mongodb-memory-server` for isolated in-memory MongoDB instances.

## License

ISC
