import { useNavigate } from 'react-router-dom';
import { Shield, UserCog, Stethoscope, User, ArrowRight } from 'lucide-react';
import { ROLE_LABELS } from '@/config/constants';
import { useInstallApp } from '@/lib/installPrompt';
import { Loader2, Download, Smartphone } from 'lucide-react';
import { useState } from 'react';

interface RoleCard {
  role: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

const roles: RoleCard[] = [
  {
    role: 'super_admin',
    icon: <Shield className="w-8 h-8" />,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50 group-hover:bg-rose-100',
    borderColor: 'border-rose-200 group-hover:border-rose-300',
    description: 'Full system control, analytics, and account management',
  },
  {
    role: 'admin',
    icon: <UserCog className="w-8 h-8" />,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 group-hover:bg-blue-100',
    borderColor: 'border-blue-200 group-hover:border-blue-300',
    description: 'Manage users, facilities, reports and education',
  },
  {
    role: 'health_worker',
    icon: <Stethoscope className="w-8 h-8" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 group-hover:bg-emerald-100',
    borderColor: 'border-emerald-200 group-hover:border-emerald-300',
    description: 'Patient care, vaccinations and appointments',
  },
  {
    role: 'user',
    icon: <User className="w-8 h-8" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 group-hover:bg-amber-100',
    borderColor: 'border-amber-200 group-hover:border-amber-300',
    description: 'Report bites and track your treatment records',
  },
];

export default function RoleSelectionPage() {
  const navigate = useNavigate();
  const { canInstall, install, installing, platform } = useInstallApp();
  const [showIosHelp, setShowIosHelp] = useState(false);

  const handleInstall = async () => {
    if (platform === 'ios') {
      setShowIosHelp(true);
      return;
    }
    await install();
  };

  const handleRoleSelect = (role: string) => {
    navigate(`/login?role=${role}`, { replace: true });
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative"
      style={{
        backgroundImage: 'url(/background.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/60" />

      <div className="relative z-10 w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="BiteCare Logo"
            className="w-24 h-24 mx-auto mb-4 drop-shadow-lg"
          />
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-white drop-shadow-md tracking-tight">
            BiteCare
          </h1>
          <p className="font-display text-white/90 text-sm sm:text-base font-semibold mt-2 drop-shadow leading-snug max-w-md mx-auto">
            Animal Bite Management &amp; Monitoring System
          </p>
          <p className="text-white/60 text-xs font-medium mt-1">Bacolod City, Negros Occidental</p>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white drop-shadow-md">
            Select Your Role
          </h2>
          <p className="text-white/70 text-sm mt-1 drop-shadow">
            Choose your account type to continue
          </p>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {roles.map((r) => (
            <button
              key={r.role}
              onClick={() => handleRoleSelect(r.role)}
              className="group relative bg-white/95 backdrop-blur-md rounded-2xl border-2 p-5 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:-translate-y-1"
              style={{
                borderColor: 'rgba(255,255,255,0.3)',
              }}
            >
              <div className={`w-14 h-14 rounded-2xl ${r.bgColor} flex items-center justify-center mb-3 transition-colors`}>
                <span className={r.color}>{r.icon}</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 group-hover:text-gray-700 transition-colors">
                {ROLE_LABELS[r.role as keyof typeof ROLE_LABELS]}
              </h3>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                {r.description}
              </p>
              <div className="flex items-center gap-1.5 mt-3 text-xs font-semibold text-primary-600">
                <span>Sign in</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>

        {/* Install App */}
        {canInstall && (
          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm font-medium border border-white/25 transition-colors disabled:opacity-60"
            >
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Install app on this device
            </button>
            {showIosHelp && (
              <p className="flex items-start gap-2 max-w-xs text-xs text-white/85 text-left bg-black/35 backdrop-blur-sm rounded-lg p-3">
                <Smartphone className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Tap the Share button in Safari, then choose Add to Home Screen.</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
