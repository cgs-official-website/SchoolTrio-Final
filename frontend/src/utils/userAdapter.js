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
    case 'TENANT_USER':
      role = 'teacher';
      break;
    case 'PARENT':
      role = 'parent';
      break;
    case 'STUDENT':
      role = 'student';
      break;
    case 'STAFF':
    default:
      role = 'staff';
      break;
  }

  return {
    id: backendUser.id,
    uid: backendUser.id, // For backward compatibility with Firestore-referencing components
    email: backendUser.email || '',
    name: backendUser.staffProfile?.name || backendUser.parentProfile?.name || backendUser.email?.split('@')[0] || 'User',
    role,
    systemRole: backendUser.systemRole,
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
