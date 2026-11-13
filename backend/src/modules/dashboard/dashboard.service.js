import { generateGeminiContent } from '../../services/gemini.service.js';
import { logger } from '../../utils/logger.js';

/**
 * Real, existing page routes per portal, keyed by module key.
 * KEEP IN SYNC with the sidebar menus / App.jsx routes. The AI is never allowed to invent a path:
 * every quick action is checked against this map (see sanitizeQuickActions) so a button can
 * never open a 404 or a page from the wrong portal.
 */
export const PORTAL_MODULE_ROUTES = Object.freeze({
  admin: {
    noticeboard: '/admin/notices', canteen: '/admin/canteen', staff: '/admin/staff',
    classes: '/admin/classes', subjects: '/admin/subjects', students: '/admin/students',
    attendance: '/admin/attendance', 'hr-payroll': '/admin/hr-payroll', chats: '/admin/chats',
    timetables: '/admin/timetables', calendar: '/admin/calendar', exams: '/admin/exams',
    homework: '/admin/homework', lesson_plans: '/admin/lesson-plans', resources: '/admin/resources',
    performance: '/admin/performance', ptm: '/admin/ptm', fees: '/admin/fees',
    transport: '/admin/transport', library: '/admin/library', inventory: '/admin/inventory',
    leaves: '/admin/leaves', reports: '/admin/reports', leads: '/admin/leads', billing: '/admin/billing'
  },
  teacher: {
    noticeboard: '/teacher/notices', calendar: '/teacher/calendar', timetables: '/teacher/timetable',
    lesson_plans: '/teacher/lesson-plans', resources: '/teacher/resources', attendance: '/teacher/attendance',
    homework: '/teacher/homework', performance: '/teacher/performance', ptm: '/teacher/ptm',
    transport: '/teacher/transport', exams: '/teacher/grades', chats: '/teacher/chat',
    'hr-payroll': '/teacher/salary', leaves: '/teacher/leaves'
  },
  parent: {
    attendance: '/parent/attendance', homework: '/parent/homework', noticeboard: '/parent/notices',
    calendar: '/parent/calendar', library: '/parent/library', canteen: '/parent/canteen',
    fees: '/parent/fees', leaves: '/parent/leaves', chats: '/parent/chat', exams: '/parent/grades',
    performance: '/parent/performance', ptm: '/parent/ptm'
  }
});

/** Personal pages every user of a portal can open (not tied to a module permission). */
const ALWAYS_ALLOWED_ROUTES = Object.freeze({
  admin: ['/admin/profile', '/admin/salary'],
  teacher: ['/teacher/profile', '/teacher/salary'],
  parent: ['/parent/children']
});

const PORTALS = Object.keys(PORTAL_MODULE_ROUTES);

/** The portal the user is looking at. The client sends it; otherwise it is derived from the role. */
export function resolvePortal(role, clientPortal) {
  if (PORTALS.includes(clientPortal)) return clientPortal;
  const r = String(role || '').toLowerCase();
  if (r === 'parent') return 'parent';
  if (r === 'teacher') return 'teacher';
  return 'admin';
}

/** Valid routes of a portal that this user may open (used to tell the AI what it may suggest). */
export function getAllowedRoutes(portal, permittedModules) {
  const routes = PORTAL_MODULE_ROUTES[portal] || {};
  const isAll = permittedModules === 'ALL' || portal === 'parent'; // parent pages are not module-permission based
  const allowed = new Set(Array.isArray(permittedModules) ? permittedModules : []);
  const list = Object.entries(routes)
    .filter(([key]) => isAll || allowed.has(key))
    .map(([module, path]) => ({ module, path }));
  (ALWAYS_ALLOWED_ROUTES[portal] || []).forEach((path) => list.push({ module: 'personal', path }));
  return list;
}

