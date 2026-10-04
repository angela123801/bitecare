import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/config/constants';
import { Eye, EyeOff, Loader2, AlertCircle, ShieldCheck, Phone, IdCard } from 'lucide-react';
import type { UserRole } from '@/types';
import { useInstallApp } from '@/lib/installPrompt';
import { Download, Smartphone } from 'lucide-react';
import OtpPanel from '@/components/auth/OtpPanel';
import {
  fetchOtpChannels,
  sendOtp,
  verifyOtp,
  otpDeliveryMessage,
  OtpError,
  type OtpChannel,
  type OtpChannelOption,
} from '@/lib/otp';

export default function LoginPage() {
  const { applySession } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedRole = searchParams.get('role') as UserRole | null;
  const isStaff = Boolean(preselectedRole) && preselectedRole !== 'user';

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

  const { canInstall, install, installing, platform } = useInstallApp();
  const [showIosHelp, setShowIosHelp] = useState(false);

  const handleInstall = async () => {
    if (platform === 'ios') { setShowIosHelp(true); return; }
    await install();
  };

  // Clear transient messages when moving between steps.
  useEffect(() => {
    setError('');
    setInfo('');
  }, [step]);

  const sendCode = async (channel: OtpChannel, keepSelection: boolean) => {
    const result = await sendOtp({
      purpose: 'login',
      channel,
      identifier: identifier.trim(),
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
    setError('');
    if (!identifier.trim()) {
      setError(isStaff ? 'Please enter your staff ID' : 'Please enter your phone number');
      return;
    }
    if (!password) { setError('Please enter your password'); return; }

    setLoading(true);
    try {
      // Ask the server which methods this account may use. Residents get SMS
      // only; the server enforces this regardless of what the UI shows.
      const { channels: available } = await fetchOtpChannels(identifier.trim());
      if (available.length === 0) {
        setError('No verification method is available for this account. Contact an administrator.');
        return;
      }
      setChannels(available);
      const first = available[0].channel;
      setSelectedChannel(first);
      await sendCode(first, true);
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
    setError('');
    setInfo('');
    setVerifying(true);
    try {
      const result = await verifyOtp({
        purpose: 'login',
        otp: code,
        identifier: identifier.trim(),
        password,
      });
      if (!result.access_token || !result.refresh_token) {
        throw new OtpError('Could not start your session. Please try again.');
      }
      await applySession(result.access_token, result.refresh_token);
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
                    {isStaff ? 'Staff ID' : 'Phone number'}
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
                  {loading ? 'Sending code...' : 'Continue'}
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

        <p className="mt-5 text-center text-sm text-white/80 drop-shadow">
          {isStaff ? (
            <>Not a staff member? <Link to="/register" className="text-white font-semibold hover:underline">Register as resident</Link></>
          ) : (
            <>Staff member? <Link to="/login?role=health_worker" className="text-white font-semibold hover:underline">Use staff login</Link></>
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
