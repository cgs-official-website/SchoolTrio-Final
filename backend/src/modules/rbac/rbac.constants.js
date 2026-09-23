import { ValidationError } from '../../utils/app-error.js';

/**
 * 15 Verified Institutional Default Roles
 * Derived directly from src/pages/Admin/RolesPermissions.jsx and backend/prisma/seed.js
 */
export const DEFAULT_ROLES = Object.freeze([
  { name: 'Correspondent', slug: 'correspondent', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Principal', slug: 'principal', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Vice Principal', slug: 'vice-principal', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Subject Wise Head', slug: 'subject-wise-head', loginPanel: 'teacher', isSystemDefault: true },
  { name: 'Class Incharge', slug: 'class-incharge', loginPanel: 'teacher', isSystemDefault: true },
  { name: 'Staffs', slug: 'staffs', loginPanel: 'teacher', isSystemDefault: true },
  { name: 'Administrative Officer', slug: 'administrative-officer', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Finance Department', slug: 'finance-department', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Library', slug: 'library', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Canteen', slug: 'canteen', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Transport', slug: 'transport', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Janitors', slug: 'janitors', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Hostel', slug: 'hostel', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Inventory', slug: 'inventory', loginPanel: 'admin', isSystemDefault: true },
  { name: 'Security', slug: 'security', loginPanel: 'admin', isSystemDefault: true }
]);

export const DEFAULT_ROLE_NAMES = Object.freeze(DEFAULT_ROLES.map(r => r.name));
export const DEFAULT_ROLE_SLUGS = Object.freeze(DEFAULT_ROLES.map(r => r.slug));

/**
 * 32 Verified Canonical Module Keys
 * Derived from RolesPermissions.jsx, MODULES_LIST.md, and seed.js
 */
export const CANONICAL_MODULE_KEYS = Object.freeze([
  'classes',
  'subjects',
  'students',
  'staff',
  'chats',
  'homework',
  'leaves',
  'lesson_plans',
  'resources',
  'ptm',
  'performance',
  'timetables',
  'transport',
  'library',
  'exams',
  'noticeboard',
  'media',
  'hr-payroll',
  'attendance',
  'calendar',
  'fees',
  'hostel',
  'inventory',
  'health',
  'complaints',
  'alumni',
  'documents',
  'branches',
  'reports',
  'leads',
  'form-builder',
  'billing'
]);

export const CANONICAL_MODULE_SET = new Set(CANONICAL_MODULE_KEYS);

export const LOGIN_PANELS = Object.freeze({
  ADMIN: 'admin',
  TEACHER: 'teacher'
});

export const VALID_LOGIN_PANELS = Object.freeze(['admin', 'teacher']);

/**
 * Deterministic Role Slugification Utility
 *
 * Requirements:
 * - lowercase
 * - trim whitespace
 * - replace separators/special characters with hyphen '-'
 * - collapse repeated hyphens
 * - remove leading/trailing hyphens
 * - prevent empty slug
 * - respect maximum database length (100 characters)
 *
 * @param {string} name - Role display name
 * @returns {string} Deterministic slug
 * @throws {ValidationError} If name is missing or results in an empty slug
 */
export function slugifyRoleName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new ValidationError('Role name is required and must be a non-empty string');
  }

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '') // remove apostrophes
    .replace(/[^a-z0-9]+/g, '-') // convert non-alphanumeric to hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .slice(0, 100);

  if (!slug) {
    throw new ValidationError(`Role name '${name}' cannot be converted to a valid slug`);
  }

  return slug;
}

/**
 * Normalizes permission inputs according to strict RBAC dependency invariants:
 * 1. If canCreate, canEdit, or canDelete is true -> canRead MUST be true.
 * 2. If canRead is false -> canCreate, canEdit, and canDelete MUST be false.
 *
 * @param {Object|Array} permissionsInput - Map of module permissions or array of permission objects
 * @returns {Array<{ moduleKey: string, canRead: boolean, canCreate: boolean, canEdit: boolean, canDelete: boolean }>}
 */
export function normalizePermissions(permissionsInput) {
  if (!permissionsInput) return [];

  const normalizedList = [];

  // Case A: Object map { [moduleKey]: { read/canRead, create/canCreate, edit/canEdit, delete/canDelete } }
  if (!Array.isArray(permissionsInput) && typeof permissionsInput === 'object') {
    for (const [key, perm] of Object.entries(permissionsInput)) {
      if (!perm || typeof perm !== 'object') continue;

      const rawRead = Boolean(perm.canRead ?? perm.read);
      const rawCreate = Boolean(perm.canCreate ?? perm.create);
      const rawEdit = Boolean(perm.canEdit ?? perm.edit);
      const rawDelete = Boolean(perm.canDelete ?? perm.delete);

      let canRead = rawRead;
      let canCreate = rawCreate;
      let canEdit = rawEdit;
      let canDelete = rawDelete;

      // Invariant 1: Any write action implies read
      if (canCreate || canEdit || canDelete) {
        canRead = true;
      }

      // Invariant 2: read = false clears all write actions
      if (!canRead) {
        canCreate = false;
        canEdit = false;
        canDelete = false;
      }

      normalizedList.push({
        moduleKey: String(key).trim(),
        canRead,
        canCreate,
        canEdit,
        canDelete
      });
    }
    return normalizedList;
  }

  // Case B: Array of permission objects
  if (Array.isArray(permissionsInput)) {
    for (const item of permissionsInput) {
      if (!item || typeof item !== 'object' || !item.moduleKey) continue;

      const rawRead = Boolean(item.canRead ?? item.read);
      const rawCreate = Boolean(item.canCreate ?? item.create);
      const rawEdit = Boolean(item.canEdit ?? item.edit);
      const rawDelete = Boolean(item.canDelete ?? item.delete);

      let canRead = rawRead;
      let canCreate = rawCreate;
      let canEdit = rawEdit;
      let canDelete = rawDelete;

      if (canCreate || canEdit || canDelete) {
        canRead = true;
      }

      if (!canRead) {
        canCreate = false;
        canEdit = false;
        canDelete = false;
      }

      normalizedList.push({
        moduleKey: String(item.moduleKey).trim(),
        canRead,
        canCreate,
        canEdit,
        canDelete
      });
    }
    return normalizedList;
  }

  return normalizedList;
}
