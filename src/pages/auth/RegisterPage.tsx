import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { Barangay, UserRole } from '@/types';
import { Eye, EyeOff, Loader2, ChevronDown, AlertCircle, User, ShieldCheck, Stethoscope, Shield } from 'lucide-react';

const ROLE_OPTIONS: { value: UserRole; label: string; description: string; icon: React.ElementType; color: string }[] = [
  { value: 'user', label: 'User Account', description: 'Report incidents and track vaccinations', icon: User, color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { value: 'health_worker', label: 'Health Worker Account', description: 'Manage cases and administer vaccines', icon: Stethoscope, color: 'bg-teal-50 border-teal-200 text-teal-700' },
  { value: 'admin', label: 'Admin Account', description: 'Manage users, facilities, and reports', icon: ShieldCheck, color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { value: 'super_admin', label: 'Super Admin Account', description: 'Full system access and analytics', icon: Shield, color: 'bg-red-50 border-red-200 text-red-700' },
];

export default function RegisterPage() {
  const { signUp } = useAuth();
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('barangays').select('*').order('name').then(({ data }) => {
      if (data) setBarangays(data);
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
            role: form.role,
          },
        },
      });
      if (signUpError) throw signUpError;

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase
          .from('profiles')
          .update({
            phone: form.phone || '',
            barangay_id: form.barangayId || null,
          })
          .eq('id', userData.user.id);
      }

      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg.includes('already registered') ? 'An account with this email already exists' : msg);
    } finally {
      setLoading(false);
    }
  };

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === form.role)!;

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
          <h1 className="text-2xl font-bold text-white drop-shadow-md">BiteCare</h1>
          <p className="text-white/70 text-sm mt-0.5">Create your account</p>
        </div>

        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 p-7">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Get started</h2>
          <p className="text-gray-500 text-sm mb-5">Register as a resident of Bacolod City</p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account type</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isActive = form.role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, role: opt.value }))}
                      className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                        isActive
                          ? `${opt.color} border-current ring-2 ring-current/20`
                          : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-semibold leading-tight">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">{selectedRole.description}</p>
            </div>

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input id="fullName" type="text" value={form.fullName} onChange={set('fullName')} className="input-field" placeholder="Juan Dela Cruz" required />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input id="email" type="email" value={form.email} onChange={set('email')} className="input-field" placeholder="you@example.com" required autoComplete="email" />
            </div>

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
