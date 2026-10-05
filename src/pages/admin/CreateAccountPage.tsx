import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/config/constants';
import { createAccount, rolesForCreator, ROLE_OPTIONS, type CreateAccountResult } from '@/lib/accounts';
import type { UserRole } from '@/types';
import OtpVerificationModal from '@/components/admin/OtpVerificationModal';
import {
  UserPlus, Loader2, AlertCircle, CheckCircle2, ShieldCheck, Mail, Phone, User as UserIcon, ShieldAlert,
  Lock, Eye, EyeOff,
} from 'lucide-react';

export default function CreateAccountPage() {
  const { profile } = useAuth();
  const allowedRoles = rolesForCreator(profile?.role);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    role: (allowedRoles.includes('health_worker') ? 'health_worker' : 'user') as UserRole,
    requireVerification: true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<CreateAccountResult | null>(null);
  const [showOtp, setShowOtp] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = field === 'requireVerification'
      ? (e.target as HTMLInputElement).checked
      : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) { setError('Full name is required.'); return; }
    if (!form.email.trim() || !form.email.includes('@')) { setError('A valid email address is required.'); return; }
    if (!allowedRoles.includes(form.role)) { setError('You are not allowed to create that role.'); return; }
    if (form.role === 'user' && !/^0\d{10}$/.test(form.phone.replace(/[^0-9]/g, '').replace(/^63/, '0'))) {
      setError('A resident needs a valid mobile number (for example 09171234567) because it is their login ID.');
      return;
    }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('The two passwords do not match.'); return; }

    setSaving(true);
    try {
      const created = await createAccount({
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        role: form.role,
        password,
        requireVerification: form.requireVerification,
      });
      setResult(created);
      if (created.requires_verification) {
        setShowOtp(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setShowOtp(false);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setForm((f) => ({ ...f, fullName: '', email: '', phone: '' }));
  };

  const isVerifiedResult = result && (!result.requires_verification || !showOtp);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
        <p className="text-sm text-gray-500 mt-1">
          Add a new account. A verification code is required before the account can be used.
        </p>
      </div>

      {allowedRoles.length === 0 ? (
        <div className="p-4 rounded-xl bg-warning-50 border border-warning-200 text-warning-800 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">You cannot create accounts</p>
            <p className="text-sm mt-0.5">
              Your role does not have permission to create user accounts. Contact an administrator.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {isVerifiedResult ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-success-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-success-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Account created</h2>
              <p className="text-sm text-gray-500 mb-4">
                {result!.email} was created as {ROLE_LABELS[result!.role]}.
              </p>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-left mb-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {result!.staff_id ? 'Staff ID (login ID)' : 'Login ID'}
                </p>
                <p className="mt-1 font-mono text-lg font-bold text-gray-900 tracking-wider">
                  {result!.staff_id ?? form.phone ?? result!.email}
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  {result!.staff_id
                    ? 'Share this Staff ID and the password you set with the account holder. They sign in with both.'
                    : 'This resident signs in with their mobile number and the password you set.'}
                </p>
              </div>

              {result!.requires_verification && !result!.otp_sent && (
                <div className="mb-4 p-3 rounded-lg bg-warning-50 border border-warning-200 text-warning-800 text-sm text-left">
                  The verification email could not be sent because the email service is not configured.
                  The account exists but stays locked until the code is confirmed.
                </div>
              )}

              <p className="text-sm text-gray-500 mb-6">
                {result!.requires_verification
                  ? (result!.otp_sent ? 'A verification code has been emailed to the account holder.' : 'Verification is still pending.')
                  : 'The account is ready to sign in.'}
              </p>
              <div className="flex gap-3 justify-center">
                {profile?.role !== 'health_worker' && (
                  <Link to="/admin/users" className="btn-secondary px-5 py-2.5">View users</Link>
                )}
                <button type="button" onClick={resetForm} className="btn-primary px-5 py-2.5">Create another</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Full name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="fullName"
                    type="text"
                    value={form.fullName}
                    onChange={set('fullName')}
                    className="input-field pl-9"
                    placeholder="Juan Dela Cruz"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      className="input-field pl-9"
                      placeholder="name@example.com"
                      required
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Contact number{' '}
                    <span className="text-gray-400 font-normal">
                      {form.role === 'user' ? '(required for residents)' : '(optional)'}
                    </span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="phone"
                      type="tel"
                      value={form.phone}
                      onChange={set('phone')}
                      className="input-field pl-9"
                      placeholder="09XX XXX XXXX"
                      required={form.role === 'user'}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account role</label>
                <div className="space-y-2">
                  {ROLE_OPTIONS.filter((opt) => allowedRoles.includes(opt.value)).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        form.role === opt.value
                          ? 'border-primary-300 bg-primary-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={opt.value}
                        checked={form.role === opt.value}
                        onChange={set('role')}
                        className="mt-0.5 accent-teal-600"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">{opt.label}</span>
                        <span className="block text-xs text-gray-500">{opt.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  You can only assign roles available to you. This is enforced by the system, not just this page.
                </p>
                <p className="text-xs text-primary-700 mt-1">
                  {form.role === 'user'
                    ? 'The resident signs in with their mobile number.'
                    : 'A unique Staff ID is generated automatically and shown after you create the account.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field pl-9 pr-10"
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input-field pl-9"
                      placeholder="Re-enter the password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 -mt-3">
                The account holder signs in with this password. It is stored securely by the sign-in
                service and is never kept in plain text.
              </p>

              <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.requireVerification}
                  onChange={set('requireVerification')}
                  className="mt-0.5 accent-teal-600"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <ShieldCheck className="w-4 h-4 text-primary-600" />
                    Require verification code
                  </span>
                  <span className="block text-xs text-gray-500">
                    Send a one-time code to the person&apos;s email. The account stays locked until the
                    correct code is entered.
                  </span>
                </span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {saving ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          )}
        </div>
      )}

      <OtpVerificationModal
        open={showOtp}
        userId={result?.user_id ?? null}
        email={result?.email ?? ''}
        deliveryFailed={Boolean(result?.requires_verification && !result?.otp_sent)}
        onClose={() => setShowOtp(false)}
        onVerified={() => { /* success state handled by modal */ }}
      />
    </div>
  );
}
