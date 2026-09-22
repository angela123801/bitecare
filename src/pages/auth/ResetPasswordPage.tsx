import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2, CheckCircle, AlertCircle, KeyRound } from 'lucide-react';

export default function ResetPasswordPage() {
  const { user, loading: authLoading, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      await updatePassword(password);
      setDone(true);
      await signOut();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const hasRecoverySession = Boolean(user) && !done;

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
          {done ? (
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
          ) : !hasRecoverySession ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-danger-50 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-danger-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Link expired or invalid</h2>
              <p className="text-sm text-gray-500 mb-6">
                This password reset link is no longer valid. Request a new one from the sign-in page.
              </p>
              <Link to="/login" className="btn-primary w-full py-2.5 inline-block text-center">Back to sign in</Link>
            </div>
          ) : (
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

              <form onSubmit={handleSubmit} className="space-y-4">
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
        </div>

        {!done && (
          <p className="mt-5 text-center text-sm text-white/80 drop-shadow">
            <Link to="/login" className="text-white font-semibold hover:underline">Back to sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
