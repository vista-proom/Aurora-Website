/**
 * AURORA GROUP — PERSISTENCE & DATA STORE ENGINE (v2)
 * Full RBAC, Audit Logging, CRM Status Lifecycle, Services Toggles,
 * Client Brief Actions, and Public Team Profiles.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword, isPasswordHashed, sanitizeNoSql } from '../utils/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// -----------------------------------------------------------------------------
// SEED USERS & ROLES
// -----------------------------------------------------------------------------
const DEFAULT_USERS = [
  {
    id: "usr-superadmin",
    email: "admin@aurora.eg",
    password: "password123",
    name: "Ziad Bahgat",
    role: "super_admin",
    title: "Agency Director & Founder",
    department: "Executive Management",
    slug: "ziad-bahgat",
    photo: "/assets/Image_error.jpg",
    bioEn: "Leading Aurora Group across strategic media production, creative direction, and commercial growth.",
    bioAr: "قيادة مجموعة أورورا عبر الإنتاج الإعلامي الاستراتيجي، والتوجيه الإبداعي، والنمو التجاري.",
    theme: "system",
    lang: "en",
    permissions: {
      canApproveProjects: true,
      canPublishProjects: true,
      canViewBriefs: true,
      canGenerateBriefs: true,
      canViewCRM: true,
      canEditCRMStatus: true,
      canEditSiteSettings: true,
      canManageUsers: true,
      canViewActivityLog: true,
      canViewMonitoring: true,
      canToggleServices: true
    }
  },
  {
    id: "usr-manager",
    email: "manager@aurora.eg",
    password: "password123",
    name: "Ahmed Mostafa",
    role: "manager",
    title: "Operations & Account Director",
    department: "Client Services",
    slug: "ahmed-mostafa",
    photo: "/assets/Image_error.jpg",
    bioEn: "Managing high-impact client campaigns, production logistics, and performance marketing workflows.",
    bioAr: "إدارة حملات العملاء والإنتاج اللوجستي وسير عمل التسويق الرقمي.",
    theme: "light",
    lang: "en",
    permissions: {
      canApproveProjects: true,
      canPublishProjects: true,
      canViewBriefs: true,
      canGenerateBriefs: true,
      canViewCRM: true,
      canEditCRMStatus: true,
      canEditSiteSettings: false,
      canManageUsers: false,
      canViewActivityLog: true,
      canViewMonitoring: true,
      canToggleServices: false
    }
  },
  {
    id: "usr-employee",
    email: "omar@aurora.eg",
    password: "password123",
    name: "Omar Hassan",
    role: "employee",
    title: "Lead Commercial Videographer & Director",
    department: "Media Production",
    slug: "omar-hassan",
    photo: "/assets/Image_error.jpg",
    bioEn: "Specializing in dynamic 4K cinema commercials, luxury lighting and Hollywood color grading for leading brands in Egypt and the Gulf.",
    bioAr: "متخصص في تصوير الإعلانات السينمائية 4K والإضاءة الدرامية وتلوين هوليوود للعلامات التجارية في مصر والخليج.",
    theme: "system",
    lang: "en",
    permissions: {
      canApproveProjects: false,
      canPublishProjects: false,
      canViewBriefs: false,
      canGenerateBriefs: false,
      canViewCRM: false,
      canEditCRMStatus: false,
      canEditSiteSettings: false,
      canManageUsers: false,
      canViewActivityLog: false,
      canViewMonitoring: false,
      canToggleServices: false
    }
  }
];

// -----------------------------------------------------------------------------
// SEED CORE SERVICES (8 Services with Active/Inactive Toggles)
// -----------------------------------------------------------------------------
const DEFAULT_SERVICES = [
  { id: "srv-1", nameEn: "Social Media Management", nameAr: "إدارة منصات التواصل الاجتماعي", descEn: "Managing content, engagement, and brand presence across digital platforms.", descAr: "إدارة المحتوى وجدولة النشر والتفاعل وبناء الحضور الرقمي.", category: "marketing", active: true },
  { id: "srv-2", nameEn: "Paid Advertising", nameAr: "الإعلانات الممولة والحملات", descEn: "Running targeted campaigns to increase reach, leads, and sales.", descAr: "إطلاق حملات موجهة لزيادة الوصول والعملاء المحتملين والمبيعات.", category: "marketing", active: true },
  { id: "srv-3", nameEn: "Graphic Design", nameAr: "التصميم الجرافيكي", descEn: "Designing creative visuals for social media, print, and campaigns.", descAr: "تصميم مواد بصرية إبداعية للسوشيال ميديا والمطبوعات والحملات.", category: "marketing", active: true },
  { id: "srv-4", nameEn: "Motion Graphics", nameAr: "الموشن جرافيكس", descEn: "Designing animated videos and visual content for digital platforms.", descAr: "تصميم فيديوهات متحركة ومحتوى بصري ديناميكي للمنصات الرقمية.", category: "production", active: true },
  { id: "srv-5", nameEn: "Videography", nameAr: "التصوير الفيديوغرافي والسينمائي", descEn: "Creating high-quality videos, commercials, and promotional content.", descAr: "إنتاج فيديوهات سينمائية وإعلانات تجارية ومحتوى ترويجي عالي الجودة.", category: "production", active: true },
  { id: "srv-6", nameEn: "Photography", nameAr: "التصوير الفوتوغرافي الاحترافي", descEn: "Producing professional photos for products, brands, and businesses.", descAr: "جلسات تصوير احترافية للمنتجات والأزياء والشركات.", category: "production", active: true },
  { id: "srv-7", nameEn: "Branding", nameAr: "بناء الهويات التجارية", descEn: "Creating unique brand identities, logos, and visual systems.", descAr: "ابتكار هويات تجارية متفردة وشعارات وأنظمة بصرية متكاملة.", category: "marketing", active: true },
  { id: "srv-8", nameEn: "Website Design", nameAr: "تصميم وتطوير المواقع", descEn: "Building modern websites and landing pages for brands and businesses.", descAr: "تصميم وبناء مواقع وصفحات هبوط حديثة تعكس هوية النشاط وتحقق التحويلات.", category: "marketing", active: true }
];

// -----------------------------------------------------------------------------
// SEED PROJECTS
// -----------------------------------------------------------------------------
const DEFAULT_PROJECTS = [
  {
    id: "proj-1",
    slug: "taj-aleatur-luxury-commercial",
    clientName: "Taj Aleatur (Mohamed Raslan)",
    industryCategory: "Perfumes",
    projectYear: 2025,
    titleEn: "Taj Aleatur Luxury 4K Commercial Reel",
    titleAr: "إعلان تجاري سينمائي 4K لتاج العطور",
    summaryEn: "DaVinci Hollywood grade cinematic commercial & Meta ads scaling targeting GCC & Egypt perfume buyers.",
    summaryAr: "إعلان سينمائي بألوان DaVinci وتوسيع حملات ميتا مستهدفة مشتري العطور بمصر والخليج.",
    challengeEn: "Taj Aleatur needed to launch their premium royal musk line in an oversaturated market without resorting to tacky discount graphics.",
    challengeAr: "احتاجت تاج العطور لإطلاق خط المسك الملكي في سوق مزدحم دون اللجوء لإعلانات الخصومات المبتذلة.",
    solutionEn: "We directed a high-end 4K commercial shot on cinema glass with custom atmospheric lighting, followed by high-intent Meta ad funnels.",
    solutionAr: "أخرجنا إعلاناً سينمائياً بدقة 4K بعدسات سينمائية وإضاءة درامية، مع حملات إعلانية عالية الاستهداف.",
    resultEn: "Generated over 4.2x ROAS within 45 days, reaching 1.2M qualified fragrance shoppers across Cairo and Alexandria.",
    resultAr: "تحقيق عائد إعلاني 4.2x خلال 45 يوماً، مع وصول لأكثر من 1.2 مليون مهتم بالعطور في القاهرة والإسكندرية.",
    deliverables: ["Cinema 4K Commercial", "Color Grading", "Meta Ads Scaling", "Packaging Design Stills"],
    creditedStaff: ["Omar Hassan", "Ziad Bahgat"],
    youtubeId: "",
    isApproved: true,
    isPublished: true,
    status: "published",
    heroImage: "/assets/Image_error.jpg",
    mediaGallery: [
      { type: "photo", url: "/assets/Image_error.jpg", caption: "Bottle composition & lighting" },
      { type: "photo", url: "/assets/Image_error.jpg", caption: "Color grade test DaVinci" }
    ],
    auditLog: [
      { action: "Created & Published", changedBy: "admin@aurora.eg", timestamp: new Date().toISOString(), changesSummary: "Initial project setup" }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: "proj-2",
    slug: "dar-el-tabeeb-medical-branding",
    clientName: "Dar El Tabeeb Medical Center",
    industryCategory: "Medical",
    projectYear: 2025,
    titleEn: "Dar El Tabeeb Specialized Care Branding & Content",
    titleAr: "بناء الهوية ومحتوى الرعاية التخصصية لدار الطبيب",
    summaryEn: "Patient-first educational video production, brand positioning, and social clinic booking funnel.",
    summaryAr: "إنتاج محتوى فيديو توعوي للمرضى، وبناء مكانة المركز، وقمع حجز العيادات عبر المنصات.",
    challengeEn: "Attracting patients for specialized surgeries required trust-building rather than commercial sales pitches.",
    challengeAr: "جذب المرضى للجراحات التخصصية كان يتطلب بناء ثقة حقيقية بدلاً من الأسلوب التجاري الصريح.",
    solutionEn: "Produced doctor interview reels explaining procedures with clean graphics and warm documentary cinematography.",
    solutionAr: "إنتاج لقاءات وثائقية مريحة مع الأطب لشرح العمليات بجرافيك توضيحي راقٍ وتصوير هادئ.",
    resultEn: "Achieved an 85% boost in private consultation requests and generated over 800k organic educational views.",
    resultAr: "زيادة 85% في طلبات الاستشارات الخاصة، وتحقيق أكثر من 800 ألف مشاهدة توعوية.",
    deliverables: ["Brand Identity Guide", "Doctor Interview Reels", "Social Strategy", "Landing Page"],
    creditedStaff: ["Omar Hassan"],
    youtubeId: "",
    isApproved: true,
    isPublished: true,
    status: "published",
    heroImage: "/assets/Image_error.jpg",
    mediaGallery: [
      { type: "photo", url: "/assets/Image_error.jpg", caption: "Clinic atmosphere" }
    ],
    auditLog: [
      { action: "Approved & Published", changedBy: "admin@aurora.eg", timestamp: new Date().toISOString(), changesSummary: "Approved case study" }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: "proj-3",
    slug: "x-fighter-academy-campaign",
    clientName: "X Fighter Academy",
    industryCategory: "Fitness",
    projectYear: 2024,
    titleEn: "X Fighter Academy High-Intensity Ad Campaign",
    titleAr: "حملة إعلانية عالية الحماس لأكاديمية إكس فايتر",
    summaryEn: "High-energy commercial reel, member spotlight stories, and TikTok/Instagram subscriber acquisition.",
    summaryAr: "إعلان تجاري حماسي، وقصص نجاح المشتركين، وجذب أعضاء جدد عبر إنستجرام وتيك توك.",
    challengeEn: "Generating summer academy memberships in a competitive fitness market in Alexandria.",
    challengeAr: "تعبئة اشتراكات الموسم الصيفي للأكاديمية وسط منافسة شرسة في الإسكندرية.",
    solutionEn: "Dynamic slow-motion training footage with hard-hitting sound design and localized lead forms.",
    solutionAr: "لقاءات وتدريبات بالتصوير البطيء مع هندسة صوتية قوية ونماذج تسجيل سهلة وسريعة.",
    resultEn: "350+ new academy registrations in 30 days, completely filling evening training slots.",
    resultAr: "تسجيل أكثر من 350 عضواً جديداً خلال شهر واحد واكتمال الفترات التدريبية المسائية بالكامل.",
    deliverables: ["Reel Campaign", "Lead Generation Funnel", "Social Ads", "Photography"],
    creditedStaff: ["Omar Hassan"],
    youtubeId: "",
    isApproved: true,
    isPublished: true,
    status: "published",
    heroImage: "/assets/Image_error.jpg",
    mediaGallery: [
      { type: "photo", url: "/assets/Image_error.jpg", caption: "Training intensity" }
    ],
    auditLog: [
      { action: "Approved & Published", changedBy: "admin@aurora.eg", timestamp: new Date().toISOString(), changesSummary: "Approved case study" }
    ],
    createdAt: new Date().toISOString()
  }
];

// -----------------------------------------------------------------------------
// SEED BRIEFS
// -----------------------------------------------------------------------------
const DEFAULT_BRIEFS = [
  {
    token: "78x-mohamed-raslan",
    clientName: "Mohamed Raslan",
    brandName: "Taj Aleatur",
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: "pending", // 'pending' | 'submitted' | 'expired' | 'deactivated'
    isSubmitted: false,
    submittedAt: null,
    data: null,
    createdAt: new Date().toISOString()
  }
];

// -----------------------------------------------------------------------------
// SEED INQUIRIES (CRM)
// -----------------------------------------------------------------------------
const DEFAULT_INQUIRIES = [
  {
    id: "inq-1",
    fullName: "Mohamed Ahmed",
    brandName: "Royal Perfumes",
    phone: "+20 15 59192858",
    email: "contact@royalperfumes.com",
    services: ["Commercial Video", "Meta & TikTok Ads"],
    industry: "Perfumes",
    budget: "50,000 – 100,000 EGP",
    message: "We need a complete 4K cinematic commercial for our summer line.",
    status: "Pending", // 'Pending' | 'Contacted' | 'Meeting Scheduled' | 'In Progress' | 'Ended' | 'Dead'
    createdAt: new Date().toISOString()
  }
];

// -----------------------------------------------------------------------------
// SEED SETTINGS
// -----------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  officeVenue: "Sharks Office Space",
  addressStreet: "Abdelsalam El Shazly St, above Next Bank",
  city: "Egypt",
  contactPhone: "+20 15 59192858",
  contactEmail: "contact.aurora.egy@gmail.com",
  instagramMarketing: "@aurora__marketing",
  instagramProduction: "@aurora__media_production",
  googleMapsUrl: "https://maps.google.com",
  workingHours: "Sunday – Thursday: 10:00 AM – 6:00 PM",
  googleSheetsUrl: "https://docs.google.com/spreadsheets/d/your-google-sheet-id/edit",
  metrics: {
    projectsVal: "150+",
    industriesVal: "5+",
    clientsVal: "35+",
    projectsCompleted: "30+",
    audienceReach: "5M+",
    videosProduced: "150+",
    partnerBrands: "18+"
  }
};

class DataStoreV2 {
  constructor() {
    this.projectsFile = path.join(DATA_DIR, 'projects.json');
    this.briefsFile = path.join(DATA_DIR, 'briefs.json');
    this.inquiriesFile = path.join(DATA_DIR, 'inquiries.json');
    this.settingsFile = path.join(DATA_DIR, 'settings.json');
    this.usersFile = path.join(DATA_DIR, 'users.json');
    this.servicesFile = path.join(DATA_DIR, 'services.json');
    this.activityLogFile = path.join(DATA_DIR, 'activity_log.json');
    this.monitoringFile = path.join(DATA_DIR, 'monitoring.json');
    this.updateRequestsFile = path.join(DATA_DIR, 'update_requests.json');
    this.contentFile = path.join(DATA_DIR, 'site_content.json');
    this.industriesFile = path.join(DATA_DIR, 'industries.json');
    this.invoicesFile = path.join(DATA_DIR, 'invoices.json');
    this.marqueeFile = path.join(DATA_DIR, 'marquee.json');

    this.initFiles();
  }

  initFiles() {
    if (!fs.existsSync(this.marqueeFile)) {
      this.write(this.marqueeFile, {
        speedSeconds: 35,
        logos: [
          { id: "ml-1", name: "Dr Mostafa Elbardan", src: "/assets/logos/Dr Mostafa  Elbardan Orthopepedic Surgery  specialist.png" },
          { id: "ml-2", name: "El Shekh Mobile Services", src: "/assets/logos/EL SHEKH MOBILE SERVICES.png" },
          { id: "ml-3", name: "El-Sakka Academy", src: "/assets/logos/El-Sakka Acadimy.png" },
          { id: "ml-4", name: "Fire Academy", src: "/assets/logos/FIRE ACADEMY.png" },
          { id: "ml-5", name: "SES Sustainable Energy Solutions", src: "/assets/logos/SES - SUSTAINABLE ENERGY SOLUTIONS.png" },
          { id: "ml-6", name: "Sharks Co-working Space", src: "/assets/logos/SHARKS CO-WORKING SPACE.png" },
          { id: "ml-7", name: "Sparta Smart Academy", src: "/assets/logos/SPARTA - SMART ACADEMY.png" },
          { id: "ml-8", name: "Só.pra Fragrances", src: "/assets/logos/SÓ.PRA FRAGRANCES.png" },
          { id: "ml-9", name: "TAG", src: "/assets/logos/TAG.png" },
          { id: "ml-10", name: "TAJ", src: "/assets/logos/TAJ.png" },
          { id: "ml-11", name: "X Fighter Club", src: "/assets/logos/XFIGHTER CLUB.png" },
          { id: "ml-12", name: "XPower Nutrition", src: "/assets/logos/XP0WER NUTRITION.png" },
          { id: "ml-13", name: "Centro Mall", src: "/assets/logos/centro mall.png" },
          { id: "ml-14", name: "Friends Club", src: "/assets/logos/friends club.png" },
          { id: "ml-15", name: "عيادات النخبة التجميلية", src: "/assets/logos/عيادات النخبة التجميلية.png" },
          { id: "ml-16", name: "عيادات النخبة التخصصية", src: "/assets/logos/عيادات النخبة التخصصية.png" },
          { id: "ml-17", name: "Dr. Mohamed Anwar Orief Clinic", src: "/assets/logos/Dr Mohamed Anwar Orief Clinic.png" },
          { id: "ml-18", name: "نبت NABT", src: "/assets/logos/نَبْت NABT.png" }
        ]
      });
    }
    if (!fs.existsSync(this.invoicesFile)) {
      this.write(this.invoicesFile, []);
    }
    if (!fs.existsSync(this.industriesFile)) {
      this.write(this.industriesFile, ["Perfumes", "Fitness", "Medical", "Personal Brands", "Corporate"]);
    }
    if (!fs.existsSync(this.usersFile)) {
      this.write(this.usersFile, DEFAULT_USERS);
    }
    if (!fs.existsSync(this.servicesFile)) {
      this.write(this.servicesFile, DEFAULT_SERVICES);
    }
    if (!fs.existsSync(this.projectsFile)) {
      this.write(this.projectsFile, DEFAULT_PROJECTS);
    }
    if (!fs.existsSync(this.briefsFile)) {
      this.write(this.briefsFile, DEFAULT_BRIEFS);
    }
    if (!fs.existsSync(this.inquiriesFile)) {
      this.write(this.inquiriesFile, DEFAULT_INQUIRIES);
    }
    if (!fs.existsSync(this.settingsFile)) {
      this.write(this.settingsFile, DEFAULT_SETTINGS);
    }
    if (!fs.existsSync(this.activityLogFile)) {
      this.write(this.activityLogFile, [
        { id: "log-1", action: "System Initialized", user: "system", timestamp: new Date().toISOString(), details: "Aurora Group platform v2 ready" }
      ]);
    }
    if (!fs.existsSync(this.monitoringFile)) {
      this.write(this.monitoringFile, {
        totalVisits: 1420,
        pageViews: { home: 890, about: 340, services: 420, projects: 580, contact: 210, brief: 64 },
        recentSessions: [
          { ip: "197.38.x.x", page: "/", referrer: "direct", time: new Date().toISOString() },
          { ip: "156.202.x.x", page: "/projects", referrer: "instagram", time: new Date(Date.now() - 3600000).toISOString() }
        ]
      });
    }
    if (!fs.existsSync(this.updateRequestsFile)) {
      this.write(this.updateRequestsFile, []);
    }
  }

  read(file) {
    try {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  logActivity(action, user, details) {
    const list = this.read(this.activityLogFile);
    const item = {
      id: "log-" + Date.now(),
      action,
      user: user || "system",
      timestamp: new Date().toISOString(),
      details: typeof details === 'object' ? JSON.stringify(details) : String(details)
    };
    list.unshift(item);
    if (list.length > 200) list.pop();
    this.write(this.activityLogFile, list);
    return item;
  }

  // ---------------------------------------------------------------------------
  // USERS & RBAC
  // ---------------------------------------------------------------------------
  getUsers() {
    const users = this.read(this.usersFile);
    let mutated = false;
    for (const u of users) {
      if (u.password && !isPasswordHashed(u.password)) {
        u.password = hashPassword(u.password);
        mutated = true;
      }
    }
    if (mutated) {
      this.write(this.usersFile, users);
    }
    return users;
  }

  getUserByEmail(email) {
    if (!email || typeof email !== 'string') return null;
    const users = this.getUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  getUserBySlug(slug) {
    if (!slug || typeof slug !== 'string') return null;
    const users = this.getUsers();
    return users.find(u => (u.slug && u.slug.toLowerCase() === slug.toLowerCase()) || u.id === slug);
  }

  updateUserProfile(email, updates) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) return null;

    const safeUpdates = sanitizeNoSql(updates);
    if (safeUpdates.password) {
      safeUpdates.password = hashPassword(safeUpdates.password);
    }
    users[idx] = { ...users[idx], ...safeUpdates };
    this.write(this.usersFile, users);
    this.logActivity("User Profile Updated", email, { fields: Object.keys(updates) });
    return users[idx];
  }

  updateUserPermissions(id, newRole, newPermissions, actorEmail) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;

    if (newRole) users[idx].role = newRole;
    if (newPermissions) users[idx].permissions = { ...users[idx].permissions, ...newPermissions };

    this.write(this.usersFile, users);
    this.logActivity("User Permissions Changed", actorEmail, { targetId: id, newRole, newPermissions });
    return users[idx];
  }

  updateUserById(id, updates, actorEmail) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;

    const previousEmail = users[idx].email;
    const safeUpdates = sanitizeNoSql(updates);

    if (safeUpdates.email) {
      const cleanNewEmail = safeUpdates.email.toLowerCase().trim();
      const duplicate = users.find((u, i) => i !== idx && u.email.toLowerCase() === cleanNewEmail);
      if (duplicate) {
        return { error: 'Another staff member already uses this email address.' };
      }
      users[idx].email = cleanNewEmail;
    }

    if (safeUpdates.name !== undefined) users[idx].name = safeUpdates.name;
    if (safeUpdates.title !== undefined) users[idx].title = safeUpdates.title;
    if (safeUpdates.department !== undefined) users[idx].department = safeUpdates.department;
    if (safeUpdates.role !== undefined) users[idx].role = safeUpdates.role;
    if (safeUpdates.permissions !== undefined) {
      users[idx].permissions = { ...users[idx].permissions, ...safeUpdates.permissions };
    }
    if (safeUpdates.mustChangePassword !== undefined) {
      users[idx].mustChangePassword = Boolean(safeUpdates.mustChangePassword);
      if (!users[idx].mustChangePassword) {
        users[idx].mustResetPassword = false;
      }
    }
    if (safeUpdates.password) {
      users[idx].password = isPasswordHashed(safeUpdates.password)
        ? safeUpdates.password
        : hashPassword(safeUpdates.password);
    }

    this.write(this.usersFile, users);
    this.logActivity("Staff Details Updated", actorEmail, {
      targetId: id,
      email: users[idx].email,
      role: users[idx].role,
      mustChangePassword: users[idx].mustChangePassword
    });

    return { previousEmail, user: users[idx] };
  }

  expireUserPassword(id, actorEmail) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id || u.email.toLowerCase() === id.toLowerCase());
    if (idx === -1) return null;

    const expiredToken = 'EXPIRED_' + Math.random().toString(36).substring(2) + Date.now();
    users[idx].password = expiredToken;
    users[idx].mustResetPassword = true;
    users[idx].mustChangePassword = true;
    users[idx].passwordExpiredAt = new Date().toISOString();

    this.write(this.usersFile, users);
    this.logActivity("Staff Password Expired by Admin", actorEmail, { targetId: id, targetEmail: users[idx].email });
    return users[idx];
  }

  addUser(userData, actorEmail) {
    const users = this.getUsers();
    const email = (userData.email || '').toLowerCase().trim();
    if (!email) return null;
    if (users.some(u => u.email.toLowerCase() === email)) {
      return null;
    }

    const defaultRolePerms = {
      super_admin: {
        canApproveProjects: true,
        canPublishProjects: true,
        canViewBriefs: true,
        canGenerateBriefs: true,
        canViewCRM: true,
        canEditCRMStatus: true,
        canEditSiteSettings: true,
        canManageUsers: true,
        canViewActivityLog: true,
        canViewMonitoring: true,
        canToggleServices: true
      },
      manager: {
        canApproveProjects: true,
        canPublishProjects: true,
        canViewBriefs: true,
        canGenerateBriefs: true,
        canViewCRM: true,
        canEditCRMStatus: true,
        canEditSiteSettings: false,
        canManageUsers: false,
        canViewActivityLog: true,
        canViewMonitoring: true,
        canToggleServices: false
      },
      employee: {
        canApproveProjects: false,
        canPublishProjects: false,
        canViewBriefs: false,
        canGenerateBriefs: false,
        canViewCRM: false,
        canEditCRMStatus: false,
        canEditSiteSettings: false,
        canManageUsers: false,
        canViewActivityLog: false,
        canViewMonitoring: false,
        canToggleServices: false
      }
    };

    const role = userData.role || 'employee';
    const permissions = userData.permissions || defaultRolePerms[role] || defaultRolePerms.employee;
    const name = userData.name || 'Staff Member';
    const slug = userData.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `staff-${Date.now()}`;

    const rawPw = userData.password || "Aurora@2026";
    const hashedPassword = isPasswordHashed(rawPw) ? rawPw : hashPassword(rawPw);
    const mustChangePassword = userData.mustChangePassword !== undefined ? Boolean(userData.mustChangePassword) : true;

    const newUser = {
      id: `usr-${Date.now()}`,
      email,
      password: hashedPassword,
      name,
      role,
      title: userData.title || "Team Member",
      department: userData.department || "General",
      slug,
      photo: userData.photo || "/assets/Image_error.jpg",
      bioEn: userData.bioEn || "",
      bioAr: userData.bioAr || "",
      theme: "system",
      lang: "en",
      permissions,
      mustChangePassword,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.write(this.usersFile, users);
    this.logActivity("Staff User Added", actorEmail, { id: newUser.id, email: newUser.email, role: newUser.role, mustChangePassword });
    return newUser;
  }

  deleteUser(id, actorEmail) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    const removed = users.splice(idx, 1)[0];
    this.write(this.usersFile, users);
    this.logActivity("Staff User Deleted", actorEmail, { id: removed.id, email: removed.email });
    return removed;
  }

  // ---------------------------------------------------------------------------
  // SERVICES (Dynamic Services Management & Reordering)
  // ---------------------------------------------------------------------------
  getServices() {
    return this.read(this.servicesFile);
  }

  toggleService(id, active, actorEmail) {
    const services = this.getServices();
    const idx = services.findIndex(s => s.id === id);
    if (idx === -1) return null;

    services[idx].active = Boolean(active);
    this.write(this.servicesFile, services);
    this.logActivity("Service Status Toggled", actorEmail, { serviceId: id, active });
    return services[idx];
  }

  addService(serviceData, actorEmail) {
    const services = this.getServices();
    const newService = {
      id: `srv-${Date.now()}`,
      nameEn: serviceData.nameEn || '',
      nameAr: serviceData.nameAr || '',
      descEn: serviceData.descEn || '',
      descAr: serviceData.descAr || '',
      category: serviceData.category || 'marketing',
      tagEn: serviceData.tagEn || 'Service',
      tagAr: serviceData.tagAr || 'خدمة',
      active: serviceData.active !== false,
      items: Array.isArray(serviceData.items) ? serviceData.items : (serviceData.items ? serviceData.items.split(',').map(s => s.trim()).filter(Boolean) : []),
      order: services.length + 1
    };
    services.push(newService);
    this.write(this.servicesFile, services);
    this.logActivity("Service Created", actorEmail, { serviceId: newService.id, name: newService.nameEn });
    return newService;
  }

  updateService(id, serviceData, actorEmail) {
    const services = this.getServices();
    const idx = services.findIndex(s => s.id === id);
    if (idx === -1) return null;

    services[idx] = {
      ...services[idx],
      nameEn: serviceData.nameEn !== undefined ? serviceData.nameEn : services[idx].nameEn,
      nameAr: serviceData.nameAr !== undefined ? serviceData.nameAr : services[idx].nameAr,
      descEn: serviceData.descEn !== undefined ? serviceData.descEn : services[idx].descEn,
      descAr: serviceData.descAr !== undefined ? serviceData.descAr : services[idx].descAr,
      category: serviceData.category !== undefined ? serviceData.category : services[idx].category,
      tagEn: serviceData.tagEn !== undefined ? serviceData.tagEn : services[idx].tagEn,
      tagAr: serviceData.tagAr !== undefined ? serviceData.tagAr : services[idx].tagAr,
      active: serviceData.active !== undefined ? Boolean(serviceData.active) : services[idx].active,
      items: serviceData.items !== undefined ? (Array.isArray(serviceData.items) ? serviceData.items : serviceData.items.split(',').map(s => s.trim()).filter(Boolean)) : services[idx].items
    };

    this.write(this.servicesFile, services);
    this.logActivity("Service Updated", actorEmail, { serviceId: id, name: services[idx].nameEn });
    return services[idx];
  }

  deleteService(id, actorEmail) {
    let services = this.getServices();
    const idx = services.findIndex(s => s.id === id);
    if (idx === -1) return false;

    const removed = services[idx];
    services = services.filter(s => s.id !== id);
    this.write(this.servicesFile, services);
    this.logActivity("Service Deleted", actorEmail, { serviceId: id, name: removed.nameEn });
    return true;
  }

  reorderServices(orderedIds, actorEmail) {
    const services = this.getServices();
    const map = new Map(services.map(s => [s.id, s]));
    const reordered = [];

    orderedIds.forEach((id, idx) => {
      if (map.has(id)) {
        const item = map.get(id);
        item.order = idx + 1;
        reordered.push(item);
        map.delete(id);
      }
    });

    // Append any unmentioned services
    map.forEach(item => {
      item.order = reordered.length + 1;
      reordered.push(item);
    });

    this.write(this.servicesFile, reordered);
    this.logActivity("Services Reordered", actorEmail, { count: reordered.length });
    return reordered;
  }

  // ---------------------------------------------------------------------------
  // PROJECTS & STAGED APPROVAL / PUBLISH
  // ---------------------------------------------------------------------------
  getProjects(status = 'published') {
    const list = this.read(this.projectsFile);
    if (!status || status === 'all') return list;
    if (status === 'published') return list.filter(p => p.isPublished);
    if (status === 'awaiting_review') return list.filter(p => !p.isApproved && !p.isPublished);
    if (status === 'approved_staged') return list.filter(p => p.isApproved && !p.isPublished);
    return list.filter(p => p.status === status);
  }

  getProjectBySlug(slug) {
    const list = this.read(this.projectsFile);
    return list.find(p => p.slug === slug);
  }

  getProjectsForEmployee(employeeName) {
    const list = this.read(this.projectsFile);
    // Projects active/published under his name, plus any project in DB where he is credited
    return list.filter(p => {
      const credited = Array.isArray(p.creditedStaff) ? p.creditedStaff : [];
      return credited.some(name => name.toLowerCase().includes(employeeName.toLowerCase())) ||
             (p.authorName && p.authorName.toLowerCase().includes(employeeName.toLowerCase()));
    });
  }

  addProject(projectData, authorEmail) {
    const list = this.read(this.projectsFile);
    const authorUser = this.getUserByEmail(authorEmail);
    const authorName = authorUser ? authorUser.name : "Employee";

    const newProject = {
      id: 'proj-' + Date.now(),
      slug: (projectData.titleEn || projectData.clientName || 'project')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
      ...projectData,
      heroImage: projectData.heroImage || projectData.photoUrl || "/assets/Image_error.jpg",
      mediaGallery: projectData.mediaGallery && projectData.mediaGallery.length ? projectData.mediaGallery : [
        { type: "photo", url: "/assets/Image_error.jpg", caption: "Project Still" }
      ],
      creditedStaff: projectData.creditedStaff && projectData.creditedStaff.length ? projectData.creditedStaff : [authorName],
      authorEmail,
      authorName,
      isApproved: false,
      isPublished: false,
      status: 'pending_approval',
      auditLog: [
        {
          action: 'Uploaded for Review',
          changedBy: authorEmail || 'employee@aurora.eg',
          timestamp: new Date().toISOString(),
          changesSummary: 'Uploaded new project'
        }
      ],
      createdAt: new Date().toISOString()
    };

    list.unshift(newProject);
    this.write(this.projectsFile, list);
    this.logActivity("Project Uploaded", authorEmail, { projectId: newProject.id, title: newProject.titleEn });
    return newProject;
  }

  approveProject(id, managerEmail) {
    const list = this.read(this.projectsFile);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;

    list[idx].isApproved = true;
    list[idx].status = 'approved_staged';
    list[idx].auditLog.push({
      action: 'Approved (Staged)',
      changedBy: managerEmail,
      timestamp: new Date().toISOString(),
      changesSummary: 'Project approved by manager; ready to be published live.'
    });

    this.write(this.projectsFile, list);
    this.logActivity("Project Approved (Staged)", managerEmail, { projectId: id });
    return list[idx];
  }

  publishProject(id, managerEmail) {
    const list = this.read(this.projectsFile);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;

    list[idx].isApproved = true;
    list[idx].isPublished = true;
    list[idx].status = 'published';
    list[idx].auditLog.push({
      action: 'Published Live',
      changedBy: managerEmail,
      timestamp: new Date().toISOString(),
      changesSummary: 'Project pushed live to public website.'
    });

    this.write(this.projectsFile, list);
    this.logActivity("Project Published Live", managerEmail, { projectId: id });
    return list[idx];
  }

  rejectProject(id, reason, managerEmail) {
    const list = this.read(this.projectsFile);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;

    list[idx].isApproved = false;
    list[idx].isPublished = false;
    list[idx].status = 'rejected';
    list[idx].rejectionReason = reason || 'Requirements not met';
    list[idx].auditLog = list[idx].auditLog || [];
    list[idx].auditLog.push({
      action: 'Project Rejected',
      changedBy: managerEmail,
      timestamp: new Date().toISOString(),
      changesSummary: `Rejected: ${reason || 'Requirements not met'}`
    });

    this.write(this.projectsFile, list);
    this.logActivity("Project Rejected", managerEmail, { projectId: id, reason });
    return list[idx];
  }

  withdrawProject(id, managerEmail) {
    const list = this.read(this.projectsFile);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;

    list[idx].isPublished = false;
    list[idx].status = 'draft';
    list[idx].auditLog = list[idx].auditLog || [];
    list[idx].auditLog.push({
      action: 'Withdrawn to Draft',
      changedBy: managerEmail,
      timestamp: new Date().toISOString(),
      changesSummary: 'Project withdrawn from live website to draft.'
    });

    this.write(this.projectsFile, list);
    this.logActivity("Project Withdrawn to Draft", managerEmail, { projectId: id });
    return list[idx];
  }

  getIndustries() {
    return this.read(this.industriesFile);
  }

  addIndustry(name, actorEmail) {
    if (!name || !name.trim()) return this.getIndustries();
    const list = this.read(this.industriesFile);
    const clean = name.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    if (!list.includes(clean)) {
      list.push(clean);
      this.write(this.industriesFile, list);
      this.logActivity("New Industry Added", actorEmail, { industry: clean });
    }
    return list;
  }

  getUserPortfolioClips(userEmail) {
    const user = this.getUserByEmail(userEmail);
    return (user && user.portfolioClips) || [];
  }

  updateUserPortfolioClips(userEmail, clips, actorEmail) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (idx === -1) return null;

    users[idx].portfolioClips = clips;
    this.write(this.usersFile, users);
    this.logActivity("Employee Portfolio Selection Updated", actorEmail || userEmail, { clipsCount: clips.length });
    return users[idx].portfolioClips;
  }

  updateProject(id, updates, managerEmail) {
    const list = this.read(this.projectsFile);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;

    const current = list[idx];
    list[idx] = {
      ...current,
      ...updates,
      auditLog: [
        ...(current.auditLog || []),
        {
          action: 'Project Edited',
          changedBy: managerEmail,
          timestamp: new Date().toISOString(),
          changesSummary: Object.keys(updates).join(', ')
        }
      ],
      updatedAt: new Date().toISOString()
    };

    this.write(this.projectsFile, list);
    this.logActivity("Project Updated", managerEmail, { projectId: id, updates });
    return list[idx];
  }

  removeProjectFromEmployeePortfolio(projectId, employeeName, actorEmail) {
    const list = this.read(this.projectsFile);
    const idx = list.findIndex(p => p.id === projectId);
    if (idx === -1) return null;

    // Filter out employee name from creditedStaff, but keep project in DB
    list[idx].creditedStaff = (list[idx].creditedStaff || []).filter(name => !name.toLowerCase().includes(employeeName.toLowerCase()));
    this.write(this.projectsFile, list);
    this.logActivity("Project Removed from Employee Portfolio", actorEmail, { projectId, employeeName });
    return list[idx];
  }

  submitUpdateRequest(projectId, updates, employeeEmail) {
    const list = this.read(this.updateRequestsFile);
    const req = {
      id: "upd-" + Date.now(),
      projectId,
      updates,
      requestedBy: employeeEmail,
      status: "pending",
      timestamp: new Date().toISOString()
    };
    list.unshift(req);
    this.write(this.updateRequestsFile, list);
    this.logActivity("Project Update Requested", employeeEmail, { projectId, updates });
    return req;
  }

  // ---------------------------------------------------------------------------
  // CLIENT BRIEFS (KYC)
  // ---------------------------------------------------------------------------
  getBriefs() {
    const list = this.read(this.briefsFile);
    const now = new Date();
    // Auto-compute status
    return list.map(b => {
      let status = b.status || (b.isSubmitted ? 'submitted' : 'pending');
      if (status !== 'deactivated' && status !== 'submitted' && new Date(b.expiryDate) < now) {
        status = 'expired';
      }
      return { ...b, status };
    });
  }

  getBriefByToken(token) {
    const briefs = this.getBriefs();
    return briefs.find(b => b.token === token);
  }

  createBrief(clientName, brandName, daysValid = 30, actorEmail) {
    const list = this.read(this.briefsFile);
    const cleanName = (clientName || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const token = `${Math.random().toString(36).substring(2, 6)}-${cleanName}`;
    const expiryDate = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString();

    const newBrief = {
      token,
      clientName,
      brandName,
      expiryDate,
      status: 'pending',
      isSubmitted: false,
      submittedAt: null,
      data: null,
      createdBy: actorEmail || "manager@aurora.eg",
      createdAt: new Date().toISOString()
    };

    list.unshift(newBrief);
    this.write(this.briefsFile, list);
    this.logActivity("Client Brief Link Created", actorEmail, { token, clientName, brandName, expiryDate });
    return newBrief;
  }

  submitBrief(token, payload) {
    const list = this.read(this.briefsFile);
    const idx = list.findIndex(b => b.token === token);
    if (idx === -1) return { error: 'Brief token not found' };

    const brief = list[idx];
    if (brief.isSubmitted) return { error: 'Brief has already been submitted.' };
    if (brief.status === 'deactivated') return { error: 'This invitation link has been deactivated.' };
    if (new Date() > new Date(brief.expiryDate)) {
      return { error: 'Brief link has expired. Please request a fresh invitation link.' };
    }

    list[idx].isSubmitted = true;
    list[idx].status = 'submitted';
    list[idx].submittedAt = new Date().toISOString();
    list[idx].data = payload;

    this.write(this.briefsFile, list);
    this.logActivity("Client Brief Submitted by Client", brief.clientName, { token, payload });
    return { success: true, brief: list[idx] };
  }

  extendBriefExpiry(token, targetDateOrDays, actorEmail) {
    const list = this.read(this.briefsFile);
    const idx = list.findIndex(b => b.token === token);
    if (idx === -1) return null;

    let newExpiry;
    if (typeof targetDateOrDays === 'string' && !isNaN(Date.parse(targetDateOrDays))) {
      const parsed = new Date(targetDateOrDays);
      const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      newExpiry = parsed > maxDate ? maxDate.toISOString() : parsed.toISOString();
    } else {
      const days = Number(targetDateOrDays) || 14;
      const capped = Math.min(days, 30);
      newExpiry = new Date(Date.now() + capped * 24 * 60 * 60 * 1000).toISOString();
    }

    list[idx].expiryDate = newExpiry;
    if (list[idx].status === 'expired') list[idx].status = 'pending';
    this.write(this.briefsFile, list);
    this.logActivity("Brief Expiry Extended", actorEmail, { token, newExpiry });
    return list[idx];
  }

  deactivateBrief(token, actorEmail) {
    const list = this.read(this.briefsFile);
    const idx = list.findIndex(b => b.token === token);
    if (idx === -1) return null;

    list[idx].status = 'deactivated';
    this.write(this.briefsFile, list);
    this.logActivity("Brief Link Deactivated", actorEmail, { token });
    return list[idx];
  }

  updateBrief(token, updates, actorEmail) {
    const list = this.read(this.briefsFile);
    const idx = list.findIndex(b => b.token === token);
    if (idx === -1) return null;

    // Disallow editing if already submitted
    if (list[idx].isSubmitted) {
      return { error: 'Cannot edit brief once submitted by client.' };
    }

    // Requirement D.1.3: if status was deactivated, reactivate to pending
    if (list[idx].status === 'deactivated') {
      list[idx].status = 'pending';
    }

    list[idx] = { ...list[idx], ...updates };
    this.write(this.briefsFile, list);
    this.logActivity("Brief Details Edited", actorEmail, { token, updates, status: list[idx].status });
    return { success: true, brief: list[idx] };
  }

  // ---------------------------------------------------------------------------
  // PUBLIC CONTACT INQUIRIES (CRM)
  // ---------------------------------------------------------------------------
  getInquiries() {
    return this.read(this.inquiriesFile);
  }

  addInquiry(inquiryData) {
    const list = this.read(this.inquiriesFile);
    const newInquiry = {
      id: 'inq-' + Date.now(),
      ...inquiryData,
      status: 'Pending',
      createdAt: new Date().toISOString()
    };
    list.unshift(newInquiry);
    this.write(this.inquiriesFile, list);
    this.logActivity("Public Inquiry Received", newInquiry.fullName, { brand: newInquiry.brandName, budget: newInquiry.budget });
    return newInquiry;
  }

  updateInquiryStatus(id, newStatus, note = '', actorEmail = 'system') {
    const list = this.read(this.inquiriesFile);
    const idx = list.findIndex(inq => inq.id === id);
    if (idx === -1) return null;

    const oldStatus = list[idx].status || 'Pending';
    list[idx].status = newStatus;
    list[idx].latestNote = note || list[idx].latestNote || '';
    list[idx].updatedAt = new Date().toISOString();

    if (!Array.isArray(list[idx].statusHistory)) {
      list[idx].statusHistory = [];
    }

    const historyEntry = {
      id: 'sh-' + Date.now(),
      fromStatus: oldStatus,
      toStatus: newStatus,
      note: note || '',
      updatedBy: actorEmail || 'Staff',
      updatedAt: new Date().toISOString()
    };
    list[idx].statusHistory.unshift(historyEntry);

    this.write(this.inquiriesFile, list);
    this.logActivity("CRM Client Status Updated", actorEmail, { inquiryId: id, client: list[idx].fullName, oldStatus, newStatus, note });
    return list[idx];
  }

  getMarquee() {
    if (!fs.existsSync(this.marqueeFile)) {
      this.initFiles();
    }
    return this.read(this.marqueeFile);
  }

  saveMarquee(data, actorEmail = 'system') {
    const current = this.getMarquee() || { speedSeconds: 35, logos: [] };
    const updated = {
      speedSeconds: Number(data.speedSeconds) || current.speedSeconds || 35,
      logos: Array.isArray(data.logos) ? data.logos : current.logos || []
    };
    this.write(this.marqueeFile, updated);
    this.logActivity("Partner Logos Marquee Updated", actorEmail, { logoCount: updated.logos.length, speedSeconds: updated.speedSeconds });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // SETTINGS & MONITORING
  // ---------------------------------------------------------------------------
  getSettings() {
    return this.read(this.settingsFile);
  }

  updateSettings(updates, actorEmail) {
    const current = this.read(this.settingsFile);
    const merged = { ...current, ...updates };
    this.write(this.settingsFile, merged);
    this.logActivity("Site Settings Modified", actorEmail, updates);
    return merged;
  }

  // ---------------------------------------------------------------------------
  // SITE CONTENT & MEDIA CMS (Super Admin Only)
  // ---------------------------------------------------------------------------
  getSiteContent() {
    return this.read(this.contentFile);
  }

  updateSiteContent(updates, actorEmail) {
    const current = this.read(this.contentFile) || {};
    // Deep merge page keys
    const merged = { ...current };
    for (const pageKey of Object.keys(updates)) {
      if (typeof updates[pageKey] === 'object' && !Array.isArray(updates[pageKey]) && updates[pageKey] !== null) {
        merged[pageKey] = { ...(current[pageKey] || {}), ...updates[pageKey] };
      } else {
        merged[pageKey] = updates[pageKey];
      }
    }
    this.write(this.contentFile, merged);
    this.logActivity("Site Content Modified", actorEmail, { pagesUpdated: Object.keys(updates) });
    return merged;
  }

  getActivityLogs() {
    return this.read(this.activityLogFile);
  }

  getMonitoring() {
    return this.read(this.monitoringFile);
  }

  recordVisit(page, ip = "127.0.0.1", referrer = "direct") {
    const mon = this.read(this.monitoringFile);
    mon.totalVisits = (mon.totalVisits || 0) + 1;
    const cleanKey = page.replace(/^\//, '').split('/')[0] || 'home';
    mon.pageViews = mon.pageViews || {};
    mon.pageViews[cleanKey] = (mon.pageViews[cleanKey] || 0) + 1;
    mon.recentSessions = mon.recentSessions || [];
    mon.recentSessions.unshift({ ip, page, referrer, time: new Date().toISOString() });
    if (mon.recentSessions.length > 50) mon.recentSessions.pop();
    this.write(this.monitoringFile, mon);
  }

  // ---------------------------------------------------------------------------
  // QUOTATIONS & COMMERCIAL INVOICES (PART 4)
  // ---------------------------------------------------------------------------
  getInvoices() {
    return this.read(this.invoicesFile) || [];
  }

  getInvoiceById(id) {
    const list = this.getInvoices();
    return list.find(inv => inv.id === id || inv.number === id) || null;
  }

  saveInvoice(data, actorEmail) {
    const list = this.read(this.invoicesFile) || [];
    let invoice = null;
    if (data.id) {
      const idx = list.findIndex(inv => inv.id === data.id);
      if (idx !== -1) {
        list[idx] = {
          ...list[idx],
          ...data,
          updatedAt: new Date().toISOString()
        };
        invoice = list[idx];
        this.logActivity("Invoice / Quotation Updated", actorEmail, { number: invoice.number, client: invoice.clientName, total: invoice.total });
      }
    }
    if (!invoice) {
      const count = list.length + 1;
      const year = new Date().getFullYear();
      const autoNum = `AUR-${year}-${String(count).padStart(3, '0')}`;
      invoice = {
        id: `inv-${Date.now()}`,
        number: data.number || autoNum,
        type: data.type || 'quotation', // 'quotation' | 'invoice'
        status: data.status || 'Draft', // 'Draft' | 'Sent' | 'Approved' | 'Paid'
        clientName: data.clientName || '',
        brandName: data.brandName || '',
        email: data.email || '',
        phone: data.phone || '',
        address: data.address || '',
        taxId: data.taxId || '',
        issueDate: data.issueDate || new Date().toISOString().split('T')[0],
        dueDate: data.dueDate || '',
        items: Array.isArray(data.items) ? data.items : [],
        subtotal: Number(data.subtotal) || 0,
        discount: Number(data.discount) || 0,
        applyVat: Boolean(data.applyVat),
        vatAmount: Number(data.vatAmount) || 0,
        total: Number(data.total) || 0,
        currency: data.currency || 'EGP',
        notes: data.notes || '',
        paymentMethod: data.paymentMethod || 'Next Bank / CIB / Instapay',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      list.unshift(invoice);
      this.logActivity("Invoice / Quotation Created", actorEmail, { number: invoice.number, client: invoice.clientName, total: invoice.total });
    }
    this.write(this.invoicesFile, list);
    return invoice;
  }

  deleteInvoice(id, actorEmail) {
    let list = this.read(this.invoicesFile) || [];
    const target = list.find(inv => inv.id === id);
    if (!target) return false;
    list = list.filter(inv => inv.id !== id);
    this.write(this.invoicesFile, list);
    this.logActivity("Invoice / Quotation Deleted", actorEmail, { number: target.number, client: target.clientName });
    return true;
  }
}

export const store = new DataStoreV2();
