import { generateGeminiContent } from '../../services/gemini.service.js';
import { logger } from '../../utils/logger.js';

/**
 * Deterministic fallback generator for when AI is unavailable, slow, or offline.
 */
export function getDeterministicBriefing({ role, userName, permittedModules, stats = {} }) {
  const isAll = permittedModules === 'ALL' || role === 'admin' || role === 'superadmin';
  const perms = Array.isArray(permittedModules) ? permittedModules : [];

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
        { label: "Attendance Overview", path: "/admin/attendance", type: "primary" },
        { label: "Fee Management", path: "/admin/fees", type: "secondary" },
        { label: "Noticeboard", path: "/admin/notices", type: "secondary" }
      ],
      isAiGenerated: false
    };
  }

  // Teacher or Grade Coordinator
  if (role === 'teacher' || perms.includes('attendance') || perms.includes('classes')) {
    const highlights = [];
    if (stats.assignedClassesCount) {
      highlights.push(`You have ${stats.assignedClassesCount} class unit(s) assigned under your coordination.`);
    } else {
      highlights.push('Your teaching units and student rosters are active.');
    }
    highlights.push('Check today\'s schedule and ensure daily attendance is recorded.');
    if (stats.noticesCount && stats.noticesCount > 0) {
      highlights.push(`${stats.noticesCount} recent school notice(s) available for review.`);
    }

    return {
      greeting: `Welcome, ${userName || 'Teacher'}`,
      headline: "Today's Academic & Classroom Focus",
      highlights,
      quickActions: [
        { label: "Mark Attendance", path: "/teacher/attendance", type: "primary" },
        { label: "My Timetable", path: "/teacher/timetable", type: "secondary" }
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
      headline: "Finance & Accounts Daily Overview",
      highlights,
      quickActions: [
        { label: "Fee Management", path: "/admin/fees", type: "primary" },
        { label: "HR & Payroll", path: "/admin/hr-payroll", type: "secondary" }
      ],
      isAiGenerated: false
    };
  }

  // Parent
  if (role === 'parent') {
    return {
      greeting: `Welcome, ${userName || 'Parent'}`,
      headline: "Child Progress & School Updates",
      highlights: [
        "Your child's attendance and academic records are updated regularly.",
        "Check homework and classroom announcements on your dashboard.",
        "Review any upcoming school calendar events and PTM schedules."
      ],
      quickActions: [
        { label: "View Attendance", path: "/parent/attendance", type: "primary" },
        { label: "Homework", path: "/parent/homework", type: "secondary" }
      ],
      isAiGenerated: false
    };
  }

  // General Staff
  return {
    greeting: `Welcome back, ${userName || 'Staff Member'}`,
    headline: "Daily Work Hub",
    highlights: [
      "Access all your assigned modules and tools directly from your dashboard.",
      "Review recent school updates and departmental notices."
    ],
    quickActions: [
      { label: "View Notices", path: "/admin/notices", type: "primary" }
    ],
    isAiGenerated: false
  };
}

/**
 * Generates an intelligent, role-tailored AI briefing for a user.
 */
export async function generateBriefing(schoolId, user, clientContext = {}) {
  const role = user?.role || clientContext.role || 'staff';
  const userName = user?.fullName || user?.name || clientContext.userName || 'Staff Member';
  const permittedModules = clientContext.permittedModules || (role === 'admin' || role === 'superadmin' ? 'ALL' : []);
  const stats = clientContext.stats || {};

  const systemInstruction = `You are SchoolTrio AI, an intelligent executive assistant for a school management platform.
Your task is to generate a concise, encouraging, and highly professional daily work briefing tailored specifically to a school staff member, teacher, parent, or administrator.

CRITICAL RULES:
1. ONLY refer to modules that the user is permitted to access: ${JSON.stringify(permittedModules)}. Never mention or suggest unpermitted features.
2. User Role: "${role}", User Name: "${userName}".
3. Keep the "headline" strictly to 1 crisp sentence.
4. Provide exactly 2 or 3 high-impact bullet points in "highlights" summarizing today's key status, pending tasks, or priorities based on the data.
5. Provide 2 or 3 "quickActions" taking them to their permitted routes with format: {"label": string, "path": string, "type": "primary" | "secondary"}.
6. Respond with strictly valid JSON matching this schema:
{
  "greeting": "string",
  "headline": "string",
  "highlights": ["string"],
  "quickActions": [{"label": "string", "path": "string", "type": "string"}]
}`;

  const prompt = `Current data snapshot for ${userName} (${role}):
- Permitted Modules: ${JSON.stringify(permittedModules)}
- Active Metrics: ${JSON.stringify(stats)}
Generate a concise, motivating daily briefing tailored strictly to this role and permitted data.`;

  try {
    const aiResult = await generateGeminiContent({ prompt, systemInstruction });
    if (aiResult && aiResult.headline && Array.isArray(aiResult.highlights)) {
      return {
        ...aiResult,
        isAiGenerated: true,
        generatedAt: new Date().toISOString()
      };
    }
  } catch (err) {
    logger.warn({ error: err.message }, 'Gemini briefing generation failed; serving resilient deterministic fallback');
  }

  // Graceful fallback if Gemini is offline or slow
  const fallback = getDeterministicBriefing({ role, userName, permittedModules, stats });
  return {
    ...fallback,
    generatedAt: new Date().toISOString()
  };
}

