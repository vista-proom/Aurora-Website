# Aurora Group — Software Requirements Specification (SRS)
**Version:** 1.0  
**Date:** October 15, 2026  
**Prepared for:** Anti-Gravity (Development Team)  
**Client:** Aurora Group / Ziad Bahgat

---

## 1. Project Overview

Aurora Group is a creative and marketing agency based in Egypt, with client meetings held at Sharks Office Space, Abdelsalam El Shazly St, above Next Bank. This SRS covers the Aurora corporate website: a bilingual (English/Arabic RTL) multi-page site comprising a public marketing site, an employee portal, a manager panel, and an IT super admin panel, plus a hidden client-brief intake page.

The site will be built and tested locally first. Domain and email hosting will be configured after the local build, using a free domain and SSL certificate obtained through the GitHub Student Developer Pack.

**Purpose of this document.** This SRS defines the functional and non-functional requirements for Anti-Gravity to build the Aurora website, admin systems, and supporting integrations.

**Out of scope for this phase:** company profile PDF, live-streaming, client portal login/dashboard, traffic-spike/CDN scaling, and any user role beyond Employee / Manager / IT Super Admin.

---

## 2. Design and Brand Requirements

### 2.1 Color System

Light-led palette — not blue-heavy. Page background Aurora White (#F5F6FC), white cards, soft Mist (#EBEDF7) for alternate sections. Dark sections limited to four places only: hero, numbers band, final call-to-action, and footer — in both light and dark modes, using a deeper shade in dark mode. Purple is the primary action color on light backgrounds; teal is reserved for dark backgrounds (teal has almost no contrast on white). No glass, blur, or glow effects — flat cards, thin borders, soft shadows. Rounded buttons, not pill-shaped.

### 2.2 Light/Dark Mode

Full light/dark toggle, built on semantic color tokens (e.g. `surface-page`, `text-primary`, `accent-action`) rather than hardcoded hex values, so both themes stay consistent.

| Surface | Default | Options |
|---|---|---|
| Public site | Light | Light / Dark (no System) |
| Employee portal | System | Light / Dark / System |
| Manager panel | System | Light / Dark / System |
| IT Super Admin panel | System | Light / Dark / System |
| Client brief page | Light | Light / Dark (no System) |
| Print / email views | Light (always) | — |

- Theme choice remembered in browser (public site) or saved per account (portal/admin).
- No flash of unstyled content on load.
- Theme switch is a short fade animation, disabled under reduced-motion settings.
- The footer stays dark in both light and dark modes for brand continuity.

### 2.3 Tone and Authorship

All copy, UI text, button labels, notifications, and admin panel text must read as written by a human corporate copywriter — plain, direct, professional. No emojis anywhere in the product or source documents. No AI-sounding phrases or marketing fluff (avoid "leading", "world-class", unverifiable superlatives). No stock photography, floating 3D objects, or abstract animated hero loops — use real team/studio photography and real project footage only.

### 2.4 Logo

Current wordmark is black on white. A **white-wordmark version is required from design before dark mode can ship** — this is a hard dependency.

### 2.5 Client Brand Colors

Project and case-study pages should draw color variety from the actual client work shown (e.g. red, gold, green palettes from different client projects), rather than forcing every page into Aurora's purple/teal system.

---

## 3. Content and Bilingual Requirements

### 3.1 Languages

Full English site with an Arabic (RTL) toggle. English routes (e.g. `/services`) and Arabic routes (e.g. `/ar/services`) keep the visitor on the same logical page when switching. Layout, arrows, and drawers mirror in Arabic; logos, play buttons, photos, and phone numbers do not flip. Arabic typography uses a separate Arabic font, larger text size, and looser line spacing than the Latin version.

### 3.2 Translation

Team member bios, titles, and project/case-study descriptions are **auto-translated from English to Arabic** — staff enter English only, the system generates the Arabic version. A native speaker must review all auto-translated strings before the site launches.

### 3.3 Digits

Western digits are used in both English and Arabic content (e.g. "30+", not Arabic-Indic numerals).

### 3.4 Verified Site-Wide Facts

- Total audience reach: **5M+**
- Projects completed: **30+** (projects and clients are counted separately — one client can have multiple brands/projects)
- Location: Egypt; client meetings at Sharks Office Space, Abdelsalam El Shazly St, above Next Bank
- City name and Google Maps link: **[TBD — to be supplied by Ziad before launch]**

### 3.5 Content Removed / Excluded

Emoji, unverified equipment or technology claims, floating 3D graphics, and unverified external links (prior Behance/LinkedIn references removed). Testimonials section exists in the design but stays hidden until real client quotes are supplied — no placeholder or fake quotes.

### 3.6 Team Data

Team member names, titles, photos, and contact details are placeholder/dummy data for now (e.g. "Team Member 01"), clearly editable. The Team page is hidden from navigation until real data is supplied.

---

## 4. Public Site Structure and Pages

**Site type:** Multi-page site (not a single-page app). English and Arabic RTL versions of every public route.

### 4.1 Core Pages

| Page | Notes |
|---|---|
| Home | No autoplaying video. Hero may use a short real-footage loop but is not required to. Sections: hero, brands, services overview, selected work, metrics band, 6-step process, what-happens-next, testimonials (hidden until real quotes supplied), CTA. |
| About | Agency story, values, and positioning. |
| Projects | Filterable grid — see 4.2. |
| Project / Case Study | Fixed template — see 4.3. |
| Team | Hidden from navigation until real data supplied. Each team member page shows only that member's credited projects. |
| Contact | Public contact form + address + map link. Spam-protected — see Section 9. |
| Client Brief | Hidden page — see Section 6. Not linked from any public page. |

### 4.2 Projects Page

Visitors can filter the project grid by **industry category**. Filtering by service or team member is a future enhancement, not required for this build.

### 4.3 Project / Case Study Page Template

Every project follows one fixed structured template — not freeform per employee — to keep all pages visually consistent and prevent messy, inconsistent project pages. The template fields are:

| Field | Set by | Visible on public site? |
|---|---|---|
| Client / brand name | Manager / Admin | Yes |
| Industry category | Manager / Admin | Yes (for filtering) |
| Project year | Manager / Admin | Yes |
| Team members credited | Employee (linked profiles) | Yes |
| Deliverables list | Employee | Yes |
| Challenge | Employee | Yes |
| Solution | Employee | Yes |
| Result | Employee | Yes |
| Media gallery (2–6 pieces) | Employee (video/photo/design stills) | Yes |
| Testimonial quote | Manager / Admin | Optional — hidden if not supplied |

**No budget field appears anywhere on a public project page.**

### 4.4 Contact Page

Standard public contact form. Fields defined in Section 6.1. Spam protection required (rate-limiting and/or CAPTCHA).

---

## 5. User Roles and Permissions

**Three roles only.** 10–15 total users expected at launch; no growth beyond that range is planned.

**Authentication:** Firebase Authentication (email/password). Password reset and email verification handled entirely by Firebase. Credentials (usernames, hashed passwords, sessions) are stored within Firebase's secure system only — no other service handles authentication data.

| Role | Permissions |
|---|---|
| **Employee** | Edit own profile (name, title, contact email, photo, bio/description). Upload new projects credited to themselves. Attach media by pasting a YouTube link, or by reusing a previous upload (own or a teammate's). Cannot publish directly — uploads go to a Manager for approval. No access to analytics, client briefs, or draft/dead/ended projects. |
| **Manager** | Everything an Employee can do, plus: approve or reject employee-uploaded projects (approved projects go live immediately — no further approval step); edit any live project (all fields) with every edit logged to the audit trail; view all client briefs with full submission data; generate and extend client brief links; create draft projects from briefs; mark briefs/projects as "in progress", "dead", or "ended"; view Google Analytics 4 dashboard; edit global site settings (office email, meeting location, contact details). Notified by email when an employee uploads a project for approval, and when a client submits a brief. |
| **IT Super Admin** | Everything a Manager can do, plus additional system-level capabilities. **[TBD — future expansion, not required at launch]** |

### 5.1 Data Visibility Rules

- Employees never see analytics data, client brief submissions, or draft/dead/ended projects.
- Draft, dead, and ended projects are visible only inside the admin panel, to Managers and IT Super Admins — never on the public website.
- Analytics (GA4) is visible only to Managers and IT Super Admins — hidden from Employees.

---

## 6. Forms and Client Brief Workflow

### 6.1 Shared Form Fields

Both the public contact form and the client brief form use the same core field set:

| Field | Validation |
|---|---|
| Full name | Required |
| Business / brand name | Required |
| Phone / WhatsApp | Required; valid phone format; international numbers accepted (not restricted to Egyptian +20) |
| Email address | Required; valid email format |
| Services | Required |
| Industry | Required; free text — no fixed dropdown for clients |
| Estimated budget | Required; EGP dropdown starting at "Less than 3,000 EGP" — exact bands to be finalized with dev team |
| Message / project description | Required |

### 6.2 Public Contact Form (`/contact`)

Standard form on the public website. Submissions flow to the admin panel (Client Inquiries section) and to the Google Sheet ("Aurora Client Briefs" workbook, "Contact Inquiries" tab).

### 6.3 Client Brief Page (`/brief/<code>`)

A standalone page outside the main site — no navigation link, no footer link, excluded from search engines and the sitemap. Generated only by a Manager or IT Super Admin, customized per client (client name included in the link generation process). Clients cannot discover or guess the link.

The brief form uses the same core fields as the contact form, plus additional brief-specific fields from the v5 specification (timeline/urgency, goals and objectives, current online presence, competitor and taste references, meeting planning preferences).

**Link expiry:**
> ⚠️ **[CONFIRM WITH ZIAD: 10-day or 30-day default expiry?]**
> A Manager can extend an individual link's expiry; the extension cannot push the expiry beyond 30 days from the date of that edit (not from original creation). Clients cannot resubmit once a brief is submitted — a fresh link is required.

**Data flow:**
1. Client submits brief → saved to the Google Sheet ("Aurora Client Briefs" workbook, "Briefs" tab) and to the admin panel simultaneously.
2. Manager receives an email notification to their login address.
3. Manager views the full submission (all fields) inside the admin panel.
4. Follow-up reminders and further client-facing emails are handled entirely through the Google Sheet workflow — the website sends no further emails after the initial manager notification.

### 6.4 Draft Project Creation

A Manager can create a draft project from a submitted brief. Draft projects:

- Are visible only in the admin panel — never on the public site.
- Carry one of three statuses:

| Status | Meaning |
|---|---|
| In progress | Active negotiation or onboarding underway |
| Dead | No further outreach planned for this client |
| Ended | Negotiation paused; re-engagement possible in future |

- All brief and draft-project data is retained indefinitely — nothing is auto-deleted.

---

## 7. Video and Media Handling

### 7.1 Video Hosting

All video hosted on **YouTube**, set to **Unlisted** — not Private, not Public — so it can be embedded without appearing on the public Aurora channel or in YouTube search.

### 7.2 Embed Configuration

Every video embed uses the following parameters to suppress suggested videos and YouTube branding:

```
https://www.youtube.com/embed/VIDEO_ID?rel=0&modestbranding=1
```

Wrapped in a responsive iframe so the player scales on all screen sizes:

```html
<div style="position:relative; width:100%; padding-bottom:56.25%; height:0;">
  <iframe
    src="https://www.youtube.com/embed/VIDEO_ID?rel=0&modestbranding=1"
    style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;"
    allowfullscreen>
  </iframe>
</div>
```

### 7.3 Player Controls

Standard controls only: play/pause, mute/unmute, fullscreen toggle, timeline scrubbing, and user-adjustable quality. Adaptive bitrate, targeting up to 1080p. **No autoplay anywhere on the site.**

### 7.4 Captions

None required — no English or Arabic captions on videos.

### 7.5 Video Branding

Aurora logo watermark is baked into video content in post-production (not by the embed player), to protect against unauthorized reuse.

### 7.6 Embed Style

Individual embeds only — one video per content slot. No YouTube playlist widget, to prevent videos auto-continuing into unrelated content.

### 7.7 Media per Project

Each project/case study holds **2–6 content pieces**. These can be any mix of video, photos, or design/script stills — not every piece needs to be a video.

### 7.8 Photo and Design Asset Hosting

Project photos and design stills are hosted on **Cloudinary** — not YouTube, not Firebase. See Section 8.

---

## 8. Technical Architecture and Stack

Four services, each handling exactly one concern with no overlap:

| Concern | Service | Free Tier | Notes |
|---|---|---|---|
| **Authentication** (usernames, passwords, sessions, password reset, email verification) | Firebase Authentication | Free | Handles all credential security out of the box. Firebase Storage ruled out (requires paid Blaze plan even at small usage). Firestore ruled out (avoided to stay off Firebase paid tiers entirely). |
| **Structured data** (projects, descriptions, industry tags, approval status, user roles, client briefs, edit history/audit trail) | MongoDB Atlas — M0 free tier | 512 MB, free forever | No credit card required. Comfortably covers 10–15 users and a few dozen project records at text-only scale. Managers and employees interact only through the admin panel UI — never directly with the database or the code repository. |
| **Photos and design stills** | Cloudinary | 25 GB storage, 25 GB bandwidth/month, 25,000 transformations/month | Agency produces high-quality photos (~5–6 MB each, ~4–5 per project). Cloudinary auto-optimizes and resizes from a single upload. Supabase was evaluated and ruled out after a prior integration failure. |
| **Video** | YouTube (Unlisted) | Unlimited | Reliable global CDN, free forever. See Section 7. |

### 8.1 Domain and Hosting

Free domain and SSL certificate via the GitHub Student Developer Pack. Final domain will include "Aurora" in the name — exact domain TBD. Domain and email hosting are configured after the site is built and tested locally.

### 8.2 Analytics

**Google Analytics 4** — free at any traffic level, no visitor cap, no credit card required.

- Tracks: page views, video engagement, and regional data.
- Access: Managers and IT Super Admins only. Employees cannot see analytics.

### 8.3 Notifications

Email-based only for this phase. No in-app notification system required at launch.

| Event | Who receives the email |
|---|---|
| Employee uploads a project for approval | Manager (to login email) |
| Client submits a client brief | Manager (to login email) |
| Manager approves or rejects an employee upload | No email — employee checks the portal |

---

## 9. Non-Functional Requirements

### 9.1 Device and Browser Support

Full support for devices and browsers released within the last 5 years (2021 onward), covering iOS, Android, and desktop. Older devices receive a simpler automatic fallback through standard responsive design — no dedicated testing or extra development effort is required for them.

### 9.2 Mobile Optimization

The site must be fully optimized for phone users. Mobile experience is a priority, not an afterthought. Videos play inline on mobile (not forced full-screen on tap).

### 9.3 Performance at Scale

Handling sudden traffic spikes (e.g. a viral reel) is explicitly out of scope for this phase.

### 9.4 Spam Protection

The public contact form requires rate-limiting and/or CAPTCHA to prevent bot abuse and server overload.

### 9.5 SEO

The public website must be fully optimized for traditional search engines — proper semantic HTML, metadata, structured data markup, and fully crawlable content. The admin panel, employee portal, and the client brief page are explicitly excluded from search indexing (via `robots.txt` and `noindex` meta tags).

### 9.6 Launch Timeline

Not defined in this SRS. The backend will be built and tested locally first. A live launch date will be agreed directly between Ziad and Anti-Gravity.

---

## 10. Data Retention and Audit Logging

### 10.1 Retention Policy

All data is retained indefinitely — no automatic deletion of any kind:

- Draft, in-progress, dead, and ended projects.
- Client brief submissions and their full field data.
- Edit history and audit log entries.

### 10.2 Audit Trail

Every edit made to a live, published project by a Manager or IT Super Admin is logged: what changed, who made the change, and when. No re-approval is required for edits — the log exists for accountability and record-keeping only.

### 10.3 Media Asset Reuse and Dependency Tracking

Employees can reuse previous media uploads (their own or a teammate's) when building a new project. Tracking which projects depend on a shared media asset (to prevent silent breakage when an asset is deleted) is a **future enhancement — not required for the initial build**.

---

## 11. Open Items — Confirm Before Launch

| # | Item | Owner |
|---|---|---|
| 1 | City name and Google Maps link for Sharks Office Space | Ziad |
| 2 | White-wordmark logo version (hard dependency for dark mode) | Design team |
| 3 | Working hours (for Contact page and footer) | Ziad |
| 4 | Real team member names, titles, photos, and contact emails | Ziad |
| 5 | Real client testimonial quotes (3+ needed to unlock the testimonials section) | Ziad |
| 6 | Client count number (separate from the 30+ projects figure) | Ziad |
| 7 | Reply time promise ("within one working day" — confirm?) | Ziad |
| 8 | ⚠️ Client brief link default expiry — 10 days or 30 days? | Ziad |
| 9 | EGP budget dropdown exact bands (above "Less than 3,000") | Ziad / Anti-Gravity |
| 10 | IT Super Admin expanded capabilities (system-level features) | Ziad (future phase) |
| 11 | Final domain name | Ziad (via GitHub Student Pack) |

---

*Document version 1.0 — compiled from project sessions with Ziad Bahgat, October 2026. Ready for Anti-Gravity development handoff.*
