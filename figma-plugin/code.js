// =============================================================================
// Aurora Group — Master Blueprint Wireframe Generator Plugin for Figma (v3)
// Specification v3: White-led palette (65%), Bilingual EN/AR, 30+ Projects,
// 6 Verified Client Case Studies, Dummy Team Cards, Sharks Office Meetings,
// Unlisted Client Brief (KYC) Multi-Step Form, Admin KYC Manager & Meeting Prep
// =============================================================================

(async () => {
  // 1. Color Palette Tokens (Hex to RGB normalized 0-1)
  const COLORS = {
    // Light (~65%)
    white: { r: 1.000, g: 1.000, b: 1.000 },           // #FFFFFF
    auroraWhite: { r: 0.961, g: 0.965, b: 0.988 },     // #F5F6FC
    mist: { r: 0.922, g: 0.929, b: 0.969 },            // #EBEDF7
    line: { r: 0.039, g: 0.059, b: 0.200, a: 0.10 },

    // Dark (Only Hero, Numbers, Final CTA, Footer)
    deepBlue: { r: 0.039, g: 0.059, b: 0.200 },       // #0A0F33
    midnightNavy: { r: 0.071, g: 0.090, b: 0.180 },   // #12172E
    royalIndigo: { r: 0.227, g: 0.114, b: 0.431 },    // #3A1D6E

    // Accents (~10%)
    vibrantPurple: { r: 0.416, g: 0.000, b: 0.957 },  // #6A00F4 (primary on light)
    cosmicViolet: { r: 0.545, g: 0.361, b: 0.965 },   // #8B5CF6 (tags, hover)
    electricTeal: { r: 0.000, g: 1.000, b: 0.753 },   // #00FFC0 (ONLY on dark)
    neonAqua: { r: 0.000, g: 0.902, b: 0.827 },       // #00E6D3

    // Text
    ink: { r: 0.039, g: 0.059, b: 0.200 },            // #0A0F33
    body: { r: 0.231, g: 0.255, b: 0.376 },           // #3B4160
    muted: { r: 0.353, g: 0.384, b: 0.459 },          // #5A6275
    onDark: { r: 0.961, g: 0.965, b: 0.988 },         // #F5F6FC
    onDarkMuted: { r: 0.722, g: 0.737, b: 0.839 },    // #B8BCD6

    // Functional
    success: { r: 0.118, g: 0.620, b: 0.416 },
    error: { r: 0.820, g: 0.263, b: 0.263 }
  };

  function solidFill(rgb, opacity = 1) {
    return [{ type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity: rgb.a !== undefined ? rgb.a * opacity : opacity }];
  }

  function solidStroke(rgb, opacity = 1) {
    return [{ type: 'SOLID', color: { r: rgb.r, g: rgb.g, b: rgb.b }, opacity: rgb.a !== undefined ? rgb.a * opacity : opacity }];
  }

  // Load fonts
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  } catch (err) {
    console.warn("Could not load Inter, fallback to system font:", err);
  }

  const fontReg = { family: "Inter", style: "Regular" };
  const fontMed = { family: "Inter", style: "Medium" };
  const fontBold = { family: "Inter", style: "Bold" };

  function createDocumentStyles() {
    const styleDefs = [
      { name: "Aurora v3 / White", color: COLORS.white },
      { name: "Aurora v3 / Aurora White (Page Bg)", color: COLORS.auroraWhite },
      { name: "Aurora v3 / Mist (Alternate)", color: COLORS.mist },
      { name: "Aurora v3 / Deep Blue (Dark Bands)", color: COLORS.deepBlue },
      { name: "Aurora v3 / Vibrant Purple (Primary)", color: COLORS.vibrantPurple },
      { name: "Aurora v3 / Electric Teal (Dark Only)", color: COLORS.electricTeal },
      { name: "Aurora v3 / Ink Heading", color: COLORS.ink },
      { name: "Aurora v3 / Body Text", color: COLORS.body },
      { name: "Aurora v3 / Muted Text", color: COLORS.muted }
    ];

    for (const def of styleDefs) {
      try {
        const style = figma.createPaintStyle();
        style.name = def.name;
        style.paints = [{ type: 'SOLID', color: { r: def.color.r, g: def.color.g, b: def.color.b } }];
      } catch (e) {}
    }
  }

  function createFrame(parent, { name, x = 0, y = 0, w = 100, h = 100, fill = null, stroke = null, strokeWidth = 1, cornerRadius = 0, clipsContent = true }) {
    const frame = figma.createFrame();
    frame.name = name;
    frame.x = x;
    frame.y = y;
    frame.resize(w, h);
    frame.clipsContent = clipsContent;
    if (fill) frame.fills = fill;
    else frame.fills = [];
    if (stroke) {
      frame.strokes = stroke;
      frame.strokeWeight = strokeWidth;
    }
    if (cornerRadius) frame.cornerRadius = cornerRadius;
    parent.appendChild(frame);
    return frame;
  }

  function createText(parent, { text, x = 0, y = 0, w = null, fontSize = 14, font = fontReg, color = COLORS.ink, opacity = 1, align = 'LEFT' }) {
    const node = figma.createText();
    node.fontName = font;
    node.characters = text;
    node.fontSize = fontSize;
    node.fills = solidFill(color, opacity);
    node.textAlignHorizontal = align;
    node.x = x;
    node.y = y;
    if (w) {
      node.textAutoResize = 'HEIGHT';
      node.resize(w, node.height);
    }
    parent.appendChild(node);
    return node;
  }

  function createBadge(parent, text, x, y, bg = COLORS.mist, fg = COLORS.vibrantPurple) {
    const badge = createFrame(parent, {
      name: `Badge: ${text}`,
      x, y, w: text.length * 8 + 20, h: 26,
      fill: solidFill(bg),
      stroke: solidStroke(COLORS.line),
      cornerRadius: 9999
    });
    createText(badge, { text, x: 10, y: 5, fontSize: 11, font: fontBold, color: fg });
    return badge;
  }

  function createButton(parent, text, x, y, w, h, bg = COLORS.vibrantPurple, fg = COLORS.white, isOutlined = false) {
    const btn = createFrame(parent, {
      name: `Button: ${text}`,
      x, y, w, h,
      fill: isOutlined ? solidFill(COLORS.white, 0) : solidFill(bg),
      stroke: isOutlined ? solidStroke(COLORS.line) : [],
      cornerRadius: 10
    });
    createText(btn, { text, x: 0, y: (h - 16) / 2, w, fontSize: 13, font: fontBold, color: fg, align: 'CENTER' });
    return btn;
  }

  function createGlobalLightHeader(parent, activeTitle = "Home") {
    const nav = createFrame(parent, {
      name: "Global Light Header (72px)",
      x: 0, y: 0, w: 1440, h: 72,
      fill: solidFill(COLORS.white),
      stroke: solidStroke(COLORS.line),
      strokeWidth: 1
    });

    createText(nav, { text: "⬡ AURORA GROUP", x: 100, y: 26, fontSize: 18, font: fontBold, color: COLORS.ink });
    createText(nav, { text: "UR LIGHT", x: 280, y: 29, fontSize: 11, font: fontBold, color: COLORS.vibrantPurple });

    const links = ["Home", "About", "Services", "Projects", "Team", "Contact"];
    let lx = 500;
    for (const link of links) {
      const isActive = link.toLowerCase() === activeTitle.toLowerCase();
      createText(nav, {
        text: link,
        x: lx, y: 28,
        fontSize: 14,
        font: isActive ? fontBold : fontMed,
        color: isActive ? COLORS.ink : COLORS.body
      });
      if (isActive) {
        const line = figma.createRectangle();
        line.resize(link.length * 9, 2);
        line.x = lx;
        line.y = 52;
        line.fills = solidFill(COLORS.vibrantPurple);
        nav.appendChild(line);
      }
      lx += 86;
    }

    // Bilingual Toggle & CTA
    createBadge(nav, "عربي", 1120, 23, COLORS.auroraWhite, COLORS.ink);
    createButton(nav, "Talk to us", 1210, 18, 130, 38, COLORS.vibrantPurple, COLORS.white);
    return nav;
  }

  function createGlobalDarkFooter(parent, y) {
    const footer = createFrame(parent, {
      name: "Global Dark Footer (Deep Blue)",
      x: 0, y, w: 1440, h: 360,
      fill: solidFill(COLORS.deepBlue),
      stroke: solidStroke(COLORS.line),
      strokeWidth: 1
    });

    // Col 1
    createText(footer, { text: "AURORA GROUP", x: 100, y: 50, fontSize: 18, font: fontBold, color: COLORS.onDark });
    createText(footer, { text: "UR LIGHT — Integrated Marketing & Media Production", x: 100, y: 80, w: 260, fontSize: 13, color: COLORS.onDarkMuted });
    createBadge(footer, "📥 Download company profile (PDF)", 100, 140, COLORS.midnightNavy, COLORS.electricTeal);

    // Col 2
    createText(footer, { text: "SERVICES", x: 440, y: 50, fontSize: 13, font: fontBold, color: COLORS.onDark });
    const sItems = ["Social media", "Paid ads", "Branding", "Video & photo", "Web design"];
    sItems.forEach((it, i) => createText(footer, { text: it, x: 440, y: 80 + (i * 24), fontSize: 13, color: COLORS.onDarkMuted }));

    // Col 3
    createText(footer, { text: "SELECTED WORK", x: 740, y: 50, fontSize: 13, font: fontBold, color: COLORS.onDark });
    const cItems = ["Omar Bakoush", "Mohamed Raslan", "Taj Aleatur", "Dr. Mohamed Anwar Oref", "Dar El Tabeeb", "X Fighter Academy"];
    cItems.forEach((it, i) => createText(footer, { text: it, x: 740, y: 80 + (i * 24), fontSize: 13, color: COLORS.onDarkMuted }));

    // Col 4
    createText(footer, { text: "CONTACT & OFFICES", x: 1040, y: 50, fontSize: 13, font: fontBold, color: COLORS.onDark });
    createText(footer, { text: "+20 15 59192858", x: 1040, y: 80, fontSize: 13, color: COLORS.onDark });
    createText(footer, { text: "contact.aurora.egy@gmail.com", x: 1040, y: 104, fontSize: 13, color: COLORS.onDarkMuted });
    createText(footer, { text: "Based in Egypt · Meetings: Sharks office space", x: 1040, y: 130, w: 280, fontSize: 13, color: COLORS.electricTeal });

    // Bottom
    const div = createFrame(footer, { name: "Div", x: 100, y: 280, w: 1240, h: 1, fill: solidFill(COLORS.onDarkMuted, 0.2) });
    createText(footer, { text: "© 2026 Aurora Group. All Rights Reserved. UR LIGHT.", x: 100, y: 305, fontSize: 12, color: COLORS.onDarkMuted });
    createText(footer, { text: "Privacy · Terms · [ EN | عربي ] · Employee login ↗", x: 960, y: 305, fontSize: 12, color: COLORS.onDarkMuted });
  }

  // ===========================================================================
  // SCREEN 01: HOME PAGE v3
  // ===========================================================================
  function buildScreen01Home(parent, startX, startY) {
    const artboard = createFrame(parent, {
      name: "Screen 01: Home Page (/)",
      x: startX, y: startY, w: 1440, h: 3100,
      fill: solidFill(COLORS.auroraWhite)
    });

    createGlobalLightHeader(artboard, "Home");

    // 01. Hero Section (DARK, ~80vh)
    const hero = createFrame(artboard, {
      name: "01. Hero Section (Dark Band)",
      x: 0, y: 72, w: 1440, h: 560,
      fill: solidFill(COLORS.deepBlue)
    });
    createBadge(hero, "Aurora Group · UR LIGHT", 100, 70, COLORS.midnightNavy, COLORS.electricTeal);
    createText(hero, { text: "We plan, shoot and run the marketing\nfor brands in Egypt.", x: 100, y: 120, w: 700, fontSize: 44, font: fontBold, color: COLORS.onDark });
    createText(hero, { text: "One team for strategy, content, video and ads. 30+ projects across fitness,\nmedical, perfume and corporate brands.", x: 100, y: 250, w: 680, fontSize: 17, color: COLORS.onDarkMuted });
    createButton(hero, "Talk to us", 100, 340, 160, 48, COLORS.electricTeal, COLORS.deepBlue);
    createButton(hero, "See our work", 280, 340, 160, 48, COLORS.deepBlue, COLORS.onDark, true);

    // Hero Still
    const still = createFrame(hero, { name: "Video Still", x: 860, y: 80, w: 480, h: 380, fill: solidFill(COLORS.midnightNavy), cornerRadius: 20 });
    createText(still, { text: "▶ 4K Commercial Reel Still", x: 140, y: 170, fontSize: 15, font: fontBold, color: COLORS.electricTeal });
    createBadge(still, "Mohamed Raslan (Taj & Supra)", 20, 330, COLORS.deepBlue, COLORS.onDark);

    // 02. Client Logos (Light, White)
    const logos = createFrame(artboard, { name: "02. Client Logos Strip", x: 0, y: 632, w: 1440, h: 90, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line) });
    const brands = ["TAJ PERFUMES", "SÓ•PRA", "X9 FIGHTER", "CENTRO MALL", "EL SHEKH", "DR. ELBARDANY", "SPARTA", "FRIENDS CLUB"];
    brands.forEach((b, i) => createText(logos, { text: b, x: 100 + (i * 155), y: 38, fontSize: 12, font: fontBold, color: COLORS.muted }));

    // 03. What We Do (Light, Aurora White)
    const whatY = 770;
    createText(artboard, { text: "INTEGRATED CAPABILITIES", x: 100, y: whatY, fontSize: 12, font: fontBold, color: COLORS.vibrantPurple });
    createText(artboard, { text: "What we do under one roof", x: 100, y: whatY + 24, fontSize: 28, font: fontBold });

    const mkt = createFrame(artboard, { name: "Marketing Card", x: 100, y: whatY + 70, w: 600, h: 280, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line), cornerRadius: 14 });
    createText(mkt, { text: "Marketing & Growth", x: 32, y: 32, fontSize: 20, font: fontBold });
    const mList = ["• Social media management & organic virality", "• Performance paid media (Meta, TikTok, Google PPC)", "• Brand strategy, naming & verbal identity", "• High-conversion website design & dev"];
    mList.forEach((it, i) => createText(mkt, { text: it, x: 32, y: 75 + (i * 30), fontSize: 14, color: COLORS.body }));
    createButton(mkt, "View Marketing Specs →", 32, 210, 200, 38, COLORS.white, COLORS.ink, true);

    const prod = createFrame(artboard, { name: "Production Card", x: 740, y: whatY + 70, w: 600, h: 280, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line), cornerRadius: 14 });
    createText(prod, { text: "Media Production", x: 32, y: 32, fontSize: 20, font: fontBold });
    const pList = ["• 4K Commercials & multi-camera directing", "• Studio product lighting & cinematography", "• DaVinci color grading & multi-mic audio", "• Acoustic podcast suite production"];
    pList.forEach((it, i) => createText(prod, { text: it, x: 32, y: 75 + (i * 30), fontSize: 14, color: COLORS.body }));
    createButton(prod, "View Production Reel →", 32, 210, 200, 38, COLORS.vibrantPurple, COLORS.white);

    // 04. Selected Work Bento
    const bentoY = 1180;
    createText(artboard, { text: "CASE STUDIES", x: 100, y: bentoY, fontSize: 12, font: fontBold, color: COLORS.vibrantPurple });
    createText(artboard, { text: "Selected work and verified results", x: 100, y: bentoY + 24, fontSize: 28, font: fontBold });

    const bA = createFrame(artboard, { name: "Featured Bento: Mohamed Raslan", x: 100, y: bentoY + 70, w: 720, h: 320, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line), cornerRadius: 14 });
    createBadge(bA, "LUXURY & PERFUMES", 28, 28, COLORS.mist, COLORS.vibrantPurple);
    createText(bA, { text: "Mohamed Raslan — Taj & Supra Fragrances", x: 28, y: 70, fontSize: 22, font: fontBold });
    createText(bA, { text: "Cinematic commercial launch driving over 1,000,000+ views and 10,000+ qualified luxury followers.", x: 28, y: 105, w: 660, fontSize: 14, color: COLORS.body });
    createBadge(bA, "1M+ Reach", 28, 160, COLORS.mist, COLORS.ink);
    createBadge(bA, "+10k Followers", 130, 160, COLORS.mist, COLORS.ink);
    createBadge(bA, "100+ Orders", 260, 160, COLORS.mist, COLORS.ink);
    createButton(bA, "▶ Watch Reel (0:45)", 28, 230, 180, 42, COLORS.vibrantPurple, COLORS.white);

    // 4 small cases
    const miniCases = [
      { t: "Omar Bakoush", d: "Fitness personal brand", m: "100k+ Reach · 2k+ Clients" },
      { t: "Dr. Mohamed Anwar Oref", d: "Medical authority content", m: "300k+ Views · 50+ Clients" },
      { t: "Dar El Tabeeb (M. Bakoush)", d: "Herbal wellness series", m: "500k+ Reach · 50+ Clients" },
      { t: "X Fighter Academy", d: "Combat sports facility tour", m: "200k+ Reach · 100+ Clients" }
    ];
    miniCases.forEach((mc, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const card = createFrame(artboard, { name: mc.t, x: 840 + (col * 260), y: bentoY + 70 + (row * 165), w: 240, h: 145, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line), cornerRadius: 14 });
      createText(card, { text: mc.t, x: 16, y: 20, w: 200, fontSize: 14, font: fontBold });
      createText(card, { text: mc.d, x: 16, y: 60, w: 200, fontSize: 12, color: COLORS.muted });
      createText(card, { text: mc.m, x: 16, y: 105, w: 200, fontSize: 11, font: fontBold, color: COLORS.vibrantPurple });
    });

    // 05. Numbers Band (DARK)
    const numY = 1600;
    const numBand = createFrame(artboard, { name: "05. Numbers Band (Dark)", x: 0, y: numY, w: 1440, h: 140, fill: solidFill(COLORS.deepBlue) });
    const stats = [
      { n: "30+", l: "Projects Completed" },
      { n: "1000+", l: "Videos Produced" },
      { n: "200+", l: "Brand Designs" },
      { n: "5M+", l: "Audience Reach" }
    ];
    stats.forEach((st, i) => {
      createText(numBand, { text: st.n, x: 100 + (i * 320), y: 35, fontSize: 44, font: fontBold, color: COLORS.electricTeal });
      createText(numBand, { text: st.l, x: 100 + (i * 320), y: 90, fontSize: 14, color: COLORS.onDarkMuted });
    });

    // 06. How We Work (LIGHT, Mist)
    const procY = 1790;
    const proc = createFrame(artboard, { name: "06. Process Line (Mist)", x: 0, y: procY, w: 1440, h: 200, fill: solidFill(COLORS.mist) });
    createText(proc, { text: "OUR 6-STEP METHODOLOGY", x: 100, y: 35, fontSize: 12, font: fontBold, color: COLORS.vibrantPurple });
    const steps = ["1. Research", "2. Strategy", "3. Content", "4. Production", "5. Launch", "6. Reporting"];
    steps.forEach((st, i) => {
      const box = createFrame(proc, { name: st, x: 100 + (i * 210), y: 70, w: 190, h: 80, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line), cornerRadius: 10 });
      createText(box, { text: st, x: 16, y: 30, fontSize: 14, font: fontBold });
    });

    // 07. What Happens Next (Light, White)
    const nextY = 2040;
    createText(artboard, { text: "WHAT HAPPENS NEXT", x: 100, y: nextY, fontSize: 12, font: fontBold, color: COLORS.vibrantPurple });
    createText(artboard, { text: "Clear steps when you contact us", x: 100, y: nextY + 24, fontSize: 24, font: fontBold });
    const nextCards = [
      { s: "1", t: "We review your details", d: "Our team audits your industry competitors before the call." },
      { s: "2", t: "We call you within 1 day", d: "A direct discussion to align on expectations and timeline." },
      { s: "3", t: "We meet at Sharks office", d: "Meeting in person at Sharks office space (or online Zoom)." }
    ];
    nextCards.forEach((nc, i) => {
      const card = createFrame(artboard, { name: nc.t, x: 100 + (i * 426), y: nextY + 70, w: 388, h: 140, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line), cornerRadius: 14 });
      createBadge(card, nc.s, 24, 20, COLORS.vibrantPurple, COLORS.white);
      createText(card, { text: nc.t, x: 24, y: 60, fontSize: 16, font: fontBold });
      createText(card, { text: nc.d, x: 24, y: 88, w: 340, fontSize: 13, color: COLORS.muted });
    });

    // 09. Final CTA (DARK)
    const ctaY = 2270;
    const cta = createFrame(artboard, { name: "09. Final CTA (Dark)", x: 0, y: ctaY, w: 1440, h: 220, fill: solidFill(COLORS.deepBlue) });
    createText(cta, { text: "Got a brand that needs a push? Tell us about it.", x: 100, y: 70, w: 800, fontSize: 32, font: fontBold, color: COLORS.onDark });
    createButton(cta, "Talk to us", 100, 130, 160, 48, COLORS.electricTeal, COLORS.deepBlue);

    // 10. Footer (DARK)
    createGlobalDarkFooter(artboard, 2490);
    return artboard;
  }

  // SCREEN 07: Client Brief (KYC) Multi-Step
  function buildScreen07ClientBrief(parent, startX, startY) {
    const artboard = createFrame(parent, {
      name: "Screen 07: Unlisted Client Brief KYC (/brief)",
      x: startX, y: startY, w: 1440, h: 1400,
      fill: solidFill(COLORS.auroraWhite)
    });

    createGlobalLightHeader(artboard, "Contact");

    const card = createFrame(artboard, {
      name: "Brief Container (860px)",
      x: 290, y: 120, w: 860, h: 1060,
      fill: solidFill(COLORS.white),
      stroke: solidStroke(COLORS.line),
      cornerRadius: 16
    });

    createBadge(card, "CONFIDENTIAL CLIENT BRIEF (KYC)", 48, 48, COLORS.mist, COLORS.vibrantPurple);
    createText(card, { text: "Tell us about your brand", x: 48, y: 90, fontSize: 28, font: fontBold });
    createText(card, { text: "This takes about 10 minutes. It helps us make the meeting about your business, not about us.", x: 48, y: 130, w: 760, fontSize: 14, color: COLORS.muted });

    // Progress Bar
    const pBg = createFrame(card, { name: "Progress Track", x: 48, y: 175, w: 764, h: 6, fill: solidFill(COLORS.mist), cornerRadius: 9999 });
    const pFill = createFrame(pBg, { name: "Progress Fill", x: 0, y: 0, w: 250, h: 6, fill: solidFill(COLORS.vibrantPurple), cornerRadius: 9999 });
    createText(card, { text: "Step 2 of 6: Your Business Model (33%)", x: 48, y: 195, fontSize: 12, font: fontBold, color: COLORS.vibrantPurple });

    // Form inputs mockup
    const fields = [
      { l: "What do you sell or offer exactly?", v: "Luxury perfume collections, bespoke essential oil extracts..." },
      { l: "How long has the business existed?", v: "4 years operating in Cairo & Alexandria" },
      { l: "Who are your primary target customers?", v: "Men and women aged 25-45 looking for luxury fragrances" },
      { l: "What makes your brand different from competitors?", v: "French imported oils with long-lasting Egyptian formulation" },
      { l: "Meeting location selection:", v: "📍 In-Person: Sharks Office Space (or Online Zoom)" }
    ];

    fields.forEach((f, idx) => {
      const fy = 240 + (idx * 110);
      createText(card, { text: f.l, x: 48, y: fy, fontSize: 13, font: fontBold });
      const box = createFrame(card, { name: f.l, x: 48, y: fy + 24, w: 764, h: 48, fill: solidFill(COLORS.auroraWhite), stroke: solidStroke(COLORS.line), cornerRadius: 10 });
      createText(box, { text: f.v, x: 16, y: 16, fontSize: 13, color: COLORS.ink });
    });

    createButton(card, "← Previous Step", 48, 850, 160, 44, COLORS.white, COLORS.ink, true);
    createButton(card, "Next Step →", 652, 850, 160, 44, COLORS.vibrantPurple, COLORS.white);

    createGlobalDarkFooter(artboard, 1220);
    return artboard;
  }

  // SCREEN 10: IT Admin Suite & KYC Briefs Manager
  function buildScreen10Admin(parent, startX, startY) {
    const artboard = createFrame(parent, {
      name: "Screen 10: IT Admin Suite (/admin)",
      x: startX, y: startY, w: 1440, h: 1200,
      fill: solidFill(COLORS.auroraWhite)
    });

    // Top Bar
    const top = createFrame(artboard, { name: "Top Bar", x: 0, y: 0, w: 1440, h: 64, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line) });
    createText(top, { text: "⬡ AURORA SUPER ADMIN CONTROL SUITE", x: 32, y: 22, fontSize: 16, font: fontBold, color: COLORS.ink });
    createText(top, { text: "Admin: Ziad Somida", x: 1280, y: 24, fontSize: 13, color: COLORS.muted });

    // Sidebar
    const sb = createFrame(artboard, { name: "Sidebar", x: 0, y: 64, w: 240, h: 1136, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line) });
    const navItems = ["Users & Access", "Client Briefs (KYC)", "Missing Translations", "Sharks Site Settings"];
    navItems.forEach((it, i) => {
      const isAct = i === 1;
      const row = createFrame(sb, { name: it, x: 12, y: 24 + (i * 48), w: 216, h: 40, fill: isAct ? solidFill(COLORS.auroraWhite) : [], cornerRadius: 8 });
      createText(row, { text: it, x: 16, y: 12, fontSize: 13, font: isAct ? fontBold : fontMed, color: isAct ? COLORS.vibrantPurple : COLORS.body });
    });

    // Main: KYC Briefs Table
    const wsX = 270;
    createText(artboard, { text: "CLIENT BRIEFS (KYC) MANAGER", x: wsX, y: 95, fontSize: 22, font: fontBold });
    createText(artboard, { text: "Unlisted questionnaires submitted before strategy meetings at Sharks office.", x: wsX, y: 125, fontSize: 13, color: COLORS.muted });

    createButton(artboard, "+ Generate Client Link (WhatsApp)", 1050, 95, 290, 42, COLORS.vibrantPurple, COLORS.white);

    const tbl = createFrame(artboard, { name: "Briefs Table", x: wsX, y: 170, w: 1070, h: 420, fill: solidFill(COLORS.white), stroke: solidStroke(COLORS.line), cornerRadius: 14 });

    // Header
    const th = createFrame(tbl, { name: "Th", x: 0, y: 0, w: 1070, h: 46, fill: solidFill(COLORS.auroraWhite) });
    createText(th, { text: "CLIENT / BRAND", x: 24, y: 16, fontSize: 12, font: fontBold, color: COLORS.muted });
    createText(th, { text: "PHONE / WA", x: 320, y: 16, fontSize: 12, font: fontBold, color: COLORS.muted });
    createText(th, { text: "BUDGET (EGP)", x: 520, y: 16, fontSize: 12, font: fontBold, color: COLORS.muted });
    createText(th, { text: "STATUS", x: 700, y: 16, fontSize: 12, font: fontBold, color: COLORS.muted });
    createText(th, { text: "ACTION", x: 880, y: 16, fontSize: 12, font: fontBold, color: COLORS.muted });

    const rows = [
      { c: "Mohamed Raslan (Taj & Supra)", p: "+20 15 59192858", b: "50k – 100k EGP", s: "Submitted" },
      { c: "Dr. Mohamed Anwar Oref", p: "+20 10 11223344", b: "100k – 200k EGP", s: "In Progress" },
      { c: "Omar Bakoush (Fitness)", p: "+20 12 99887766", b: "25k – 50k EGP", s: "Meeting Booked" }
    ];

    rows.forEach((r, idx) => {
      const row = createFrame(tbl, { name: r.c, x: 0, y: 46 + (idx * 68), w: 1070, h: 68, stroke: solidStroke(COLORS.line) });
      createText(row, { text: r.c, x: 24, y: 26, fontSize: 14, font: fontBold });
      createText(row, { text: r.p, x: 320, y: 26, fontSize: 13, color: COLORS.body });
      createText(row, { text: r.b, x: 520, y: 26, fontSize: 13, color: COLORS.body });
      createBadge(row, r.s, 700, 20, COLORS.mist, COLORS.vibrantPurple);
      createButton(row, "Open Prep View", 880, 16, 140, 34, COLORS.white, COLORS.ink, true);
    });

    return artboard;
  }

  // ===========================================================================
  // EXECUTION
  // ===========================================================================
  figma.notify("🚀 Building Aurora Group v3 Blueprint Wireframes...");
  createDocumentStyles();

  figma.root.children[0].name = "🖥️ Public & Hidden Screens (v3)";
  const page1 = figma.root.children[0];
  figma.currentPage = page1;

  buildScreen01Home(page1, 0, 0);
  buildScreen07ClientBrief(page1, 1600, 0);
  buildScreen10Admin(page1, 3200, 0);

  figma.viewport.scrollAndZoomIntoView(page1.children);
  figma.notify("✨ Aurora Group v3 Wireframe System Generated Successfully!");
  figma.closePlugin();
})();
