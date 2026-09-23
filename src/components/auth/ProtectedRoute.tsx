import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  minRole?: UserRole;
}

export function ProtectedRoute({ children, minRole }: ProtectedRouteProps) {
  const { user, profile, loading, profileLoading, isRoleAtLeast } = useAuth();
  const location = useLocation();

  if (loading || (user && !profile && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow-sm border max-w-md text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Account Deactivated</h2>
          <p className="text-gray-600 text-sm">
            Your account has been deactivated. Please contact an administrator for assistance.
          </p>
        </div>
      </div>
    );
  }

  if (profile.verification_status === 'pending_verification') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow-sm border max-w-md text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Verification Pending</h2>
          <p className="text-gray-600 text-sm">
            This account has not been verified yet. An administrator must confirm the verification
            code before you can sign in.
          </p>
        </div>
      </div>
    );
  }

  if (minRole && !isRoleAtLeast(minRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

interface RoleGateProps {
  children: React.ReactNode;
  minRole: UserRole;
  fallback?: React.ReactNode;
}

export function RoleGate({ children, minRole, fallback = null }: RoleGateProps) {
  const { isRoleAtLeast } = useAuth();
  if (!isRoleAtLeast(minRole)) return <>{fallback}</>;
  return <>{children}</>;
}
