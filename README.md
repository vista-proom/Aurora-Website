# Aurora Group — Corporate Platform & Operations Hub

Enterprise web platform for **Aurora Group** (Creative Production, Media, Digital Strategy & Event Management). Featuring a public multi-lingual corporate showcase, client brief engine, client inquiry portal, employee portfolio management, and a role-based IT & Operations Admin Console.

---

## 🌟 Key Features

1. **Public Corporate Website & Showcase**
   - Seamless Bilingual Support: Full English and Arabic (RTL) localization.
   - Dynamic Dark / Light mode with smooth aesthetic transitions.
   - Cinematic Video & Media Showreel with interactive media sliders.
   - Portfolio Showcase with filterable categories and detail modal views.
   - Client Logo Carousel featuring all brand partners and clinics.

2. **Client Brief & Inquiry Engine**
   - Interactive multi-step creative brief builder.
   - Automatic live synchronization to Google Sheets.
   - Automated email alerts via Nodemailer for incoming requests.

3. **Enterprise Authentication & Access Control (RBAC)**
   - Powered by **Firebase Authentication** + **Firebase Admin SDK**.
   - Google SSO ("Sign in with Google") and Password Login.
   - Role-Based Access Control: `super_admin`, `manager`, `employee`.
   - Automated Password Reset flow and Admin Expire-Password enforcement.
   - Route and API security guards against unauthorized URL manipulation.

4. **Staff Operations Portal & Admin Panel**
   - `/portal`: Dedicated employee portal for profile updates and portfolio clip curation.
   - `/admin`: Central management console for Users, Content, Services, Projects, Briefs, CRM Inquiries, and System Health.
   - Hybrid Data Store: **MongoDB Atlas** cloud database with seamless local JSON fallback.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm` (included with Node.js)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-org/aurora-website.git
cd aurora-website
npm install
```

### 3. Environment Configuration
Copy the environment template and configure your credentials:
```bash
cp .env.example .env
```
Edit `.env` with your values:
```env
PORT=3000
MONGODB_URI=your_mongodb_atlas_connection_string
GOOGLE_SHEETS_URL=your_google_sheets_sync_url
FIREBASE_SERVICE_ACCOUNT_PATH=./server/serviceAccountKey.json
```

Place your Firebase Admin private key at `server/serviceAccountKey.json` (see `server/serviceAccountKey.example.json` for structure).

### 4. Running the Platform
- **Production Mode**:
  ```bash
  npm start
  ```
- **Development Mode** (with hot reload):
  ```bash
  npm run dev
  ```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📁 Project Architecture

```
├── client/                     # Frontend Application (Single Page Architecture)
│   ├── index.html              # Main HTML entry point & UI templates
│   ├── assets/                 # Fonts, branding, logos, and media
│   │   ├── aurora/             # Official Aurora identity assets & vector marks
│   │   ├── fonts/              # Satoshi & DM Serif web fonts
│   │   ├── logos/              # Partner and client brand logos
│   │   └── Image_error.jpg     # Safe fallback placeholder image
│   ├── css/                    # Modular Vanilla CSS design system
│   │   ├── base.css            # Resets and baseline element styling
│   │   ├── tokens.css          # Design tokens (colors, typography, spacing)
│   │   ├── layout.css          # Grid systems and page containers
│   │   ├── components.css      # Buttons, inputs, cards, and modal styles
│   │   ├── screens.css         # Page-specific views (Showcase, Admin, Portal)
│   │   └── rtl.css             # Right-to-left layout rules for Arabic
│   └── js/                     # Modular Frontend JavaScript
│       ├── app.js              # Core UI controller, rendering & interactions
│       ├── api.js              # REST API client wrapper
│       ├── firebaseAuth.js     # Firebase Client SDK & Google Auth handlers
│       ├── router.js           # Client-side routing & RBAC route protection
│       ├── i18n.js             # Translation dictionary (EN / AR)
│       └── theme.js            # Theme switcher (Dark / Light)
│
├── server/                     # Backend API & Server
│   ├── server.js               # Express server, route definitions & security
│   ├── serviceAccountKey.json  # Firebase Admin SDK Credentials
│   ├── models/                 # Data abstraction layer
│   │   ├── dataStore.js        # Hybrid DataStore (MongoDB + JSON fallback)
│   │   └── mongooseModels.js   # Mongoose schemas for MongoDB Atlas
│   ├── services/               # Modular Backend Services
│   │   ├── dbService.js        # MongoDB connection lifecycle management
│   │   ├── firebaseAuthService.js # Firebase Admin SDK operations
│   │   ├── sheetsService.js    # Google Sheets 2-way synchronization
│   │   └── emailService.js     # SMTP transactional email service
│   └── data/                   # Initial local JSON database records
│
├── .env.example                # Template for environment variables
├── .gitignore                  # Git ignore rules for secrets & build files
├── package.json                # Project dependencies and npm scripts
└── README.md                   # Project documentation
```

---

## 🔒 Security Best Practices

- **Zero-Secret Commits**: `.env` and `server/serviceAccountKey.json` are strictly excluded in `.gitignore`. Never commit credentials to version control.
- **Helmet Security**: Enhanced HTTP headers, XSS filtering, frameguard, and configured Cross-Origin-Opener-Policy for Google OAuth popups.
- **Rate Limiting**: Protected authentication and API endpoints prevent brute-force attacks.
- **Token Verification**: Every privileged endpoint verifies the Firebase JWT `idToken` and inspects role claims prior to executing requests.

---

## 📄 License
Internal proprietary software developed for **Aurora Group**. All rights reserved.
