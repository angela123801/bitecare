import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/config/constants';
import { ROLE_MISMATCH_MESSAGE } from '@/lib/navigation';
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck, Phone, IdCard, ArrowLeft, UserPlus, ArrowRight } from 'lucide-react';
import type { UserRole } from '@/types';
import InstallAppButton from '@/components/auth/InstallAppButton';
import OtpPanel from '@/components/auth/OtpPanel';
import {
  sendOtp,
  verifyOtp,
  otpDeliveryMessage,
  OtpError,
  type OtpChannel,
  type OtpChannelOption,
} from '@/lib/otp';
import { normalizePhMobile, isValidPhMobile } from '@/lib/utils';

export default function LoginPage() {
  const { applySession, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedRole = searchParams.get('role') as UserRole | null;
  const isStaff = Boolean(preselectedRole) && preselectedRole !== 'user';
  // Resident/User login is the default when no role is chosen. The bottom
  // actions are driven by role only, so every screen size behaves the same.
  const isResidentLogin = !preselectedRole || preselectedRole === 'user';
  const isHealthWorkerLogin = preselectedRole === 'health_worker';
  // '/roles' is the compact chooser on phones and redirects to the full role
  // picker on tablet and desktop, so this one target fits every device.
  const roleChooserTarget = '/roles';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [channels, setChannels] = useState<OtpChannelOption[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<OtpChannel>('email');
  const [destinationMasked, setDestinationMasked] = useState('');
  const [expiresIn, setExpiresIn] = useState(300);
  const [resendIn, setResendIn] = useState(60);
  const [resetSignal, setResetSignal] = useState(0);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  // Clear transient messages when moving between steps.
  useEffect(() => {
    setError('');
    setInfo('');
  }, [step]);

  // Residents sign in with their phone number, so normalise it before it is sent.
  const normalizedIdentifier = () => (isStaff ? identifier.trim() : normalizePhMobile(identifier));

  const sendCode = async (channel: OtpChannel, keepSelection: boolean, idOverride?: string) => {
    const result = await sendOtp({
      purpose: 'login',
      channel,
      identifier: idOverride ?? normalizedIdentifier(),
      password,
    });
    if (!keepSelection) setSelectedChannel(result.channel);
    setDestinationMasked(result.destination_masked);
    setExpiresIn(result.expires_in);
    setResendIn(result.resend_in);
    setResetSignal((n) => n + 1);
    setInfo(otpDeliveryMessage(result.channel, result.delivered, result.provider_configured));
    return result;
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    const id = normalizedIdentifier();
    if (!id) {
      setError(isStaff ? 'Please enter your staff ID' : 'Please enter your phone number');
      return;
    }
    if (!isStaff && !isValidPhMobile(id)) {
      setError('Enter a valid Philippine mobile number (for example 09171234567).');
      return;
    }
    if (!password) { setError('Please enter your password'); return; }

    setIdentifier(id);
    setLoading(true);
    try {
      // Send the code immediately. The server resolves the account, checks the
      // password and sends the SMS in a single request, so there is no extra
      // round trip before the message goes out. SMS is the only method, for
      // every role, and the server enforces that regardless of the UI.
      setChannels([]);
      setSelectedChannel('sms');
      await sendCode('sms', true, id);
      setStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChannel = async (channel: OtpChannel) => {
    if (channel === selectedChannel || resending || verifying) return;
    setError('');
    setInfo('');
    setResending(true);
    try {
      await sendCode(channel, true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send the code');
    } finally {
      setResending(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || resending || verifying) return;
    setError('');
    setInfo('');
    setResending(true);
    try {
      await sendCode(selectedChannel, true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend the code');
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async (code: string) => {
    if (verifying) return;
    setError('');
    setInfo('');
    setVerifying(true);
    try {
      const result = await verifyOtp({
        purpose: 'login',
        otp: code,
        identifier: normalizedIdentifier(),
        password,
      });
      if (!result.access_token || !result.refresh_token) {
        throw new OtpError('Could not start your session. Please try again.');
      }
      const profile = await applySession(result.access_token, result.refresh_token);

      // The role chosen on the previous screen must match the account's real
      // role. The database remains the authority — this only keeps the sign-in
      // journey honest, so a Resident cannot sign in through the Admin card.
      if (preselectedRole && profile && profile.role !== preselectedRole) {
        await signOut();
        setError(`${ROLE_MISMATCH_MESSAGE} This is a ${ROLE_LABELS[profile.role]} account.`);
        return;
      }

      navigate('/dashboard', { replace: true });
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

  const goBack = () => {
    setStep('input');
    setError('');
    setInfo('');
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative"
      style={{ backgroundImage: 'url(/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate(roleChooserTarget)}
          className="inline-flex items-center gap-2 text-white/85 hover:text-white text-sm font-medium mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-6">
          <img src="/logo.png" alt="BiteCare Logo" className="w-20 h-20 mx-auto mb-3 drop-shadow-lg" />
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white drop-shadow-md tracking-tight">BiteCare</h1>
          <p className="font-display text-white/85 text-sm font-semibold mt-2 drop-shadow max-w-xs mx-auto">
            Animal Bite Management &amp; Monitoring System
          </p>
          <p className="text-white/60 text-xs font-medium mt-1">Bacolod City, Negros Occidental</p>
        </div>

        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-7">
          {preselectedRole && (
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-primary-600" />
              </div>
              <span className="text-sm font-semibold text-gray-700">{ROLE_LABELS[preselectedRole]} Login</span>
            </div>
          )}

          {step === 'input' && (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Welcome back</h2>
              <p className="text-gray-500 text-sm mb-5">
                {isStaff
                  ? 'Sign in with your staff ID and password'
                  : 'Sign in with your phone number and password'}
              </p>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}

              <form onSubmit={handleContinue} className="space-y-4">
                <div>
                  <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
                    {isStaff ? 'Staff Login ID' : 'Phone number'}
                  </label>
                  <div className="relative">
                    {isStaff
                      ? <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      : <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />}
                    <input
                      id="identifier"
                      type={isStaff ? 'text' : 'tel'}
                      value={identifier}
                      onChange={(e) => setIdentifier(isStaff ? e.target.value.toUpperCase() : e.target.value)}
                      className="input-field pl-9"
                      placeholder={isStaff ? 'BC-SADM-000001' : '09XX XXX XXXX'}
                      required
                      autoComplete={isStaff ? 'username' : 'tel'}
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
                  {loading ? 'Signing in...' : 'Login'}
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
              info={info}
              onVerify={handleVerify}
              onResend={handleResend}
              onBack={goBack}
            />
          )}
        </div>

        {/* Bottom actions — identical on phone, tablet, laptop and desktop.
            Resident login offers registration; Health Worker login offers only
            a way back to role selection. */}
        {isResidentLogin ? (
          <div className="mt-6 space-y-3">
            <Link
              to="/register"
              className="group w-full flex items-center gap-3 rounded-2xl bg-white/95 backdrop-blur-md border border-white/30 p-4 transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5"
            >
              <span className="w-11 h-11 rounded-xl bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center flex-shrink-0 transition-colors">
                <UserPlus className="w-5 h-5 text-amber-600" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900">Register as Resident</span>
                <span className="block text-xs text-gray-500 mt-0.5">Create a user account and verify by SMS</span>
              </span>
              <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0 transition-all group-hover:translate-x-0.5 group-hover:text-primary-500" />
            </Link>

            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate(roleChooserTarget)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm font-medium border border-white/25 transition-colors"
              >
                <IdCard className="w-4 h-4" />
                Choose Another Role
              </button>
            </div>
          </div>
        ) : isHealthWorkerLogin ? (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate(roleChooserTarget)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm font-medium border border-white/25 transition-colors"
            >
              <IdCard className="w-4 h-4" />
              Choose Another Role
            </button>
          </div>
        ) : (
          <>
            <p className="mt-5 text-center text-sm text-white/80 drop-shadow">
              Not a staff member?{' '}
              <Link to="/login?role=user" className="text-white font-semibold hover:underline">Sign in as a Resident</Link>
            </p>
            <p className="text-center text-sm text-white/70 drop-shadow mt-1">
              <Link to={roleChooserTarget} className="hover:underline">Choose a different role</Link>
            </p>
          </>
        )}

        <div className="mt-4 flex justify-center">
          <InstallAppButton />
        </div>
      </div>
    </div>
  );
}
