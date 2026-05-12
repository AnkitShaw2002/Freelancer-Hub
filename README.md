# 🚀 Freelancer Hub
**Node.js · Express.js · MongoDB · EJS · Socket.io · Stripe · Google Gemini AI · Docker · Redis**

A professional full-stack freelance marketplace where clients post AI-summarized projects, freelancers submit competitive bids, and payments are handled through a secure escrow system — all in real time.

---


## 🚀 Live Demo

[![Live Demo](https://img.shields.io/badge/Live_Demo-View_Project-brightgreen?style=for-the-badge&logo=render)](https://freelancer-hub-h8ic.onrender.com)


## 🚀 Features & Modules

- **AI-Powered Project Posting:** Google Gemini AI auto-generates a 3-bullet summary and identifies required skill tags from the client's raw project description.
- **Role-Based Access Control (RBAC):** Two distinct user roles:
  - **Client:** Post projects, review bids, select a winner, approve completed work, and release payments.
  - **Freelancer:** Browse open projects, submit bids with proposals, and communicate with the client after being hired.
- **Real-Time Bidding & Notifications:** Socket.io delivers instant bid alerts to the client's dashboard the moment a freelancer submits a proposal.
- **Secure Escrow Payments:** Stripe collects the project fee upfront from the client. Funds are held by the system and released to the freelancer's virtual wallet only after the client marks the project as complete.
- **Live Chat:** A dedicated Socket.io chat channel opens between the client and the hired freelancer upon project assignment.
- **Virtual Wallet:** Each freelancer has an in-app wallet that receives released funds after successful project completion.
- **Session Caching with Redis:** Frequently accessed data is cached using Redis to reduce database load and improve response time.
- **Dockerized Deployment:** The entire application is containerized with Docker for consistent environments across development and production.
- **MVC Architecture:** Strict separation of concerns across Models, Views, and Controllers with manual ID referencing instead of `.populate()` for precise data control.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB (No-Populate Strategy — manual ID lookups) |
| **Frontend / Views** | EJS (Embedded JavaScript Templates) |
| **Real-Time** | Socket.io (Chat & Live Notifications) |
| **AI** | Google Gemini API (Free Tier) |
| **Payments** | Stripe API (Test Mode) |
| **Caching** | Redis |
| **Containerization** | Docker |
| **Authentication** | JWT (JSON Web Tokens) + Cookie-based sessions |

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the root directory and define the following variables:

```env
# Database
MONGO_URL=

# Authentication
JWT_SECRET_KEY=
JWT_EXPIRES_IN=
SESSION_SECRET=
BASE_URL=


# ── Cloudinary (optional — local disk used if not set) ──────────
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Google Gemini AI
# Google Gemini Flash — Free: 15 req/min, 1500/day
GEMINI_API_KEY=

# Stripe Payment Gateway
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Redis
REDIS_URL=

# Mail
MAIL_HOST =
MAIL_PORT =
MAIL_USER =
MAIL_PASS =
MAIL_FROM =

# App Config
PORT=3000
NODE_ENV=development

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

---

## 📂 Folder Structure

Strict MVC pattern implementation for clean code separation.

```text
C:.

├───app
│   ├───config
 
│   │       cloudinary.js
│   │       db.js
│   │       emailConfig.js
│   │       passport.js
│   │       redis.js
│   │       swagger.js
│   │
│   ├───controllers
│   │       adminController.js
│   │       authController.js
   
│   │       clientController.js
│   │       dashboardController.js
│   │       disputeController.js
│   │       messageController.js
│   │       pagesController.js
│   │       paymentController.js
│   │       profileController.js
│   │       projectController.js
│   │       reviewController.js
│   │
│   ├───helper
│   │       apiValidation.js
│   │       csvHelper.js
│   │
│   ├───logs
│   │       combined.log
│   │       error.log
│   │
│   ├───middleware
│   │       checkAuth.js
│   │       errorHandler.js
│   │       rateLimiter.js
│   │       roleChecker.js
│   │       Uploadchecker.js
│   │       validateRequest.js
│   │       validator.js
│   │
│   ├───models
│   │       Dispute.js
│   │       Message.js
│   │       Project.js
│   │       Review.js
│   │       roleModel.js
│   │       Transaction.js
│   │       User.js
│   │
│   ├───public
│   │   └───uploads
│   ├───routers
│   │   ├───apiRoutes
│   │   └───webRoutes
│   │           admin.js
│   │           authRouter.js
│   │           client.js
│   │           freelancer.js
│   │           messages.js
│   │           pageRouter.js
│   │           profile.js
│   │           projects.js
│   │           reviews.js
│   │
│   ├───services
│   │       aiService.js
│   │       emailService.js
│   │
│   ├───utils
│   │       fileUpload.js
│   │       logger.js
│   │       redisCache.js
│   │       sendEmail.js
│   │       socket.js
│   │
│   └───webservices

├───logs
│       access.log
│
├───public
│   ├───css

│   ├───images
│   └───js
│           main.js
│
├───tests

└───view
│   .env
│   .gitignore
│   app.js
│   docker-compose.yaml
│   Dockerfile
│   package-lock.json
│   package.json
│   README.md
│   README4.md
│   seedRoles.js
│   server.js

```

---

## 🔄 Application Flow

1. **Register / Login** — User selects a role (Client or Freelancer) and authenticates via JWT.
2. **Client Posts a Project** — Enters a description; Gemini AI generates a summary and skill tags automatically.
3. **Freelancers Bid** — Browse projects, submit a numeric bid and written proposal. Client receives a real-time Socket.io notification.
4. **Client Selects a Winner** — Reviews all bids and assigns the project with one click. A live chat channel opens between both parties.
5. **Client Pays via Stripe** — Project fee is collected upfront and held in escrow.
6. **Work & Communication** — Client and freelancer communicate via real-time Socket.io chat.
7. **Project Completion** — Client marks the project complete; Stripe releases the escrowed funds to the freelancer's virtual wallet.

---

## 🗄️ Database Schema (No-Populate Strategy)

All inter-document references are stored as raw `ObjectId` fields and resolved manually in controllers — no Mongoose `.populate()` is used. This approach provides explicit control over query depth and eliminates unintended data over-fetching.

**Core Collections:**

| Collection | Key Fields |
|---|---|
| `users` | `_id`, `name`, `email`, `password`, `role` (client / freelancer) |
| `projects` | `_id`, `clientId`, `title`, `description`, `aiSummary`, `skillTags`, `status` |
| `bids` | `_id`, `projectId`, `freelancerId`, `amount`, `proposal`, `status` |
| `wallets` | `_id`, `userId`, `balance`, `transactions[]` |
| `messages` | `_id`, `projectId`, `senderId`, `receiverId`, `content`, `timestamp` |

---

## 🔐 Security

- **JWT Authentication** — Stateless token-based auth with HttpOnly cookies.
- **Role Guards** — Middleware enforces Client-only and Freelancer-only route access.
- **Stripe Webhook Verification** — Payment events are verified using Stripe's signature to prevent spoofed requests.
- **Redis Session Caching** — Reduces repeated database reads for authenticated sessions.
- **Helmet.js** — HTTP security headers on all responses.
- **Rate Limiting** — Prevents brute-force and DDoS attacks on auth endpoints.

---

## 🐳 Docker Setup

```bash
# Build and start all services (App + MongoDB + Redis)
docker-compose up --build

# Stop all services
docker-compose down
```

---

## 📦 Installation (Without Docker)

```bash
# 1. Clone the repository
git clone <repository-url>
cd freelancer-hub

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Fill in your values in .env

# 4. Start the development server
npm run dev
```

> **Requires:** Node.js v18+, MongoDB running locally or via Atlas, Redis server.

---

## 🔮 Future Improvements

- AI-powered bid ranking to surface the most relevant freelancer proposals to the client
- Freelancer analytics dashboard with earnings history and project performance metrics
- Rating and review system after project completion
- Email notifications via Nodemailer for bid alerts and payment confirmations
- Multi-currency support via Stripe
- Mobile application (React Native)
- Swagger API documentation

---

## 🙏 Acknowledgements

This project was developed as a final full-stack web development project under the guidance of **[Mentor's Name] Sir**.
