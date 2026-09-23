import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Barangay, UserRole } from '@/types';
import { ROLE_LABELS } from '@/config/constants';
import { LOGIN_ROLES } from '@/lib/navigation';
import { getErrorMessage } from '@/lib/utils';
import {
  Eye, EyeOff, Loader2, ChevronDown, AlertCircle, Lock, ShieldCheck,
  Phone, Mail, User as UserIcon, MapPin, RefreshCw, CheckCircle2, ArrowLeft,
} from 'lucide-react';

const CODE_LENGTH = 6;

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Step = 'form' | 'otp' | 'done';

export default function RegisterPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    barangayId: '',
    role: 'user' as UserRole,
  });
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [openRegistration, setOpenRegistration] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // OTP state
  const [newUserId, setNewUserId] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [resendIn, setResendIn] = useState(60);
  const [otpError, setOtpError] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    supabase.from('barangays').select('*').order('name').then(({ data, error }) => {
      if (error) { setError(getErrorMessage(error, 'Failed to load barangays')); return; }
      if (data) setBarangays(data);
    });
  }, []);

  useEffect(() => {
    supabase.rpc('is_open_registration_enabled').then(({ data, error }) => {
      if (error) { return; }
      setOpenRegistration(data === true);
    });
  }, []);

  useEffect(() => {
    if (step === 'otp') {
      setDigits(Array(CODE_LENGTH).fill(''));
      setOtpError('');
      setSecondsLeft(600);
      setResendIn(60);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    }
  }, [step]);

  useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const setDigitAt = useCallback((index: number, value: string) => {
    setDigits((prev) => { const n = [...prev]; n[index] = value; return n; });
  }, []);

  const handleOtpChange = (index: number, raw: string) => {
    const val = raw.replace(/\D/g, '');
    if (!val) { setDigitAt(index, ''); return; }
    if (val.length > 1) {
      const chars = val.slice(0, CODE_LENGTH - index).split('');
      setDigits((prev) => {
        const n = [...prev];
        chars.forEach((c, i) => { n[index + i] = c; });
        return n;
      });
      inputs.current[Math.min(index + chars.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    setDigitAt(index, val);
    if (index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  // --- Create account + send OTP ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) { setError('Full name is required'); return; }
    if (!form.email.trim() || !form.email.includes('@')) { setError('A valid email address is required'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }

    // Phone is required for residents (their login ID)
    if (form.role === 'user' && !form.phone.trim()) {
      setError('Phone number is required for residents. It will be your login ID.');
      return;
    }

    setLoading(true);
    try {
      // Create the auth user
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.fullName.trim(),
          },
        },
      });
      if (signUpError) throw signUpError;

      // Complete registration with role, phone, etc.
      const { error: completeError } = await supabase.rpc('public_complete_registration', {
        p_role: form.role,
        p_full_name: form.fullName.trim(),
        p_phone: form.phone.trim(),
        p_barangay_id: form.barangayId || null,
      });
      if (completeError) throw completeError;

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Account was created but no session was established.');

      const userId = userData.user.id;
      setNewUserId(userId);

      // Generate OTP for verification
      const { data: otpData, error: otpErr } = await supabase.rpc(
        form.role === 'user' ? 'generate_login_otp' : 'generate_staff_login_otp',
        { p_user_id: userId }
      );
      if (otpErr) { setError(otpErr.message); setLoading(false); return; }

      const code = (otpData as { dev_otp?: string; error?: string }).dev_otp || null;
      if (!code) { /* OTP was generated but dev_otp not exposed; go straight to done */
        setStep('done');
        return;
      }

      setDevOtp(code);
      setStep('otp');
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Registration failed');
      setError(msg.includes('already registered') ? 'An account with this email already exists' : msg);
    } finally {
      setLoading(false);
    }
  };

  // --- Verify OTP ---
  const handleVerifyOtp = async () => {
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) { setOtpError('Enter all 6 digits'); return; }
    if (!newUserId) return;

    setOtpError('');
    setLoading(true);
    try {
      const fnName = form.role === 'user' ? 'verify_login_otp' : 'verify_staff_login_otp';
      const { data, error } = await supabase.rpc(fnName, {
        p_user_id: newUserId,
        p_otp: code,
      });
      if (error) throw error;
      const result = data as { ok?: boolean; error?: string };
      if (result?.error) throw new Error(result.error);

      setStep('done');
    } catch (err: unknown) {
      setOtpError(err instanceof Error ? err.message : 'Verification failed');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // --- Resend OTP ---
  const handleResend = async () => {
    if (resendIn > 0 || loading || !newUserId) return;
    setLoading(true);
    setOtpError('');
    try {
      const fnName = form.role === 'user' ? 'generate_login_otp' : 'generate_staff_login_otp';
      const { data, error } = await supabase.rpc(fnName, { p_user_id: newUserId });
      if (error) throw error;
      const result = data as { dev_otp?: string };
      if (result?.dev_otp) setDevOtp(result.dev_otp);
      setDigits(Array(CODE_LENGTH).fill(''));
      setSecondsLeft(600);
      setResendIn(60);
      inputs.current[0]?.focus();
    } catch (err: unknown) {
      setOtpError(err instanceof Error ? err.message : 'Could not resend code');
    } finally {
      setLoading(false);
    }
  };

  const isStaff = form.role !== 'user';
  const staffPrefix = form.role === 'super_admin' ? 'BC-SADM' : form.role === 'admin' ? 'BC-ADM' : form.role === 'health_worker' ? 'BC-HW' : '';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative"
      style={{ backgroundImage: 'url(/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 w-full max-w-lg">
        <div className="text-center mb-5">
          <img src="/logo.png" alt="BiteCare Logo" className="w-16 h-16 mx-auto mb-2 drop-shadow-lg" />
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white drop-shadow-md tracking-tight">BiteCare</h1>
          <p className="font-display text-white/85 text-xs sm:text-sm font-semibold mt-1.5 drop-shadow leading-snug max-w-xs mx-auto">
            Animal Bite Management &amp; Monitoring System
          </p>
          <p className="text-white/60 text-xs font-medium mt-1">Create your account</p>
        </div>

        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-7">
          {step === 'form' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Get started</h2>
              <p className="text-gray-500 text-sm mb-5">
                {isStaff ? 'Create your staff account' : 'Create your resident account'}
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Role selection */}
                {openRegistration ? (
                  <div>
                    <label htmlFor="registerRole" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                      <ShieldCheck className="w-4 h-4 text-primary-600" /> Account role
                    </label>
                    <div className="relative">
                      <select id="registerRole" value={form.role} onChange={set('role')} className="input-field appearance-none pr-10" required>
                        {LOGIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                    {isStaff && (
                      <p className="text-xs text-primary-700 bg-primary-50 border border-primary-200 rounded-lg px-2.5 py-2 mt-2">
                        Your staff ID will be generated automatically (e.g., {staffPrefix}-XXXXXX). You will use this ID to log in.
                      </p>
                    )}
                    {!isStaff && (
                      <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-2.5 py-2 mt-2">
                        As a resident, your phone number will be your login ID. Make sure it is correct.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Account role</label>
                    <div className="relative">
                      <input type="text" value="Resident" readOnly disabled className="input-field bg-gray-100 text-gray-600 cursor-not-allowed" />
                      <Lock className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">Public registration creates Resident accounts only.</p>
                  </div>
                )}

                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input id="fullName" type="text" value={form.fullName} onChange={set('fullName')} className="input-field pl-9" placeholder="Juan Dela Cruz" required />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                      Phone number {form.role === 'user' && <span className="text-primary-600">*</span>}
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="phone" type="tel" value={form.phone} onChange={set('phone')} className="input-field pl-9" placeholder="09XX XXX XXXX" required={form.role === 'user'} />
                    </div>
                    {form.role === 'user' && (
                      <p className="text-xs text-gray-400 mt-1">This will be your login ID.</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="email" type="email" value={form.email} onChange={set('email')} className="input-field pl-9" placeholder="you@example.com" required autoComplete="email" />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="barangayId" className="block text-sm font-medium text-gray-700 mb-1">Barangay (optional)</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select id="barangayId" value={form.barangayId} onChange={set('barangayId')} className="input-field appearance-none pl-9 pr-10">
                      <option value="">Select your barangay</option>
                      {barangays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <div className="relative">
                      <input id="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')} className="input-field pr-10" placeholder="Min. 6 characters" required autoComplete="new-password" minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                    <input id="confirmPassword" type={showPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} className="input-field" placeholder="Repeat password" required autoComplete="new-password" />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Creating account...' : 'Create account'}
                </button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Verify your account</h2>
                  <p className="text-sm text-gray-500">Enter the 6-digit code</p>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-1">
                A verification code was sent to
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-4">
                {form.email.replace(/(.{2}).*(@.*)/, '$1***$2')}
              </p>

              {devOtp && (
                <div className="mb-4 p-3 rounded-lg bg-warning-50 border border-warning-200 text-warning-800 text-sm">
                  <p className="font-medium">Development mode</p>
                  <p className="text-xs mt-0.5">Code: <span className="font-mono font-bold tracking-widest">{devOtp}</span></p>
                </div>
              )}

              {otpError && (
                <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span>{otpError}</span>
                </div>
              )}

              <div className="flex justify-between gap-2 mb-4">
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputs.current[i] = el; }}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={CODE_LENGTH}
                    aria-label={`Digit ${i + 1}`}
                    className="w-full h-12 text-center text-xl font-bold rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                <span>{secondsLeft > 0 ? `Code expires in ${formatClock(secondsLeft)}` : 'Code expired'}</span>
                <button type="button" onClick={handleResend} disabled={resendIn > 0 || loading} className="flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700 disabled:text-gray-400 disabled:cursor-not-allowed">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>

              <button type="button" onClick={handleVerifyOtp} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Verifying...' : 'Verify & continue'}
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-success-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Account verified</h2>
              <p className="text-sm text-gray-500 mb-6">
                {isStaff
                  ? `Your staff ID has been generated. You can now sign in using it.`
                  : `Your account is ready. You can now sign in with your phone number.`}
              </p>
              <button type="button" onClick={() => navigate('/login', { replace: true })} className="btn-primary w-full py-2.5">
                Go to sign in
              </button>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-white/80 drop-shadow">
          Already have an account?{' '}
          <Link to="/login" className="text-white font-semibold hover:underline">Sign in</Link>
        </p>
        <p className="text-center text-sm text-white/70 drop-shadow mt-1">
          <Link to="/" className="hover:underline">Choose a different role</Link>
        </p>
      </div>
    </div>
  );
}
