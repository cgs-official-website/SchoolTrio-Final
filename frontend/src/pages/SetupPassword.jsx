import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { LuEye as Eye, LuEyeOff as EyeOff, LuArrowLeft as ArrowLeft } from 'react-icons/lu';
import { FiLoader as Loader, FiCheckCircle as CheckCircle, FiAlertTriangle as AlertTriangle } from 'react-icons/fi';
import authApi from '../api/auth';

export default function SetupPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reducedMotion = useReducedMotion();

  const rawToken = searchParams.get('token');
  const token = rawToken ? rawToken.trim() : '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Password Policy Checks
  const hasMinLength = password.length >= 8 && password.length <= 128;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isPolicyMet = hasMinLength && hasUppercase && hasLowercase && hasNumber;
  const doPasswordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      setError('A valid invitation setup token is required.');
      return;
    }

    if (!isPolicyMet) {
      setError('Password must meet all complexity requirements.');
      return;
    }

    if (!doPasswordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authApi.passwordSetupConfirm({
        token,
        newPassword: password
      });
      setSuccess(true);
    } catch (err) {
      console.error('[SETUP PASSWORD ERROR]', err);
      if (err.status === 401 || err.code === 'INVALID_TOKEN') {
        setError('This invitation link is invalid, expired, or has already been used. Please contact your school administrator.');
      } else if (err.status === 429) {
        setError('Too many attempts. Please wait a few moments before trying again.');
      } else if (err.status === 400) {
        setError(err.message || 'Password does not meet complexity requirements.');
      } else {
        setError(err.message || 'Unable to set up password. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-sans selection:bg-primary-500 selection:text-white flex flex-col items-center justify-center relative overflow-hidden px-4">
      
      {/* Background Ambiance */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-200 rounded-full blur-[120px] opacity-40 pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary-300 rounded-full blur-[100px] opacity-30 pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: reducedMotion ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        <div className="mb-8 flex flex-col items-center">
          <Link to="/" className="inline-flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-primary-500 rounded-lg p-1">
            <img src="/logo.png" alt="School Logo" className="w-auto h-12 object-contain group-hover:scale-105 transition-transform drop-shadow-sm filter invert" />
          </Link>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Account Setup</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 text-center">
            {token ? 'Set up a secure password to activate your school account.' : 'Account setup link is invalid or incomplete.'}
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-slate-200 dark:border-slate-700 shadow-[0_8px_32px_rgba(0,0,0,0.05)] rounded-3xl p-8 sm:p-10">
          {!token ? (
            /* Missing Token State */
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-amber-400/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Invalid Setup Link</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                No setup token was detected. Please check your invitation email or contact your school administrator to request a new invitation.
              </p>
              <button 
                onClick={() => navigate('/login')}
                className="w-full py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Return to Login
              </button>
            </div>
          ) : success ? (
            /* Success State */
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-16 h-16 bg-emerald-400/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Account Ready!</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                Your account password has been successfully configured. You can now log in using your email and password.
              </p>
              <button 
                onClick={() => navigate('/login')}
                className="w-full py-4 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity shadow-[0_4px_14px_rgba(229,189,223,0.4)] focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                Log In Now
              </button>
            </motion.div>
          ) : (
            /* Setup Form */
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* New Password Input */}
              <div className="relative group">
                <input 
                  type={showPassword ? 'text' : 'password'}
                  id="setupPassword" 
                  name="setupPassword"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className="w-full px-5 py-4 pr-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none peer text-slate-900 dark:text-white placeholder-transparent disabled:opacity-50" 
                  placeholder="Set Password" 
                  disabled={loading}
                  required 
                />
                <label 
                  htmlFor="setupPassword" 
                  className="absolute left-5 -top-2.5 bg-white dark:bg-slate-900 px-1 text-sm font-bold text-slate-500 dark:text-slate-400 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-4 peer-focus:-top-2.5 peer-focus:text-sm peer-focus:text-primary-600 cursor-text"
                >
                  Set Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Confirm Password Input */}
              <div className="relative group">
                <input 
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmSetupPassword" 
                  name="confirmSetupPassword"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  className="w-full px-5 py-4 pr-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none peer text-slate-900 dark:text-white placeholder-transparent disabled:opacity-50" 
                  placeholder="Confirm Password" 
                  disabled={loading}
                  required 
                />
                <label 
                  htmlFor="confirmSetupPassword" 
                  className="absolute left-5 -top-2.5 bg-white dark:bg-slate-900 px-1 text-sm font-bold text-slate-500 dark:text-slate-400 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:top-4 peer-focus:-top-2.5 peer-focus:text-sm peer-focus:text-primary-600 cursor-text"
                >
                  Confirm Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none p-1"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password Complexity Hints */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Password Requirements:</p>
                <div className="grid grid-cols-2 gap-1.5 text-slate-500 dark:text-slate-400">
                  <span className={hasMinLength ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                    • 8–128 characters
                  </span>
                  <span className={hasUppercase ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                    • 1 uppercase letter
                  </span>
                  <span className={hasLowercase ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                    • 1 lowercase letter
                  </span>
                  <span className={hasNumber ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                    • 1 digit number
                  </span>
                </div>
                {confirmPassword && (
                  <p className={`pt-1 border-t border-slate-200 dark:border-slate-700 mt-2 ${doPasswordsMatch ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-500'}`}>
                    {doPasswordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
                  </p>
                )}
              </div>

              {/* Error Display */}
              <motion.div 
                initial={false}
                animate={{ height: error ? 'auto' : 0, opacity: error ? 1 : 0 }}
                className="overflow-hidden"
              >
                <p className="text-red-500 text-sm font-medium text-center">{error}</p>
              </motion.div>

              {/* Submit Button */}
              <button 
                type="submit" 
                disabled={loading || !isPolicyMet || !doPasswordsMatch}
                className="w-full py-4 bg-gradient-to-r from-primary-600 to-primary-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity shadow-[0_4px_14px_rgba(229,189,223,0.4)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-primary-500 flex justify-center items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader className="animate-spin" size={20} /> Setting Up Password...
                  </>
                ) : (
                  'Complete Account Setup'
                )}
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 text-center">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors focus:outline-none focus:underline">
            <ArrowLeft size={16} /> Back to Login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
