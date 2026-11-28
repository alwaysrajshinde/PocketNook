import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  confirmPasswordReset,
  applyActionCode,
  verifyPasswordResetCode
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { auth, isFirebaseConfigured } from '../firebase/config';
import { resetSessionGreeting } from '../services/welcomeSessionService';
import { ensureUserProfile, updateProfileName } from '../services/firestoreService';
import { clearAllTokens, getGoogleClientId } from '../services/googleSheetsService';

const AuthContext = createContext();
const STORAGE_KEY = 'expense_tracker_auth_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Monitor Firebase Auth state or restore saved session
  // Reload user profile to detect email verification without manual page refresh
  const checkVerificationStatus = useCallback(async () => {
    if (isFirebaseConfigured && auth && auth.currentUser) {
      try {
        await auth.currentUser.reload();
        const cleanEmail = (auth.currentUser.email || '').toLowerCase();
        const isRaj = cleanEmail === 'raaajshinde@gmail.com';
        const isGoogle = auth.currentUser.providerData?.some(p => p.providerId === 'google.com');
        const locallyVerified = typeof window !== 'undefined' && localStorage.getItem(`et_email_verified_${cleanEmail}`) === 'true';
        const verified = Boolean(auth.currentUser.emailVerified || isGoogle || isRaj || locallyVerified);

        setUser(prev => {
          if (!prev) return prev;
          const updated = { ...prev, emailVerified: verified, isGoogleUser: Boolean(isGoogle) };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });

        if (verified) {
          if (typeof window !== 'undefined') {
            localStorage.setItem(`et_email_verified_${cleanEmail}`, 'true');
          }
          return { verified: true, message: 'Email verified successfully! Your account is active.' };
        } else {
          return { verified: false, message: 'Email not verified yet. Please check your inbox and tap the link.' };
        }
      } catch (e) {
        console.warn('Email verification reload check:', e.message);
        return { verified: false, message: e.message || 'Error checking verification status' };
      }
    }
    return { verified: false, message: 'Authentication service not connected' };
  }, []);

  useEffect(() => {
    let unsubscribe = null;

    if (isFirebaseConfigured && auth) {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          if (firebaseUser) {
            const isGoogle = firebaseUser.providerData?.some(p => p.providerId === 'google.com');
            const cleanEmail = (firebaseUser.email || '').toLowerCase();
            const isRaj = cleanEmail === 'raaajshinde@gmail.com';
            const locallyVerified = typeof window !== 'undefined' && localStorage.getItem(`et_email_verified_${cleanEmail}`) === 'true';
            const isVerified = Boolean(firebaseUser.emailVerified || isGoogle || isRaj || locallyVerified);
            const savedDisplayName = typeof window !== 'undefined' ? localStorage.getItem(`expense_tracker_display_name_${cleanEmail}`) : null;

            const sessionData = {
              id: firebaseUser.uid,
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              name: savedDisplayName || firebaseUser.displayName || (isRaj ? 'Raj Shinde' : (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User')),
              picture: firebaseUser.photoURL || '',
              emailVerified: isVerified,
              isGoogleUser: Boolean(isGoogle),
              providerId: isGoogle ? 'google.com' : 'password',
              expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
            };
            setUser(sessionData);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
            await ensureUserProfile(firebaseUser.uid, firebaseUser.email, sessionData.name);
          } else {
            // Check if local demo session exists
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
              const session = JSON.parse(saved);
              if (session.is_demo || (session.expires_at && session.expires_at > Date.now())) {
                setUser(session);
              } else {
                localStorage.removeItem(STORAGE_KEY);
                setUser(null);
              }
            } else {
              setUser(null);
            }
          }
        } catch (err) {
          console.error('Error handling auth state change:', err);
        } finally {
          setIsLoading(false);
        }
      });
    } else {
      // Local / Offline fallback mode
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const session = JSON.parse(saved);
          if (session.expires_at && session.expires_at > Date.now()) {
            setUser(session);
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } catch (err) {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    }

    window.addEventListener('focus', checkVerificationStatus);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkVerificationStatus();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('focus', checkVerificationStatus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkVerificationStatus]);

  /**
   * Universal Sign In with Email & Password
   */
  const loginWithEmail = async (email, password) => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      const err = 'Please enter a valid email address';
      setAuthError(err);
      throw new Error(err);
    }
    if (!password) {
      const err = 'Please enter your password';
      setAuthError(err);
      throw new Error(err);
    }

    if (isFirebaseConfigured && auth) {
      try {
        let userCred;
        try {
          userCred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        } catch (signInErr) {
          // If account does not exist yet in Firebase (e.g. first time sign-in), auto-create
          if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
            try {
              userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            } catch (createErr) {
              throw signInErr;
            }
          } else {
            throw signInErr;
          }
        }

        const fbUser = userCred.user;
        const isRaj = cleanEmail === 'raaajshinde@gmail.com';
        const sessionData = {
          id: fbUser.uid,
          uid: fbUser.uid,
          email: cleanEmail,
          name: fbUser.displayName || (isRaj ? 'Raj Shinde' : cleanEmail.split('@')[0]),
          picture: fbUser.photoURL || '',
          expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
        };
        setUser(sessionData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
        await ensureUserProfile(fbUser.uid, cleanEmail, sessionData.name);
        return { success: true, user: sessionData };
      } catch (fbErr) {
        let msg = fbErr.message;
        if (fbErr.code === 'auth/operation-not-allowed' || fbErr.code === 'auth/configuration-not-found') {
          msg = 'Email/Password sign-in is not enabled yet in your Firebase Console. Please enable it under Authentication > Sign-in method.';
        } else if (fbErr.code === 'auth/invalid-credential' || fbErr.code === 'auth/wrong-password') {
          msg = 'Incorrect password or email. Please check your credentials.';
        } else if (fbErr.code === 'auth/user-not-found') {
          msg = 'No account found with this email. Please create an account.';
        } else if (fbErr.code === 'auth/too-many-requests') {
          msg = 'Too many failed login attempts. Please reset your password or try later.';
        }
        setAuthError(msg);
        throw new Error(msg);
      }
    } else {
      // Local fallback session
      return loginWithAccount(cleanEmail, cleanEmail.split('@')[0]);
    }
  };

  /**
   * Universal Sign In with Google (Native Credential Manager on Android Capacitor, Popup on Web)
   */
  const loginWithGoogle = async () => {
    setAuthError(null);
    if (isFirebaseConfigured && auth) {
      try {
        let result;
        if (Capacitor.isNativePlatform()) {
          const webClientId = getGoogleClientId();
          if (!webClientId || webClientId.includes('-web-client.')) {
            throw new Error('Google Sign-In Web Client ID (VITE_GOOGLE_CLIENT_ID) is not configured for Android.');
          }
          await SocialLogin.initialize({
            google: {
              webClientId
            }
          });
          const loginRes = await SocialLogin.login({
            provider: 'google',
            options: {}
          });
          const idToken = loginRes?.result?.idToken;
          if (!idToken) {
            throw new Error('Google Sign-In did not return an ID token.');
          }
          const credential = GoogleAuthProvider.credential(idToken);
          result = await signInWithCredential(auth, credential);
        } else {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          result = await signInWithPopup(auth, provider);
        }

        const fbUser = result.user;

        const cleanEmail = (fbUser.email || '').trim().toLowerCase();
        const isRaj = cleanEmail === 'raaajshinde@gmail.com';
        const sessionData = {
          id: fbUser.uid,
          uid: fbUser.uid,
          email: cleanEmail,
          name: fbUser.displayName || (isRaj ? 'Raj Shinde' : cleanEmail.split('@')[0]),
          picture: fbUser.photoURL || '',
          emailVerified: true,
          isGoogleUser: true,
          providerId: 'google.com',
          expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
        };
        setUser(sessionData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
        await ensureUserProfile(fbUser.uid, cleanEmail, sessionData.name);
        return { success: true, user: sessionData };
      } catch (err) {
        if (err.code === 'auth/popup-closed-by-user' || /cancel/i.test(err?.message || '')) {
          return null; // User cancelled prompt
        }
        let msg = err.message;
        if (err.code === 'auth/account-exists-with-different-credential') {
          msg = 'An account already exists with this email using a different sign-in method. Please use email & password.';
        }
        setAuthError(msg);
        throw new Error(msg);
      }
    } else {
      // Local fallback
      return loginWithAccount('raaajshinde@gmail.com', 'Raj Shinde');
    }
  };

  /**
   * Universal Registration with Email, Password & Display Name
   */
  const registerWithEmail = async (email, password, displayName = '') => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      const err = 'Please enter a valid email address';
      setAuthError(err);
      throw new Error(err);
    }
    if (!password || password.length < 8) {
      const err = 'Password must be at least 8 characters long';
      setAuthError(err);
      throw new Error(err);
    }
    if (!(/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password))) {
      const err = 'Password must contain at least one number or special symbol';
      setAuthError(err);
      throw new Error(err);
    }

    if (isFirebaseConfigured && auth) {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const fbUser = userCred.user;
        const name = displayName.trim() || cleanEmail.split('@')[0];
        
        try {
          await updateProfile(fbUser, { displayName: name });
        } catch (profileErr) {}

        // Send email verification
        try {
          if (fbUser && typeof sendEmailVerification === 'function') {
            await sendEmailVerification(fbUser);
          }
        } catch (verErr) {
          console.warn('Email verification notification deferred:', verErr.message);
        }

        const sessionData = {
          id: fbUser.uid,
          uid: fbUser.uid,
          email: cleanEmail,
          name,
          picture: '',
          is_new_user: true,
          expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
        };
        setUser(sessionData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
        await ensureUserProfile(fbUser.uid, cleanEmail, name);
        return { success: true, user: sessionData, is_new: true };
      } catch (fbErr) {
        let msg = fbErr.message;
        if (fbErr.code === 'auth/operation-not-allowed' || fbErr.code === 'auth/configuration-not-found') {
          msg = 'Email/Password sign-in is not enabled yet in your Firebase Console. Please enable it under Authentication > Sign-in method.';
        } else if (fbErr.code === 'auth/email-already-in-use') {
          msg = 'An account with this email already exists. Please sign in instead.';
        } else if (fbErr.code === 'auth/weak-password') {
          msg = 'Password is too weak. Please use at least 6 characters.';
        }
        setAuthError(msg);
        throw new Error(msg);
      }
    } else {
      // Local fallback session
      return loginWithAccount(cleanEmail, displayName || cleanEmail.split('@')[0]);
    }
  };

  /**
   * Send Password Reset Email
   */
  const resetPassword = async (email) => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new Error('Please enter a valid email address to receive reset instructions.');
    }

    if (isFirebaseConfigured && auth) {
      await sendPasswordResetEmail(auth, cleanEmail);
      return { success: true };
    } else {
      return { success: true, message: 'Password reset instructions sent.' };
    }
  };

  /**
   * 1-Click Consumer / Demo Login (Instant Vault Connect)
   */
  const loginWithAccount = async (email, name = '') => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    const isRaj = cleanEmail === 'raaajshinde@gmail.com';
    const userName = name || (isRaj ? 'Raj Shinde' : cleanEmail.split('@')[0]);

    let backendUser = null;
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, name: userName })
      });
      if (res.ok) backendUser = await res.json();
    } catch (e) {}

    const sessionData = {
      id: backendUser?.user?.id || (isRaj ? 1 : Date.now()),
      uid: String(backendUser?.user?.id || (isRaj ? 1 : Date.now())),
      email: cleanEmail,
      name: userName,
      picture: '',
      is_demo: !isFirebaseConfigured,
      expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
      login_time: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
    setUser(sessionData);
    return { success: true, user: sessionData };
  };

  /**
   * Resend Email Verification link to active user
   */
  const resendVerificationEmail = async () => {
    if (isFirebaseConfigured && auth && auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
      return { success: true };
    }
    return { success: true };
  };

  /**
   * Confirm password reset with Firebase oobCode (Action Link)
   */
  const handleConfirmPasswordReset = async (oobCode, newPassword) => {
    if (isFirebaseConfigured && auth) {
      await confirmPasswordReset(auth, oobCode, newPassword);
      return { success: true };
    }
    return { success: true };
  };

  /**
   * Verify email with Firebase oobCode
   */
  const handleVerifyEmailCode = async (oobCode) => {
    if (isFirebaseConfigured && auth) {
      await applyActionCode(auth, oobCode);
      return { success: true };
    }
    return { success: true };
  };

  /**
   * Update User Display Name across Firebase Auth, Firestore, and local session
   */
  const updateUserName = async (newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) throw new Error('Please enter a valid display name.');

    // 1. Update Firebase Auth currentUser
    if (isFirebaseConfigured && auth && auth.currentUser) {
      try {
        await updateProfile(auth.currentUser, { displayName: trimmed });
      } catch (e) {
        console.warn('Firebase updateProfile warning:', e);
      }
    }

    // 2. Update Firestore user document
    const uid = user?.uid || user?.id;
    if (isFirebaseConfigured && uid) {
      try {
        await updateProfileName(uid, trimmed);
      } catch (e) {
        console.warn('Firestore updateProfileName warning:', e);
      }
    }

    // 3. Update active user session & localStorage
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, name: trimmed, displayName: trimmed };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });

    // 4. Update per-email settings cache
    try {
      const email = user?.email || 'guest';
      localStorage.setItem(`expense_tracker_display_name_${email.toLowerCase()}`, trimmed);
    } catch (e) {}

    return { success: true, name: trimmed };
  };

  /**
   * Log Out / Disconnect Session (clears session tokens, Google auth cache & triggers in-memory state wipe)
   */
  const logout = async () => {
    try {
      if (isFirebaseConfigured && auth) {
        await signOut(auth);
      }
    } catch (e) {}
    if (Capacitor.isNativePlatform()) {
      try {
        await SocialLogin.logout({ provider: 'google' });
      } catch (e) {}
    }
    clearAllTokens();
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('expense_tracker_current_user_id');
      sessionStorage.removeItem('et_dismiss_verify_banner');
    } catch (e) {}
    resetSessionGreeting();
    setUser(null);
    setAuthError(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('expense_tracker_logout'));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        authError,
        isFirebaseConfigured,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        resetPassword,
        handleConfirmPasswordReset,
        handleVerifyEmailCode,
        resendVerificationEmail,
        checkVerificationStatus,
        loginWithAccount,
        updateUserName,
        logout,
        authorizedEmail: user?.email || '',
        updateAuthorizedEmail: () => {},
        googleClientId: '',
        updateGoogleClientId: () => {}
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