function normalizePath(raw) {
  if (typeof raw !== 'string') return null;
  let p = raw.trim().split(/[?#]/)[0];
  if (!p) return null;
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return p || null;
}

/**
 * Turns whatever path the AI wrote into a real route of the user's portal, or null when there is
 * no such page or the user has no permission for that module.
 *   '/homework'         (teacher portal) -> '/teacher/homework'
 *   '/teacher/exams'    (teacher portal) -> '/teacher/grades'
 *   '/teacher/fees'     (no fees access) -> null
 */
export function resolveBriefingPath(rawPath, portal, permittedModules) {
  const routes = PORTAL_MODULE_ROUTES[portal];
  const path = normalizePath(rawPath);
  if (!routes || !path) return null;

  const isAll = permittedModules === 'ALL' || portal === 'parent'; // parent pages are not module-permission based
  const allowed = new Set(Array.isArray(permittedModules) ? permittedModules : []);
  const canUse = (key) => isAll || allowed.has(key);

  // 1) personal pages (profile / my salary)
  const personal = ALWAYS_ALLOWED_ROUTES[portal] || [];
  if (personal.includes(path)) return path;

  // 2) an exact, valid route of this portal
  for (const [key, routePath] of Object.entries(routes)) {
    if (routePath === path) return canUse(key) ? path : null;
  }

  // 3) wrong or invented path: match on the last segment ('/homework', '/teacher/exams', '/admin/notice' ...)
  const segment = path.split('/').filter(Boolean).pop()?.toLowerCase();
  if (!segment) return null;
  const seg = segment.replace(/-/g, '_');
  for (const [key, routePath] of Object.entries(routes)) {
    const last = routePath.split('/').pop();
    const names = new Set([
      key, key.replace(/_/g, '-'), `${key}s`, key.replace(/s$/, ''),
      last, last.replace(/-/g, '_'), `${last}s`, last.replace(/s$/, '')
    ]);
    if (names.has(segment) || names.has(seg)) return canUse(key) ? routePath : null;
  }
  const personalMatch = personal.find((pp) => pp.split('/').pop() === segment);
  return personalMatch || null;
}

/** Keeps only actions that open a real, permitted page of the user's portal (max 3, no duplicates). */
export function sanitizeQuickActions(actions, portal, permittedModules) {
  if (!Array.isArray(actions)) return [];
  const seen = new Set();
  const clean = [];
  for (const action of actions) {
    if (!action || typeof action.label !== 'string' || !action.label.trim()) continue;
    const path = resolveBriefingPath(action.path, portal, permittedModules);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    clean.push({
      label: action.label.trim().slice(0, 40),
      path,
      type: clean.length === 0 ? 'primary' : 'secondary'
    });
    if (clean.length === 3) break;
  }
  return clean;
}

/* ------------------------------------------------------------------ */
/*  VERIFIED FACTS                                                     */
/*  Every statement the briefing makes about a person's day comes from */
/*  here. These sentences are built ONLY from real data that the app   */
/*  sent (timetable, attendance, fees ...). The AI may reword them but */
/*  is never allowed to add a fact of its own.                         */
/* ------------------------------------------------------------------ */

const MAX_LISTED_PERIODS = 6;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

function isParentContext(role, portal) {
  return portal === 'parent' || String(role || '').toLowerCase() === 'parent';
}

function isTeacherContext(role, portal) {
  return portal === 'teacher' || String(role || '').toLowerCase() === 'teacher';
}

/** Returns an array of plain sentences that are guaranteed to match the real data in `stats`. */
export function buildVerifiedFacts({ role, portal, stats = {} }) {
  const facts = [];

  // ---------------- Parent ----------------
  if (isParentContext(role, portal)) {
    const child = stats.studentName || 'your child';

    if (stats.attendanceLoaded) {
      const total = Number(stats.attendanceTotal) || 0;
      if (total > 0) {
        const present = Number(stats.attendancePresent) || 0;
        const late = Number(stats.attendanceLate) || 0;
        const absent = Number(stats.attendanceAbsent) || 0;
        const pct = isNum(stats.attendancePercentage)
          ? stats.attendancePercentage
          : Math.round(((present + late) / total) * 100);
        facts.push(`${child}'s overall attendance is ${pct}% (${present} present, ${late} late, ${absent} absent out of ${total} recorded days).`);
      } else {
        facts.push(`No attendance has been recorded for ${child} yet.`);
      }
    }

    if (stats.feesLoaded) {
      const overdue = Number(stats.overdueFeesCount) || 0;
      const unpaid = Number(stats.unpaidFeesCount) || 0;
      const amount = Number(stats.totalUnpaidAmount) || 0;
      if (overdue > 0) {
        facts.push(`${overdue} fee invoice(s) are overdue and the total outstanding amount is ${money(amount)}.`);
      } else if (unpaid > 0) {
        const due = stats.earliestDueDate ? ` The earliest due date is ${stats.earliestDueDate}.` : '';
        facts.push(`${unpaid} fee invoice(s) are unpaid with ${money(amount)} outstanding.${due}`);
      } else {
        facts.push('There are no pending fee dues.');
      }
    }
    return facts;
  }

  // ---------------- Teacher ----------------
  if (isTeacherContext(role, portal) || stats.todayTeachingPeriodsCount !== undefined || stats.classTeacherOfCount !== undefined || stats.assignedClassesCount !== undefined) {
    const day = stats.todayName || 'today';

    if (!stats.timetableUnavailable && isNum(stats.todayTeachingPeriodsCount)) {
      const count = stats.todayTeachingPeriodsCount;
      if (count > 0) {
        const list = Array.isArray(stats.todayTeachingPeriods)
          ? stats.todayTeachingPeriods.slice(0, MAX_LISTED_PERIODS).join('; ')
          : '';
        facts.push(`You have ${count} teaching period(s) scheduled today (${day})${list ? `: ${list}` : ''}.`);
      } else {
        facts.push(`You have no teaching periods scheduled today (${day}).`);
      }
    }

    const classTeacherCount = stats.classTeacherOfCount ?? stats.assignedClassesCount;
    if (isNum(classTeacherCount) && classTeacherCount > 0) {
      facts.push(`You are the class teacher of ${classTeacherCount} class(es).`);
    }

    if (isNum(stats.noticesCount) && stats.noticesCount > 0) {
      facts.push(`${stats.noticesCount} recent school notice(s) are available for review.`);
    }
  }

  return facts;
}

/* ------------------------------------------------------------------ */
/*  Output check: reject any AI text that says something the facts     */
/*  do not support (invented numbers, "classes today" when none).      */
/* ------------------------------------------------------------------ */

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
const numbersIn = (text) =>
  (String(text || '').match(NUMBER_RE) || [])
    .map((n) => Number(n.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));

const MENTIONS_TODAYS_CLASSES = /\b(period|periods|class|classes|lesson|lessons)\b[^.]*\btoday\b|\btoday\b[^.]*\b(period|periods|class|classes|lesson|lessons)\b/i;
const NEGATION = /\b(no|not|none|nothing|without|free|zero)\b/i;

export function isBriefingGrounded({ aiResult, facts, stats = {}, userName = '', role, portal }) {
  const parent = isParentContext(role, portal);
  const teacher = isTeacherContext(role, portal);
  if (!parent && !teacher) return true; // admin/staff briefings keep the existing behaviour

  const texts = [aiResult.greeting, aiResult.headline, ...(aiResult.highlights || [])]
    .filter((t) => typeof t === 'string');

  // 1) Every number written by the AI must exist in the verified facts
  const allowed = new Set([...numbersIn(facts.join(' ')), ...numbersIn(userName)]);
  for (const text of texts) {
    for (const n of numbersIn(text)) {
      if (!allowed.has(n)) return false;
    }
  }

  // 2) Teacher: never claim classes/periods today when there are none or when it is unknown
  if (teacher) {
    const none = isNum(stats.todayTeachingPeriodsCount) && stats.todayTeachingPeriodsCount === 0;
    const unknown = Boolean(stats.timetableUnavailable) || !isNum(stats.todayTeachingPeriodsCount);
    for (const text of texts) {
      if (!MENTIONS_TODAYS_CLASSES.test(text)) continue;
      if (unknown) return false;
      if (none && !NEGATION.test(text)) return false;
    }
  }
  return true;
}

/**
 * Deterministic generator. Used when AI is unavailable, slow, offline, or when the AI wrote
 * something the verified facts do not support. It only ever states real data.
 */
export function getDeterministicBriefing({ role, userName, permittedModules, stats = {}, portal }) {
  const r = String(role || '').toLowerCase();
  const perms = Array.isArray(permittedModules) ? permittedModules : [];
  const parent = isParentContext(r, portal);
  const teacher = !parent && (isTeacherContext(r, portal) || (!(r === 'admin' || r === 'superadmin') && permittedModules !== 'ALL' && (perms.includes('attendance') || perms.includes('classes'))));
  const isAll = !parent && !teacher && (permittedModules === 'ALL' || r === 'admin' || r === 'superadmin');

  // Parent
  if (parent) {
    const facts = buildVerifiedFacts({ role: r, portal: 'parent', stats });
    const highlights = facts.length > 0 ? facts : [
      "Your child's attendance and academic records are updated regularly.",
      'Check homework and classroom announcements on your dashboard.',
      'Review any upcoming school calendar events and PTM schedules.'
    ];
    return {
      greeting: `Welcome, ${userName || 'Parent'}`,
      headline: 'Child Progress & School Updates',
      highlights,
      quickActions: [
        { label: 'View Attendance', path: '/parent/attendance', type: 'primary' },
        { label: 'Homework', path: '/parent/homework', type: 'secondary' }
      ],
      isAiGenerated: false
    };
  }

  // Teacher or Grade Coordinator
  if (teacher) {
    const highlights = buildVerifiedFacts({ role: r, portal: 'teacher', stats });
    if (stats.timetableUnavailable || !highlights.some((h) => /teaching period/.test(h))) {
      highlights.unshift("Open your timetable to see today's periods.");
    }
    const classTeacherCount = stats.classTeacherOfCount ?? stats.assignedClassesCount;
    if (isNum(classTeacherCount) && classTeacherCount > 0) {
      highlights.push('Remember to record daily attendance for your class.');
    }
    return {
      greeting: `Welcome, ${userName || 'Teacher'}`,
      headline: "Today's Academic & Classroom Focus",
      highlights: highlights.slice(0, 3),
      quickActions: [
        { label: 'My Timetable', path: '/teacher/timetable', type: 'primary' },
        { label: 'Mark Attendance', path: '/teacher/attendance', type: 'secondary' }
      ],
      isAiGenerated: false
    };
  }

  // Administrator
  if (isAll) {
    const highlights = [];
    if (stats.students !== undefined || stats.classes !== undefined) {
      highlights.push(`Monitoring ${stats.students ?? 0} students across ${stats.classes ?? 0} active classes.`);
    }
    if (stats.pendingAttendance && stats.pendingAttendance > 0) {
      highlights.push(`Alert: ${stats.pendingAttendance} class attendance session(s) pending cutoff submission.`);
    } else {
      highlights.push('Class attendance is logged and up to date today.');
    }
    if (stats.feeCollectedPct !== undefined) {
      highlights.push(`Term fee collection progress is currently at ${stats.feeCollectedPct}%.`);
    } else {
      highlights.push('School administrative operations are running smoothly.');
    }

    return {
      greeting: `Welcome back, ${userName || 'Administrator'}`,
      headline: "Today's School Operations Summary",
      highlights,
      quickActions: [
        { label: 'Attendance Overview', path: '/admin/attendance', type: 'primary' },
        { label: 'Fee Management', path: '/admin/fees', type: 'secondary' },
        { label: 'Noticeboard', path: '/admin/notices', type: 'secondary' }
      ],
      isAiGenerated: false
    };
  }

  // Finance / Accountant Staff
  if (perms.includes('fees') || perms.includes('invoices') || perms.includes('hr-payroll')) {
    const highlights = [];
    if (stats.feeCollectedPct !== undefined) {
      highlights.push(`Current fee collection progress is at ${stats.feeCollectedPct}%.`);
    }
    if (stats.payrollProcessed) {
      highlights.push('Monthly payroll cycle has been processed.');
    } else {
      highlights.push('Monthly payroll review is pending completion.');
    }
    highlights.push('Verify incoming fee transactions and monitor pending dues.');

    return {
      greeting: `Welcome, ${userName || 'Staff Member'}`,
      headline: 'Finance & Accounts Daily Overview',
      highlights,
      quickActions: [
        { label: 'Fee Management', path: '/admin/fees', type: 'primary' },
        { label: 'HR & Payroll', path: '/admin/hr-payroll', type: 'secondary' }
      ],
      isAiGenerated: false
    };
  }

  // General Staff
  return {
    greeting: `Welcome back, ${userName || 'Staff Member'}`,
    headline: 'Daily Work Hub',
    highlights: [
      'Access all your assigned modules and tools directly from your dashboard.',
      'Review recent school updates and departmental notices.'
    ],
    quickActions: [
      { label: 'View Notices', path: '/admin/notices', type: 'primary' }
    ],
    isAiGenerated: false
  };
}

/** Role-specific writing guidance given to the AI. */
function roleGuidance(role, portal) {
  if (isParentContext(role, portal)) {
    return `The reader is a PARENT. Speak to them about THEIR CHILD (attendance, fee dues). Never mention teaching periods, timetables of teachers, payroll or admin tasks.`;
  }
  if (isTeacherContext(role, portal)) {
    return `The reader is a TEACHER. Speak to them about THEIR teaching periods today and their class-teacher duties. Never mention fees collection, payroll or admin-only tasks.`;
  }
  return `The reader is a school administrator or staff member.`;
}

/**
 * Generates an intelligent, role-tailored AI briefing for a user.
 */
export async function generateBriefing(schoolId, user, clientContext = {}) {
  const role = user?.role || clientContext.role || 'staff';
  const userName = user?.fullName || user?.name || clientContext.userName || 'Staff Member';
  const permittedModules = clientContext.permittedModules || (role === 'admin' || role === 'superadmin' ? 'ALL' : []);
  const stats = clientContext.stats || {};
  const portal = resolvePortal(role, clientContext.portal);
  const allowedRoutes = getAllowedRoutes(portal, permittedModules);
  const roleScoped = isParentContext(role, portal) || isTeacherContext(role, portal);
  const facts = roleScoped ? buildVerifiedFacts({ role, portal, stats }) : [];

  const systemInstruction = `You are SchoolTrio AI, an intelligent executive assistant for a school management platform.
Your task is to generate a concise, encouraging, and highly professional daily work briefing tailored specifically to the person reading it.

CRITICAL RULES:
1. ONLY refer to modules that the user is permitted to access: ${JSON.stringify(permittedModules)}. Never mention or suggest unpermitted features.
2. User Role: "${role}", Portal: "${portal}", User Name: "${userName}". ${roleGuidance(role, portal)}
3. Keep the "headline" strictly to 1 crisp sentence.
4. Provide exactly 2 or 3 high-impact bullet points in "highlights" summarizing today's key status, pending tasks, or priorities based on the data.
5. Provide 2 or 3 "quickActions" with format: {"label": string, "path": string, "type": "primary" | "secondary"}. Each "path" MUST be copied exactly from this list of valid pages for this user: ${JSON.stringify(allowedRoutes)}. Never invent, shorten or modify a path.
6. FACTUAL ACCURACY (most important rule): ${roleScoped
      ? `The prompt contains a list called VERIFIED FACTS. These are the ONLY facts you may state.
   - Reword them if you like, but do not add, change, round or guess any number, name, subject, class or date.
   - Write numbers as digits exactly as they appear in the facts.
   - Do NOT claim that the user has classes, periods, homework, lesson plans, exams or tasks unless a verified fact says so.
   - If a fact says there are NO teaching periods today, say so clearly. Never say classes are "ready" or "assigned for today" in that case.
   - If there are no verified facts, write one short friendly headline and highlights that only point the user to useful pages WITHOUT stating any numbers or claiming anything about their day.
   - A class-teacher count is NOT a count of today's classes.`
      : `Only state facts that are explicitly present in the data snapshot. Never guess or infer numbers. If a metric is missing, do not mention it.`}
7. Respond with strictly valid JSON matching this schema:
{
  "greeting": "string",
  "headline": "string",
  "highlights": ["string"],
  "quickActions": [{"label": "string", "path": "string", "type": "string"}]
}`;

  const dataBlock = roleScoped
    ? `VERIFIED FACTS:\n${facts.length ? facts.map((f) => `- ${f}`).join('\n') : '- (none available)'}`
    : `- Active Metrics: ${JSON.stringify(stats)}`;

  const prompt = `Current data snapshot for ${userName} (${role}):
- Permitted Modules: ${JSON.stringify(permittedModules)}
${dataBlock}
Generate a concise, motivating daily briefing tailored strictly to this role and the data above.`;

  try {
    const aiResult = await generateGeminiContent({ prompt, systemInstruction });
    if (aiResult && aiResult.headline && Array.isArray(aiResult.highlights)) {
      aiResult.highlights = aiResult.highlights.filter((h) => typeof h === 'string' && h.trim()).slice(0, 3);

      if (!isBriefingGrounded({ aiResult, facts, stats, userName, role, portal })) {
        logger.warn({ role, portal }, 'AI briefing contained claims not supported by the data; serving verified fallback');
      } else {
        // The AI only suggests pages. We decide the real route and never trust a path it wrote.
        let quickActions = sanitizeQuickActions(aiResult.quickActions, portal, permittedModules);
        if (quickActions.length === 0) {
          const fb = getDeterministicBriefing({ role, userName, permittedModules, stats, portal });
          quickActions = sanitizeQuickActions(fb.quickActions, portal, permittedModules);
        }
        return {
          ...aiResult,
          quickActions,
          isAiGenerated: true,
          generatedAt: new Date().toISOString()
        };
      }
    }
  } catch (err) {
    logger.warn({ error: err.message }, 'Gemini briefing generation failed; serving resilient deterministic fallback');
  }

  // Graceful fallback if Gemini is offline, slow, or wrote something the data does not support
  const fallback = getDeterministicBriefing({ role, userName, permittedModules, stats, portal });
  return {
    ...fallback,
    quickActions: sanitizeQuickActions(fallback.quickActions, portal, permittedModules),
    generatedAt: new Date().toISOString()
  };
}
