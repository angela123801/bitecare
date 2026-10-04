import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle, KeyRound, Phone, IdCard, ArrowLeft } from 'lucide-react';
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

type Step = 'identify' | 'otp' | 'newPassword' | 'done';

export default function ResetPasswordPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('identify');
  const [identifier, setIdentifier] = useState('');

  const [channels, setChannels] = useState<OtpChannelOption[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<OtpChannel>('sms');
  const [destinationMasked, setDestinationMasked] = useState('');
  const [expiresIn, setExpiresIn] = useState(300);
  const [resendIn, setResendIn] = useState(60);
  const [resetSignal, setResetSignal] = useState(0);
  const [otpInfo, setOtpInfo] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sendCode = async (channel: OtpChannel) => {
    const result = await sendOtp({ purpose: 'password_recovery', channel, identifier: identifier.trim() });
    setDestinationMasked(result.destination_masked);
    setExpiresIn(result.expires_in);
    setResendIn(result.resend_in);
    setResetSignal((n) => n + 1);
    setOtpInfo(otpDeliveryMessage(channel, result.delivered, result.provider_configured));
  };

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim()) { setError('Enter your phone number or staff ID'); return; }

    setLoading(true);
    try {
      const { channels: available } = await fetchOtpChannels(identifier.trim());
      if (available.length === 0) {
        setError('No verification method is available for this account.');
        return;
      }
      setChannels(available);
      const first = available[0].channel;
      setSelectedChannel(first);
      await sendCode(first);
      setStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not start the reset');
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
      const result = await verifyOtp({
        purpose: 'password_recovery',
        otp: code,
        identifier: identifier.trim(),
      });
      if (!result.recovery_token || !result.email) {
        throw new OtpError('Could not start the password reset. Please try again.');
      }
      // Exchange the one-time recovery token for a session, then let the user
      // choose a new password.
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        type: 'recovery',
        token_hash: result.recovery_token,
        email: result.email,
      });
      if (verifyErr) throw new OtpError('This reset link is no longer valid. Start again.');
      setStep('newPassword');
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

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setSubmitting(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;
      setStep('done');
      await signOut();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative"
      style={{
        backgroundImage: 'url(/background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="BiteCare Logo" className="w-20 h-20 mx-auto mb-3 drop-shadow-lg" />
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-white drop-shadow-md tracking-tight">BiteCare</h1>
        </div>

        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-7">
          {step === 'identify' && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Reset your password</h2>
                  <p className="text-sm text-gray-500">We will send a code to confirm it is you</p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleIdentify} className="space-y-4">
                <div>
                  <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone number or staff ID
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="input-field pl-9"
                      placeholder="09XX XXX XXXX or BC-SADM-000001"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Residents use their phone number; staff use their staff ID.
                  </p>
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
              info={otpInfo}
              onVerify={handleVerifyOtp}
              onResend={handleResend}
              onBack={() => { setStep('identify'); setError(''); setOtpInfo(''); }}
              title="Confirm it is you"
              subtitle="Enter the 6-digit code"
            />
          )}

          {step === 'newPassword' && (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Set a new password</h2>
                  <p className="text-sm text-gray-500">Choose a strong password you'll remember</p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field pr-10"
                      placeholder="At least 6 characters"
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="input-field"
                    placeholder="Re-enter your password"
                    required
                    autoComplete="new-password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Updating...' : 'Update password'}
                </button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-6 h-6 text-success-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Password updated</h2>
              <p className="text-sm text-gray-500 mb-6">Your password has been changed. Please sign in with your new password.</p>
              <button type="button" onClick={() => navigate('/login', { replace: true })} className="btn-primary w-full py-2.5">
                Go to sign in
              </button>
            </div>
          )}
        </div>

        {step !== 'done' && (
          <p className="mt-5 text-center text-sm text-white/80 drop-shadow">
            <Link to="/login" className="text-white font-semibold hover:underline">Back to sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
