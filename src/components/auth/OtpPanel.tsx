import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, ShieldCheck, AlertCircle, RefreshCw, Mail, MessageSquare, ArrowLeft } from 'lucide-react';
import { CHANNEL_LABELS, type OtpChannel, type OtpChannelOption } from '@/lib/otp';
import { cn } from '@/lib/utils';

const CODE_LENGTH = 6;

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface OtpPanelProps {
  channels: OtpChannelOption[];
  selectedChannel: OtpChannel;
  onSelectChannel: (channel: OtpChannel) => void;
  destinationMasked: string;
  expiresIn: number;
  resendIn: number;
  /** Bump this after each code is sent to restart the timers and clear inputs. */
  resetSignal: number;
  verifying: boolean;
  resending: boolean;
  error?: string;
  info?: string;
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack?: () => void;
  title?: string;
  subtitle?: string;
}

export default function OtpPanel({
  channels,
  selectedChannel,
  onSelectChannel,
  destinationMasked,
  expiresIn,
  resendIn,
  resetSignal,
  verifying,
  resending,
  error,
  info,
  onVerify,
  onResend,
  onBack,
  title = 'Verify your identity',
  subtitle = 'Enter the 6-digit code',
}: OtpPanelProps) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [secondsLeft, setSecondsLeft] = useState(expiresIn);
  const [resendLeft, setResendLeft] = useState(resendIn);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset the code boxes and both countdowns whenever a new code is issued.
  useEffect(() => {
    setDigits(Array(CODE_LENGTH).fill(''));
    setSecondsLeft(expiresIn);
    setResendLeft(resendIn);
    const focus = setTimeout(() => inputs.current[0]?.focus(), 50);
    return () => clearTimeout(focus);
  }, [resetSignal, expiresIn, resendIn]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      inputs.current[Math.min(index + chars.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    setDigitAt(index, value);
    if (index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handleSubmit = () => {
    onVerify(digits.join(''));
  };

  const complete = digits.every((d) => d !== '');

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        {onBack && (
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>

      {/* Verification method — only shown when more than one is permitted */}
      {channels.length > 1 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-1.5">Send code to</p>
          <div className="grid grid-cols-2 gap-2">
            {channels.map((option) => {
              const active = option.channel === selectedChannel;
              const Icon = option.channel === 'email' ? Mail : MessageSquare;
              return (
                <button
                  key={option.channel}
                  type="button"
                  onClick={() => onSelectChannel(option.channel)}
                  disabled={verifying || resending}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60',
                    active
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{CHANNEL_LABELS[option.channel]}</span>
                    <span className="block text-[11px] truncate">{option.destination_masked}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-sm text-gray-600 mb-1">We sent a verification code to</p>
      <p className="text-sm font-semibold text-gray-900 mb-4">{destinationMasked}</p>

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
            onPaste={i === 0 ? (e) => {
              const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
              if (text.length > 1) { e.preventDefault(); handleChange(0, text); }
            } : undefined}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            disabled={verifying}
            aria-label={`Digit ${i + 1}`}
            className="w-full h-12 text-center text-xl font-bold rounded-lg border border-gray-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none disabled:bg-gray-50"
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
        <span>{secondsLeft > 0 ? `Code expires in ${formatClock(secondsLeft)}` : 'Code expired'}</span>
        <button
          type="button"
          onClick={onResend}
          disabled={resendLeft > 0 || resending || verifying}
          className="flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {resendLeft > 0 ? `Resend in ${resendLeft}s` : 'Resend code'}
        </button>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={verifying || !complete}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
      >
        {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
        {verifying ? 'Verifying...' : 'Verify'}
      </button>
    </>
  );
}
