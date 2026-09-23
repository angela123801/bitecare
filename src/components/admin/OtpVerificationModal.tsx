import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ShieldCheck, AlertCircle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { resendAccountOtp, verifyAccountOtp } from '@/lib/accounts';

interface Props {
  open: boolean;
  userId: string | null;
  email: string;
  devOtp?: string | null;
  onClose: () => void;
  onVerified: () => void;
}

const CODE_LENGTH = 6;
const OTP_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

function maskEmail(email: string): string {
  const [name = '', domain] = email.split('@');
  if (!domain) return email;
  const shown = name.slice(0, 2);
  return `${shown}${'*'.repeat(Math.max(name.length - 2, 3))}@${domain}`;
}

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function OtpVerificationModal({ open, userId, email, devOtp, onClose, onVerified }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [info, setInfo] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SECONDS);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    setDigits(Array(CODE_LENGTH).fill(''));
    setError('');
    setInfo('');
    setSuccess(false);
    setVerifying(false);
    setSecondsLeft(OTP_TTL_SECONDS);
    setResendIn(RESEND_COOLDOWN_SECONDS);
    setDevCode(devOtp ?? null);
    setTimeout(() => inputs.current[0]?.focus(), 50);
  }, [open, userId, devOtp]);

  useEffect(() => {
    if (!open || success) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [open, success]);

  const setDigitAt = useCallback((index: number, value: string) => {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, '');
    if (!value) {
      setDigitAt(index, '');
      return;
    }
    if (value.length > 1) {
      const chars = value.slice(0, CODE_LENGTH - index).split('');
      setDigits((prev) => {
        const next = [...prev];
        chars.forEach((c, i) => { next[index + i] = c; });
        return next;
      });
      const focusIndex = Math.min(index + chars.length, CODE_LENGTH - 1);
      inputs.current[focusIndex]?.focus();
      return;
    }
    setDigitAt(index, value);
    if (index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleVerify = async () => {
    if (!userId) return;
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) {
      setError('Enter all 6 digits of the code.');
      return;
    }
    setError('');
    setInfo('');
    setVerifying(true);
    try {
      await verifyAccountOtp(userId, code);
      setSuccess(true);
      onVerified();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!userId || resendIn > 0 || resending) return;
    setResending(true);
    setError('');
    setInfo('');
    try {
      const result = await resendAccountOtp(userId);
      setDigits(Array(CODE_LENGTH).fill(''));
      setSecondsLeft(OTP_TTL_SECONDS);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setDevCode(result.dev_otp ?? null);
      setInfo(result.email_sent ? 'A new code has been emailed.' : 'A new code has been generated.');
      inputs.current[0]?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend the code');
    } finally {
      setResending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="otp-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={success ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md p-6">
        {!success && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {success ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-success-600" />
            </div>
            <h2 id="otp-title" className="text-lg font-bold text-gray-900 mb-2">Account verified</h2>
            <p className="text-sm text-gray-500 mb-6">
              {email} is now verified and can sign in. Share their sign-in email and ask them to use
              &ldquo;Forgot password&rdquo; to set their own password.
            </p>
            <button type="button" onClick={onClose} className="btn-primary w-full py-2.5">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h2 id="otp-title" className="text-lg font-bold text-gray-900">Verify account</h2>
                <p className="text-sm text-gray-500">Enter the 6-digit code</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-1">
              We sent a verification code to
            </p>
            <p className="text-sm font-semibold text-gray-900 mb-4">{maskEmail(email)}</p>

            {devCode && (
              <div className="mb-4 p-3 rounded-lg bg-warning-50 border border-warning-200 text-warning-800 text-sm">
                <p className="font-medium">Development mode</p>
                <p className="text-xs mt-0.5">
                  No email provider is configured, so the code is shown here: <span className="font-mono font-bold tracking-widest">{devCode}</span>
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            {info && !error && (
              <div className="mb-4 p-3 rounded-lg bg-primary-50 border border-primary-200 text-primary-700 text-sm">
                {info}
              </div>
            )}

            <div className="flex justify-between gap-2 mb-4">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el; }}
                  value={digit}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
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
              <button
                type="button"
                onClick={handleResend}
                disabled={resendIn > 0 || resending}
                className="flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
              {verifying ? 'Verifying...' : 'Verify account'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
