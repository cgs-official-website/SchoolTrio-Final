import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CacheService } from '../services/CacheService';
import { getAccessToken, setAccessToken, clearAccessToken, subscribeToToken } from '../services/tokenService';
import { authApi } from '../api/auth';
import { normalizeAuthUser } from '../utils/userAdapter';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || 'HYBRID_BRIDGE';

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Session restoration and listener initialization
  useEffect(() => {
    let isMounted = true;

    // PostgreSQL REST session restoration authority (HYBRID_BRIDGE & NATIVE_REST)
    const restoreSession = async () => {
      try {
        const existingToken = getAccessToken();

        if (existingToken) {
          const meRes = await authApi.getMe();
          const userData = meRes?.data?.user || meRes?.data;
          if (userData && isMounted) {
            const normalized = normalizeAuthUser(userData);
            setCurrentUser({ uid: normalized.uid, email: normalized.email, ...normalized });
            setUserProfile(normalized);
            setLoading(false);
            return;
          }
        }

        // Try rotating HttpOnly refresh cookie
        const refreshRes = await authApi.refreshSession();
        const newAccessToken = refreshRes?.data?.accessToken;
        if (newAccessToken) {
          setAccessToken(newAccessToken);
          const meRes = await authApi.getMe();
          const userData = meRes?.data?.user || meRes?.data;
          if (userData && isMounted) {
            const normalized = normalizeAuthUser(userData);
            setCurrentUser({ uid: normalized.uid, email: normalized.email, ...normalized });
            setUserProfile(normalized);
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        // No active session or refresh expired
        clearAccessToken();
        if (isMounted) {
          setCurrentUser(null);
          setUserProfile(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    restoreSession();

    // Subscribe to token changes (e.g., cleared by 401 refresh failure)
    const unsubToken = subscribeToToken((token) => {
      if (!token && isMounted) {
        setCurrentUser(null);
        setUserProfile(null);
      }
    });

    return () => {
      isMounted = false;
      unsubToken();
    };
  }, []);

  /**
   * Helper: HYBRID_BRIDGE Institutional Login (Staff / Admin / Teacher)
   * Active institutional login path while 37 operational Firebase accounts remain.
   * Performs Firebase Auth authentication -> D5 JIT password upgrade token exchange -> REST session.
   */
  const _hybridBridgeLogin = async (identifier, password) => {
    // 1. Authenticate with Firebase Auth (dynamically imported)
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    const { auth } = await import('../firebase/config');
    const userCredential = await signInWithEmailAndPassword(auth, identifier, password);
    const idToken = await userCredential.user.getIdToken();

    // 2. Exchange Firebase ID Token for PostgreSQL JWT + Refresh Session (D5 JIT support)
    const exchangeRes = await authApi.firebaseExchange({ idToken, password });
    const token = exchangeRes.data?.accessToken;
    if (!token) throw new Error('No access token received from Firebase exchange.');
    setAccessToken(token);

    // 3. Fetch authoritative user & tenant details
    const meRes = await authApi.getMe();
    const userData = meRes?.data?.user || meRes?.data || exchangeRes.data?.user;
    const normalized = normalizeAuthUser(userData);

    setCurrentUser({ uid: normalized.uid, email: normalized.email, ...normalized });
    setUserProfile(normalized);
    return { user: normalized, profile: normalized };
  };

  /**
   * Helper: Native REST Institutional Login (Target Path)
   * Isolated backend-native implementation for eventual cutover after 37-account gate reaches zero.
   * Direct POST /api/v1/auth/login -> REST session.
   */
  const _nativeInstitutionalLogin = async (identifier, password) => {
    const res = await authApi.login({ identifier, password });
    const token = res.data?.accessToken;
    if (!token) throw new Error('No access token received from native login.');
    setAccessToken(token);

    const meRes = await authApi.getMe();
    const userData = meRes?.data?.user || meRes?.data || res.data?.user;
    const normalized = normalizeAuthUser(userData);

    setCurrentUser({ uid: normalized.uid, email: normalized.email, ...normalized });
    setUserProfile(normalized);
    return { user: normalized, profile: normalized };
  };

  /**
   * Unified login function supporting both Native Parent Admission login and Institutional login.
   */
  const loginWithCredentials = useCallback(async ({ identifier, password, schoolCode, isAdmission }) => {
    // 1. Native Admission Login for Parents (when schoolCode is explicitly provided)
    if (schoolCode || (isAdmission && schoolCode)) {
      const res = await authApi.admissionLogin({
        schoolCode,
        admissionNumber: identifier,
        password
      });

      const token = res.data?.accessToken;
      if (!token) throw new Error('No access token received from admission login.');
      setAccessToken(token);

      const meRes = await authApi.getMe();
      const userData = meRes?.data?.user || meRes?.data || res.data?.user;
      const normalized = normalizeAuthUser(userData);

      setCurrentUser({ uid: normalized.uid, email: normalized.email, ...normalized });
      setUserProfile(normalized);
      return { user: normalized, profile: normalized };
    }

    // 2. Institutional Login (SuperAdmin / Staff / Admin / Teacher)
    // 100% Native REST JWT authentication (POST /api/v1/auth/login).
    return await _nativeInstitutionalLogin(identifier, password);
  }, []);

  /**
   * Unified logout handler terminating both backend and Firebase sessions.
   */
  const logoutUser = useCallback(async () => {
    // Revoke backend session, clear access token & state, sign out Firebase
    try {
      await authApi.logout();
    } catch (err) {
      console.warn('[AUTH BRIDGE] Backend logout failed or unreachable:', err);
    } finally {
      clearAccessToken();
      setCurrentUser(null);
      setUserProfile(null);
      try {
        CacheService?.clearTenant?.();
      } catch {
        // ignore cache clearing failure
      }
    }
  }, []);

  /**
   * Refreshes the active user profile from PostgreSQL authority via GET /api/v1/auth/me.
   */
  const updateProfileData = useCallback(async () => {
    try {
      const meRes = await authApi.getMe();
      const userData = meRes?.data?.user || meRes?.data;
      if (userData) {
        const normalized = normalizeAuthUser(userData);
        setCurrentUser({ uid: normalized.uid, email: normalized.email, ...normalized });
        setUserProfile(normalized);
      }
    } catch (error) {
      console.error('[AUTH BRIDGE] Error refreshing profile:', error);
    }
  }, []);

  const value = {
    currentUser,
    userProfile,
    loading,
    authMode: AUTH_MODE,
    loginWithCredentials,
    logoutUser,
    logout: logoutUser,
    updateProfileData,
    refreshUser: updateProfileData
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
