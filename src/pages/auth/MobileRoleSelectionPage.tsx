import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Stethoscope, User, IdCard } from 'lucide-react';
import InstallAppButton from '@/components/auth/InstallAppButton';
import { useIsMobile } from '@/lib/useIsMobile';

/**
 * The phone-sized role chooser. Only Resident/User and Health Worker/Staff are
 * offered here; Super Admin and Admin remain available on tablet and desktop.
 * This is a navigation convenience, never a security boundary — the database
 * and edge functions still enforce the signed-in account's real role.
 */
export default function MobileRoleSelectionPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Tablet and desktop keep their existing role-selection landing page.
  if (!isMobile) return <Navigate to="/" replace />;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative"
      style={{
        backgroundImage: 'url(/background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />

      <div className="relative z-10 w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-white/85 hover:text-white text-sm font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center mb-6">
          <img src="/logo.png" alt="BiteCare Logo" className="w-20 h-20 mx-auto mb-3 drop-shadow-lg" />
          <h1 className="font-display text-3xl font-extrabold text-white drop-shadow-md tracking-tight">BiteCare</h1>
          <h2 className="text-lg font-bold text-white drop-shadow-md mt-4">Choose your role</h2>
          <p className="text-white/70 text-sm mt-1 drop-shadow">
            Pick the account type you sign in with
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/login?role=user')}
            className="group w-full flex items-center gap-4 bg-white/95 backdrop-blur-md rounded-2xl border-2 border-white/30 p-5 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:-translate-y-1"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center flex-shrink-0 transition-colors">
              <User className="w-7 h-7 text-amber-600" />
            </div>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-gray-900">Resident/User</span>
              <span className="block text-sm text-gray-500 mt-0.5">Sign in with your mobile number</span>
            </span>
            <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0 transition-transform group-hover:translate-x-1 group-hover:text-primary-500" />
          </button>

          <button
            onClick={() => navigate('/login?role=health_worker')}
            className="group w-full flex items-center gap-4 bg-white/95 backdrop-blur-md rounded-2xl border-2 border-white/30 p-5 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:-translate-y-1"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center flex-shrink-0 transition-colors">
              <Stethoscope className="w-7 h-7 text-emerald-600" />
            </div>
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold text-gray-900">Health Worker / Staff</span>
              <span className="block text-sm text-gray-500 mt-0.5">Use your staff login ID</span>
            </span>
            <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0 transition-transform group-hover:translate-x-1 group-hover:text-primary-500" />
          </button>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => navigate('/login?role=health_worker')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm font-medium border border-white/25 transition-colors"
          >
            <IdCard className="w-4 h-4" />
            Use Staff Login
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          <InstallAppButton />
        </div>
      </div>
    </div>
  );
}
