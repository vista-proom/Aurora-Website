# Aurora Group — Figma Wireframe Generator Plugin

This native Figma plugin automatically generates the complete **Aurora Group Master Wireframe & Design System** across 4 organized Figma pages with real artboards, color styles, typography tokens, and UI components.

## How to Run in Figma (Takes 10 Seconds)

### Method 1: In Figma Desktop App
1. Open Figma and create a **New Design File** (or open any existing file).
2. Click the Figma menu in the top left corner (or press `Ctrl + /` / search).
3. Go to: **Plugins** > **Development** > **Import plugin from manifest...**
4. Browse to and select `d:\Aurora\Website\figma-plugin\manifest.json`.
5. Click **Plugins** > **Development** > **Aurora Group — Master Blueprint Wireframe Generator** (or right-click the canvas > Plugins > Development > Run).
6. ⚡ In 1 second, the plugin will create:
   - **Page 1: 🖥️ Public Website Wireframes** (Screens 01 through 06)
   - **Page 2: 🔐 Portal & Admin Suite** (Screens 07 through 09)
   - **Page 3: 🪟 Modals & Drawers** (Drawers 5.1, 5.2, 5.3)
   - **Page 4: 🎨 Design Tokens & UI Kit** (Colors, Typo, Buttons, Badges)
   - Document Color Styles in your Figma sidebar palette.

### Method 2: Via Browser Console in Figma Web (Quick Paste)
1. Open Figma in Chrome / Edge with your file.
2. Open DevTools (`F12` or `Ctrl + Shift + I`).
3. Switch to the **Console** tab.
4. Copy the entire contents of [code.js](file:///d:/Aurora/Website/figma-plugin/code.js) and paste it into the console, then hit **Enter**.

---

### What Gets Created:
- **Screen 01: Home Page (`/`)**: Hero with Aurora badge & gradient, 4-metric strip, services split, 5-case bento grid, partner ticker, CTA banner, and universal footer.
- **Screen 02: Services Hub (`/services`)**: Filter pills, 6 Marketing cards, 6 Media Production cards, 6-step roadmap.
- **Screen 03: Projects Feed (`/projects`)**: Filter tabs, 16:9 split case study cards for Mohamed Raslan (Taj & Supra) and X Fighter Academy.
- **Screen 04: Public Team Directory (`/team`)**: Search & filters, 3-column team cards with portraits, bios, and portfolio links.
- **Screen 05: Individual Portfolio (`/team/:id`)**: Breadcrumbs, profile banner, bio, skill tags, deliverables list.
- **Screen 06: Contact Us (`/contact`)**: 2-column split with direct phone/email/studio touchpoints & inquiry form.
- **Screen 07: Portal Login (`/login`)**: Centered 440px glassmorphism login card.
- **Screen 08: Employee Portal (`/portal`)**: Top bar, 260px sidebar, profile settings form, and uploaded deliverables table.
- **Screen 09: IT Super Admin Panel (`/admin`)**: Top bar, sidebar, user & access management table with roles and action pills.
- **Screen 10: Modals & Drawers**: Slide-in user permissions drawer (460px), Add Deliverable modal (680px), 16:9 Cinema Reel Player (860px).
- **Design Tokens Catalog**: Color palette swatches, typography scale, buttons, badges, and glassmorphic card specimen.
