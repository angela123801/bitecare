import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Barangay, UserRole } from '@/types';
import { ROLE_LABELS } from '@/config/constants';
import { LOGIN_ROLES } from '@/lib/navigation';
import { getErrorMessage } from '@/lib/utils';
import { Eye, EyeOff, Loader2, ChevronDown, AlertCircle, Lock, ShieldCheck } from 'lucide-react';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    barangayId: '',
    role: 'user' as UserRole,
  });
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [openRegistration, setOpenRegistration] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('barangays').select('*').order('name').then(({ data, error }) => {
      if (error) { setError(getErrorMessage(error, 'Failed to load barangays')); return; }
      if (data) setBarangays(data);
    });
  }, []);

  useEffect(() => {
    supabase.rpc('is_open_registration_enabled').then(({ data, error }) => {
      if (error) {
        // Default to the safe locked behaviour if the switch cannot be read.
        console.error('Could not read registration setting:', getErrorMessage(error));
        return;
      }
      setOpenRegistration(data === true);
    });
  }, []);

  const set =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.fullName.trim()) { setError('Full name is required'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (form.password !== form.confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
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

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Account was created but no session was established. Please sign in.');

      // Records the selected role, name, phone and barangay in one step.
      const { error: completeError } = await supabase.rpc('public_complete_registration', {
        p_role: form.role,
        p_full_name: form.fullName.trim(),
        p_phone: form.phone || '',
        p_barangay_id: form.barangayId || null,
      });
      if (completeError) throw completeError;

      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Registration failed');
      setError(msg.includes('already registered') ? 'An account with this email already exists' : msg);
    } finally {
      setLoading(false);
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

      <div className="relative z-10 w-full max-w-lg">
        {/* Logo & branding */}
        <div className="text-center mb-5">
          <img src="/logo.png" alt="BiteCare Logo" className="w-16 h-16 mx-auto mb-2 drop-shadow-lg" />
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white drop-shadow-md tracking-tight">
            BiteCare
          </h1>
          <p className="font-display text-white/85 text-xs sm:text-sm font-semibold mt-1.5 drop-shadow leading-snug max-w-xs mx-auto">
            A Mobile &amp; Web Application Animal Bite Management for Monitoring System &amp; Decision Support System
          </p>
          <p className="text-white/60 text-xs font-medium mt-1">Create your account</p>
        </div>

        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-7">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Get started</h2>
          <p className="text-gray-500 text-sm mb-5">Create your BiteCare account</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input id="fullName" type="text" value={form.fullName} onChange={set('fullName')} className="input-field" placeholder="Juan Dela Cruz" required />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input id="email" type="email" value={form.email} onChange={set('email')} className="input-field" placeholder="you@example.com" required autoComplete="email" />
            </div>

            {openRegistration ? (
              <div>
                <label htmlFor="registerRole" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                  <ShieldCheck className="w-4 h-4 text-primary-600" />
                  Select account role
                </label>
                <div className="relative">
                  <select id="registerRole" value={form.role} onChange={set('role')} className="input-field appearance-none pr-10" required>
                    {LOGIN_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                <p className="text-xs text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-2.5 py-2 mt-2">
                  Open registration is enabled for setup and presentation. The role you choose becomes your
                  permanent account role.
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="registerRole" className="block text-sm font-medium text-gray-700 mb-1">Account role</label>
                <div className="relative">
                  <input
                    id="registerRole"
                    type="text"
                    value="Resident"
                    readOnly
                    disabled
                    className="input-field bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                  <Lock className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Public registration creates Resident accounts only. Staff roles are assigned by an administrator.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Contact number (optional)</label>
              <input id="phone" type="tel" value={form.phone} onChange={set('phone')} className="input-field" placeholder="09XX XXX XXXX" />
            </div>

            <div>
              <label htmlFor="barangayId" className="block text-sm font-medium text-gray-700 mb-1">Barangay (optional)</label>
              <div className="relative">
                <select id="barangayId" value={form.barangayId} onChange={set('barangayId')} className="input-field appearance-none pr-10">
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
        </div>

        <p className="mt-5 text-center text-sm text-white/80 drop-shadow">
          Already have an account?{' '}
          <Link to="/login" className="text-white font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
