import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Barangay, UserRole } from '@/types';
import { ROLE_LABELS } from '@/config/constants';
import { LOGIN_ROLES } from '@/lib/navigation';
import { getErrorMessage } from '@/lib/utils';
import {
  Eye, EyeOff, Loader2, ChevronDown, AlertCircle, Lock, ShieldCheck,
  Phone, Mail, User as UserIcon, MapPin, CheckCircle2,
} from 'lucide-react';
import OtpPanel from '@/components/auth/OtpPanel';
import {
  sendOtp,
  verifyOtp,
  allowedChannelsForRole,
  otpDeliveryMessage,
  OtpError,
  type OtpChannel,
  type OtpChannelOption,
} from '@/lib/otp';

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
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  // OTP state
  const [channels, setChannels] = useState<OtpChannelOption[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<OtpChannel>('sms');
  const [destinationMasked, setDestinationMasked] = useState('');
  const [expiresIn, setExpiresIn] = useState(300);
  const [resendIn, setResendIn] = useState(60);
  const [resetSignal, setResetSignal] = useState(0);
  const [otpInfo, setOtpInfo] = useState('');

  useEffect(() => {
    supabase.from('barangays').select('*').order('name').then(({ data, error: err }) => {
      if (err) { setError(getErrorMessage(err, 'Failed to load barangays')); return; }
      if (data) setBarangays(data);
    });
  }, []);

  useEffect(() => {
    supabase.rpc('is_open_registration_enabled').then(({ data, error: err }) => {
      if (err) return;
      setOpenRegistration(data === true);
    });
  }, []);

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const sendCode = async (channel: OtpChannel) => {
    const result = await sendOtp({ purpose: 'verification', channel });
    setDestinationMasked(result.destination_masked);
    setExpiresIn(result.expires_in);
    setResendIn(result.resend_in);
    setResetSignal((n) => n + 1);
    setOtpInfo(otpDeliveryMessage(channel, result.delivered, result.provider_configured));
  };

  // --- Create account, then send the verification code ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) { setError('Full name is required'); return; }
    if (!form.email.trim() || !form.email.includes('@')) { setError('A valid email address is required'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }

    const normalizedPhone = form.phone.replace(/\D/g, '').replace(/^63/, '0');
    if (!/^0\d{10}$/.test(normalizedPhone)) {
      setError('A valid Philippine mobile number is required (for example 09171234567). Your verification code is sent by SMS.');
      return;
    }

    setLoading(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.fullName.trim() } },
      });
      if (signUpError) throw signUpError;

      const { error: completeError } = await supabase.rpc('public_complete_registration', {
        p_role: form.role,
        p_full_name: form.fullName.trim(),
        p_phone: form.phone.trim(),
        p_barangay_id: form.barangayId || null,
      });
      if (completeError) throw completeError;

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Account was created but no session was established.');

      // SMS is the only verification method, for every role.
      const permitted = allowedChannelsForRole(form.role);
      const options: OtpChannelOption[] = permitted.map((channel) => ({
        channel,
        destination_masked: normalizedPhone.slice(0, 4) + '****' + normalizedPhone.slice(-2),
      }));
      setChannels(options);
      const chosen = permitted[0];
      setSelectedChannel(chosen);
      await sendCode(chosen);
      setStep('otp');
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Registration failed');
      setError(msg.includes('already registered') ? 'An account with this email already exists' : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChannel = async (channel: OtpChannel) => {
    if (channel === selectedChannel || resending) return;
    setError(''); setOtpInfo('');
    setResending(true);
    try {
      setSelectedChannel(channel);
      await sendCode(channel);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send the code');
    } finally {
      setResending(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || resending) return;
    setError(''); setOtpInfo('');
    setResending(true);
    try {
      await sendCode(selectedChannel);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend the code');
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setError(''); setOtpInfo('');
    setVerifying(true);
    try {
      await verifyOtp({ purpose: 'verification', otp: code });
      setStep('done');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setError(
        err instanceof OtpError && typeof err.attemptsLeft === 'number'
          ? `${message} (${err.attemptsLeft} attempt${err.attemptsLeft === 1 ? '' : 's'} left)`
          : message,
      );
    } finally {
      setVerifying(false);
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
                        Your staff ID will be generated automatically (e.g., {staffPrefix}-XXXXXX). You will use this ID to log in, and verify by SMS.
                      </p>
                    )}
                    {!isStaff && (
                      <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-2.5 py-2 mt-2">
                        As a resident, your phone number will be your login ID and you will verify by SMS.
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
                      Phone number <span className="text-primary-600">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input id="phone" type="tel" value={form.phone} onChange={set('phone')} className="input-field pl-9" placeholder="09XX XXX XXXX" required />
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {form.role === 'user'
                        ? 'This will be your login ID, and your verification code is sent here.'
                        : 'Your verification code is sent to this number by SMS.'}
                    </p>
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
            <OtpPanel
              channels={channels}
              selectedChannel={selectedChannel}
              onSelectChannel={handleSelectChannel}
              destinationMasked={destinationMasked}
              expiresIn={expiresIn}
              resendIn={resendIn}
              resetSignal={resetSignal}
              verifying={verifying}
              resending={resending}
              error={error}
              info={otpInfo}
              onVerify={handleVerifyOtp}
              onResend={handleResend}
              onBack={() => { setStep('form'); setError(''); setOtpInfo(''); }}
              title="Verify your account"
            />
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-success-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Account verified</h2>
              <p className="text-sm text-gray-500 mb-6">
                {isStaff
                  ? 'Your staff ID has been generated. You can now sign in using it.'
                  : 'Your account is ready. You can now sign in with your phone number.'}
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
