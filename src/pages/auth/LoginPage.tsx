import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/config/constants';
import {
  Eye, EyeOff, Loader2, AlertCircle, ShieldCheck, Phone, IdCard, ArrowLeft,
  Mail, CheckCircle2, RefreshCw, X,
} from 'lucide-react';
import type { UserRole } from '@/types';
import { useInstallApp } from '@/lib/installPrompt';
import { Download, Smartphone } from 'lucide-react';

const CODE_LENGTH = 6;

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedRole = searchParams.get('role') as UserRole | null;

  // Staff login state
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Resident login state
  const [phone, setPhone] = useState('');
  const [resolvedRole, setResolvedRole] = useState<UserRole | null>(preselectedRole);

  // Shared
  const [step, setStep] = useState<'input' | 'otp' | 'success'>(preselectedRole ? 'input' : 'input');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [maskedTarget, setMaskedTarget] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  // Countdowns
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [resendIn, setResendIn] = useState(60);

  // OTP digits
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const { canInstall, install, installing, platform } = useInstallApp();
  const [showIosHelp, setShowIosHelp] = useState(false);

  const handleInstall = async () => {
    if (platform === 'ios') { setShowIosHelp(true); return; }
    await install();
  };

  // Reset OTP state when entering OTP step
  useEffect(() => {
    if (step === 'otp') {
      setDigits(Array(CODE_LENGTH).fill(''));
      setError('');
      setSecondsLeft(600);
      setResendIn(60);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    }
  }, [step]);

  // OTP countdown
  useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const otpDigit = useCallback((index: number, value: string) => {
    setDigits((prev) => { const n = [...prev]; n[index] = value; return n; });
  }, []);

  const handleOtpChange = (index: number, raw: string) => {
    const val = raw.replace(/\D/g, '');
    if (!val) { otpDigit(index, ''); return; }
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
    otpDigit(index, val);
    if (index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const invoke = async (body: Record<string, unknown>) => {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-login`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    };
    const res = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  };

  // --- Staff Login Flow ---
  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!staffId.trim()) { setError('Please enter your staff ID'); return; }
    if (!password) { setError('Please enter your password'); return; }
    setLoading(true);

    try {
      // Resolve staff_id to get email
      const resolved = await invoke({ action: 'resolve', loginId: staffId.trim() });
      if (resolved.role === 'user') { setError('This ID belongs to a resident. Use the resident login instead.'); setLoading(false); return; }

      // Sign in with email+password
      const profile = await signIn(resolved.email, password);
      if (!profile) { setError('Invalid staff ID or password'); setLoading(false); return; }

      // Send staff 2FA OTP
      const otpRes = await invoke({ action: 'send_staff_otp', userId: profile.id });
      setDevOtp(otpRes.dev_otp || null);
      setMaskedTarget(otpRes.masked_email || resolved.email);
      setResolvedUserId(profile.id);
      setResolvedEmail(resolved.email);
      setOtpSent(true);
      setStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // --- Resident Login Flow ---
  const handleResidentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!phone.trim()) { setError('Please enter your phone number'); return; }

    setLoading(true);
    try {
      const otpRes = await invoke({ action: 'send_resident_otp', phone: phone.trim() });
      setDevOtp(otpRes.dev_otp || null);
      setMaskedTarget(otpRes.masked_phone || phone);
      setResolvedUserId(otpRes.user_id);
      setOtpSent(true);
      setStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send verification code');
    } finally {
      setLoading(false);
    }
  };

  // --- Verify OTP ---
  const handleVerifyOtp = async () => {
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) { setError('Enter all 6 digits'); return; }
    if (!resolvedUserId) return;

    setError('');
    setLoading(true);
    try {
      if (resolvedRole === 'user' || (!resolvedRole && !staffId)) {
        // Resident: verify OTP then sign in
        const result = await invoke({ action: 'verify_resident_otp', userId: resolvedUserId, otp: code });
        await signIn(result.email, result.password);
        navigate('/dashboard', { replace: true });
      } else {
        // Staff: verify OTP then complete sign-in (already signed in with password)
        await invoke({ action: 'verify_staff_otp', userId: resolvedUserId, otp: code });

        // Re-sign-in to refresh the session
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', resolvedUserId)
          .maybeSingle();
        if (profile) {
          await signIn(profile.email, password);
        }
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  // --- Resend OTP ---
  const handleResend = async () => {
    if (resendIn > 0 || loading || !resolvedUserId) return;
    setLoading(true);
    setError('');
    try {
      if (resolvedRole === 'user' || !staffId) {
        const otpRes = await invoke({ action: 'send_resident_otp', phone: phone.trim() });
        setDevOtp(otpRes.dev_otp || null);
      } else {
        const otpRes = await invoke({ action: 'send_staff_otp', userId: resolvedUserId });
        setDevOtp(otpRes.dev_otp || null);
      }
      setDigits(Array(CODE_LENGTH).fill(''));
      setSecondsLeft(600);
      setResendIn(60);
      inputs.current[0]?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend code');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setStep('input');
    setOtpSent(false);
    setError('');
    setDevOtp(null);
    setResolvedUserId(null);
  };

  const isStaff = resolvedRole && resolvedRole !== 'user';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative"
      style={{ backgroundImage: 'url(/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <img src="/logo.png" alt="BiteCare Logo" className="w-20 h-20 mx-auto mb-3 drop-shadow-lg" />
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white drop-shadow-md tracking-tight">BiteCare</h1>
          <p className="font-display text-white/85 text-sm font-semibold mt-2 drop-shadow max-w-xs mx-auto">
            Animal Bite Management &amp; Monitoring System
          </p>
          <p className="text-white/60 text-xs font-medium mt-1">Bacolod City, Negros Occidental</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-7">
          {resolvedRole && (
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-primary-600" />
              </div>
              <span className="text-sm font-semibold text-gray-700">{ROLE_LABELS[resolvedRole]} Login</span>
            </div>
          )}

          {step === 'input' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h2>
              <p className="text-gray-500 text-sm mb-5">
                {isStaff ? 'Sign in with your staff ID and password' : 'Sign in with your phone number'}
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}

              {isStaff ? (
                <form onSubmit={handleStaffLogin} className="space-y-4">
                  <div>
                    <label htmlFor="staffId" className="block text-sm font-medium text-gray-700 mb-1">Staff ID</label>
                    <div className="relative">
                      <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        id="staffId"
                        type="text"
                        value={staffId}
                        onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                        className="input-field pl-9"
                        placeholder="SA-000001"
                        required
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field pr-10"
                        placeholder="Enter your password"
                        required
                        autoComplete="current-password"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Link to="/reset-password" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                      Forgot password?
                    </Link>
                  </div>

                  <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {loading ? 'Signing in...' : 'Continue'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResidentLogin} className="space-y-4">
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="input-field pl-9"
                        placeholder="09XX XXX XXXX"
                        required
                        autoComplete="tel"
                      />
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {loading ? 'Sending code...' : 'Send verification code'}
                  </button>
                </form>
              )}
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <button onClick={goBack} className="text-gray-400 hover:text-gray-600">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Verify your identity</h2>
                  <p className="text-sm text-gray-500">Enter the 6-digit code</p>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-1">
                {isStaff ? 'We sent a code to' : 'A verification code was sent to'}
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-4">{maskedTarget}</p>

              {devOtp && (
                <div className="mb-4 p-3 rounded-lg bg-warning-50 border border-warning-200 text-warning-800 text-sm">
                  <p className="font-medium">Development mode</p>
                  <p className="text-xs mt-0.5">Code: <span className="font-mono font-bold tracking-widest">{devOtp}</span></p>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span>{error}</span>
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
                {loading ? 'Verifying...' : 'Verify & sign in'}
              </button>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-sm text-white/80 drop-shadow">
          {isStaff ? (
            <>Not a staff member? <Link to="/register" className="text-white font-semibold hover:underline">Register as resident</Link></>
          ) : (
            <>Staff member? <Link to={`/login${resolvedRole ? `?role=${resolvedRole}` : ''}`} className="text-white font-semibold hover:underline">Use staff login</Link></>
          )}
        </p>
        <p className="text-center text-sm text-white/70 drop-shadow mt-1">
          <Link to="/" className="hover:underline">Choose a different role</Link>
        </p>

        {canInstall && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <button type="button" onClick={handleInstall} disabled={installing} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm font-medium border border-white/25 transition-colors disabled:opacity-60">
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Install app on this device
            </button>
            {showIosHelp && (
              <p className="flex items-start gap-2 max-w-xs text-xs text-white/85 text-left bg-black/35 backdrop-blur-sm rounded-lg p-3">
                <Smartphone className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Tap Share, then Add to Home Screen.</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
