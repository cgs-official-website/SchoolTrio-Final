import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { registerParent } from '../api/registration';
import { getPublicSchoolMeta } from '../api/settings';
import { LuUser as UserIcon, LuLock as LockIcon, LuHash as HashIcon, LuBuilding2, LuEye, LuEyeOff, LuMail as MailIcon, LuPhone as PhoneIcon, LuCalendar, LuHeart } from 'react-icons/lu';
import Captcha from '../components/Captcha';

export default function ParentRegistration() {
  const { schoolId } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    admissionNumber: '',
    dob: '',
    relationship: 'Father',
    password: ''
  });
  const [school, setSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState(null);
  const [captchaValid, setCaptchaValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const captchaRef = React.useRef(null);

  React.useEffect(() => {
    const fetchSchool = async () => {
      try {
        const res = await getPublicSchoolMeta(schoolId);
        if (res?.data) {
          setSchool(res.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSchool();
  }, [schoolId]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError(null);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!captchaValid) {
      setError("Please complete the verification code correctly.");
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(formData.password)) {
      setError("Password must be at least 8 characters and include uppercase, lowercase, number, and special character.");
      return;
    }

    if (formData.phone) {
      const cleanPhone = formData.phone.replace(/[\s\-\(\)]/g, '');
      const phoneRegex = /^(?:\+?91|0)?[1-9]\d{9}$/;
      if (!phoneRegex.test(cleanPhone)) {
        setError("Please enter a valid Indian phone number.");
        return;
      }
    }

    setIsRegistering(true);
    setError(null);
    try {
      const payload = {
        schoolId,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        phone: formData.phone ? formData.phone.trim() : undefined,
        admissionNumber: formData.admissionNumber.trim(),
        dob: formData.dob.trim(),
        relationship: formData.relationship.trim()
      };

      await registerParent(payload);

      navigate('/login', {
        state: {
          message: 'Registration successful! Please log in with your credentials.',
          email: formData.email
        }
      });
    } catch (err) {
      console.error('[ParentRegistration] Error:', err);
      setError(err.message || "Registration failed. Please check your details and try again.");
      if (captchaRef.current) captchaRef.current.regenerate();
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-sans selection:bg-primary-500 selection:text-white flex flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row h-auto md:h-[90vh] max-h-[850px] min-h-[600px] border border-slate-100 dark:border-slate-800">
        
        {/* Left Gradient Panel */}
        <div className="w-full md:w-1/2 p-4 hidden md:flex flex-col relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500 via-indigo-600 to-cyan-400 rounded-2xl m-4 z-0">
             <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/20 blur-[60px] rounded-full mix-blend-screen animate-pulse pointer-events-none"></div>
             <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-300/30 blur-[80px] rounded-full mix-blend-screen animate-[pulse_4s_ease-in-out_infinite_reverse] pointer-events-none"></div>
          </div>
          
          <div className="relative z-10 flex flex-col h-full justify-between p-8 text-white">
            <Link to="/" className="inline-flex items-center gap-2 group focus:outline-none focus:ring-2 focus:ring-white/50 rounded-lg w-max">
              <img src="/logo.png" alt="School Logo" className="w-auto h-10 object-contain drop-shadow-sm filter brightness-0 invert" />
            </Link>

            <div className="mt-auto">
              <p className="text-sm font-medium text-white/80 mb-2">Parent Registration</p>
              <h1 className="text-3xl lg:text-4xl font-bold leading-tight">
                Get access to your personal hub for clarity and productivity
              </h1>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="w-full md:w-1/2 p-6 sm:p-8 lg:p-10 flex flex-col bg-white dark:bg-slate-900 relative overflow-y-auto overflow-x-hidden custom-scrollbar">
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent mb-4"></div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">Loading form...</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Mobile Logo & School Branding */}
              <div className="flex items-center justify-between mb-6">
                {school && (
                  <div className="flex items-center gap-3">
                    {(school.logoUrl || school.branding?.logoUrl) ? (
                      <img src={school.logoUrl || school.branding?.logoUrl} alt="School Logo" className="h-10 w-auto object-contain" />
                    ) : (
                      <div className="h-10 w-10 bg-primary-50 rounded-lg flex items-center justify-center text-primary-600">
                        <LuBuilding2 size={20} />
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">{school.schoolName || school.name}</h2>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Parent Portal</p>
                    </div>
                  </div>
                )}
                <div className="md:hidden">
                  <Link to="/">
                    <img src="/logo.png" alt="School Logo" className="w-auto h-8 object-contain" />
                  </Link>
                </div>
              </div>

              <div className="mb-6">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">Create Parent Account</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Connect with your student's school, view performance, attendance, fees, and circulars.</p>
              </div>

              {error && (
                <div className="w-full mb-4 p-3 bg-red-50 text-red-600 text-xs font-medium rounded-lg border border-red-100">
                  {error}
                </div>
              )}

              <form className="w-full space-y-3" onSubmit={handleRegister}>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Full Name</label>
                    <input
                      name="name"
                      type="text"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-white text-sm disabled:opacity-50 placeholder-slate-400 dark:placeholder-slate-500"
                      placeholder="John Doe"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Email Address</label>
                      <input
                        name="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-white text-sm disabled:opacity-50 placeholder-slate-400 dark:placeholder-slate-500"
                        placeholder="parent@example.com"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Phone Number (Optional)</label>
                      <input
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-white text-sm disabled:opacity-50 placeholder-slate-400 dark:placeholder-slate-500"
                        placeholder="9876543210"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Student Admission No.</label>
                      <input
                        name="admissionNumber"
                        type="text"
                        required
                        value={formData.admissionNumber}
                        onChange={handleChange}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-white text-sm disabled:opacity-50 placeholder-slate-400 dark:placeholder-slate-500"
                        placeholder="ADM-001"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Student Date of Birth</label>
                      <input
                        name="dob"
                        type="date"
                        required
                        value={formData.dob}
                        onChange={handleChange}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-white text-sm disabled:opacity-50 placeholder-slate-400 dark:placeholder-slate-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Relationship</label>
                      <select
                        name="relationship"
                        required
                        value={formData.relationship}
                        onChange={handleChange}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-white text-sm disabled:opacity-50"
                      >
                        <option value="Father">Father</option>
                        <option value="Mother">Mother</option>
                        <option value="Guardian">Guardian</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">Password</label>
                      <div className="relative">
                        <input
                          name="password"
                          type={showPassword ? "text" : "password"}
                          required
                          value={formData.password}
                          onChange={handleChange}
                          className="w-full px-3.5 py-2.5 pr-10 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all outline-none text-slate-900 dark:text-white text-sm disabled:opacity-50 placeholder-slate-400 dark:placeholder-slate-500"
                          placeholder="••••••••"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none">
                          {showPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-1">
                  <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <Captcha ref={captchaRef} onChange={setCaptchaValid} />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="w-full flex justify-center items-center py-3 px-4 rounded-lg shadow-md text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRegistering ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        <span>Creating Account...</span>
                      </div>
                    ) : (
                      'Complete Registration'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
