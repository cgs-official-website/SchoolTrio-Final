import { clearAccessToken } from "../services/tokenService";
import { authApi } from "../api/auth";

/**
 * src/firebase/auth.js
 * 
 * Institutional authentication functions (registerUser, loginUser, loginWithAdmissionNumber, 
 * getUserProfile, resetPassword, logoutUser) have been decommissioned and migrated to 
 * AuthContext.jsx and REST endpoints (/api/v1/auth/*).
 * 
 * Note:
 * - Support Tickets continue to use their isolated Firebase project configuration.
 * - Firebase Storage fallbacks operate independently via services/cloudinary.js.
 */

