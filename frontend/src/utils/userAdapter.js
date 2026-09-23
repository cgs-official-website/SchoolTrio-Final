/**
 * src/utils/userAdapter.js
 *
 * Normalizes backend PostgreSQL User payload into the frontend userProfile shape.
 * Preserves compatibility with existing components without fabricating values.
 */

/**
 * Normalizes backend User DTO to frontend userProfile contract.
 * @param {Object|null} backendUser - User object from /auth/me or login response
 * @returns {Object|null} Normalized user profile
 */
export const normalizeAuthUser = (backendUser) => {
  if (!backendUser || typeof backendUser !== 'object') {
    return null;
  }

  const rawRole = (backendUser.systemRole || '').toUpperCase();

  // Normalize systemRole to frontend role convention
  let role = 'staff';
  switch (rawRole) {
    case 'SUPER_ADMIN':
      role = 'superadmin';
      break;
    case 'SCHOOL_ADMIN':
    case 'TENANT_ADMIN':
    case 'ADMIN':
    case 'PRINCIPAL':
      role = 'admin';
      break;
    case 'TEACHER':
      role = 'teacher';
      break;
    case 'PARENT':
      role = 'parent';
      break;
    case 'STUDENT':
      role = 'student';
      break;
    case 'STAFF':
    case 'TENANT_USER':
    default:
      if (backendUser.staffProfile?.staffType === 'teaching') {
        role = 'teacher';
      } else {
        role = 'staff';
      }
      break;
  }

  // Extract role assignments and target loginPanel
  const roleAssignments = Array.isArray(backendUser.roleAssignments) ? backendUser.roleAssignments : [];
  const assignedRoles = roleAssignments.map(ra => ra.schoolRole?.name).filter(Boolean);
  const primaryRoleAssignment = roleAssignments[0]?.schoolRole;

  let loginPanel = primaryRoleAssignment?.loginPanel || null;
  if (!loginPanel) {
    if (role === 'admin' || role === 'superadmin') {
      loginPanel = 'admin';
    } else if (role === 'teacher' || role === 'staff') {
      loginPanel = 'teacher';
    } else if (role === 'parent') {
      loginPanel = 'parent';
    } else if (role === 'student') {
      loginPanel = 'student';
    } else {
      loginPanel = 'teacher';
    }
  }

  return {
    id: backendUser.id,
    uid: backendUser.id, // For backward compatibility with Firestore-referencing components
    email: backendUser.email || '',
    name: backendUser.staffProfile?.name || backendUser.parentProfile?.name || backendUser.email?.split('@')[0] || 'User',
    role,
    systemRole: backendUser.systemRole,
    loginPanel,
    roles: assignedRoles.length > 0 ? assignedRoles : [backendUser.staffProfile?.designation || role],
    roleAssignments,
    schoolId: backendUser.schoolId || null,
    schoolName: backendUser.school?.name || null,
    schoolCode: backendUser.school?.code || null,
    schoolStatus: backendUser.school?.status || null,
    tokenVersion: backendUser.tokenVersion,
    isActive: backendUser.isActive !== false,
    // Optional sub-profiles from backend
    staffProfile: backendUser.staffProfile || null,
    parentProfile: backendUser.parentProfile || null
  };
};

export default normalizeAuthUser;
