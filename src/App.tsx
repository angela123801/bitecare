import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';

import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import DashboardPage from '@/pages/shared/DashboardPage';
import ProfilePage from '@/pages/shared/ProfilePage';
import NotificationsPage from '@/pages/shared/NotificationsPage';
import MapPage from '@/pages/shared/MapPage';
import EducationPage from '@/pages/shared/EducationPage';
import FirstAidPage from '@/pages/shared/FirstAidPage';
import MyReportsPage from '@/pages/user/MyReportsPage';
import NewReportPage from '@/pages/user/NewReportPage';
import ReportDetailPage from '@/pages/user/ReportDetailPage';
import MyVaccinationsPage from '@/pages/user/MyVaccinationsPage';
import AllReportsPage from '@/pages/admin/AllReportsPage';
import UserManagementPage from '@/pages/admin/UserManagementPage';
import CreateAccountPage from '@/pages/admin/CreateAccountPage';
import FacilityManagementPage from '@/pages/admin/FacilityManagementPage';
import EducationManagementPage from '@/pages/admin/EducationManagementPage';
import VaccinationManagementPage from '@/pages/shared/VaccinationManagementPage';
import AppointmentsPage from '@/pages/shared/AppointmentsPage';
import AuditLogPage from '@/pages/admin/AuditLogPage';
import AnalyticsPage from '@/pages/admin/AnalyticsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/education" element={<EducationPage />} />
            <Route path="/first-aid" element={<FirstAidPage />} />

            {/* User */}
            <Route path="/my-reports" element={<MyReportsPage />} />
            <Route path="/reports/new" element={<NewReportPage />} />
            <Route path="/reports/:id" element={<ReportDetailPage />} />
            <Route path="/my-vaccinations" element={<MyVaccinationsPage />} />

            {/* Health Worker+ */}
            <Route path="/vaccinations" element={<ProtectedRoute minRole="health_worker"><VaccinationManagementPage /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute minRole="health_worker"><AppointmentsPage /></ProtectedRoute>} />
            <Route path="/cases" element={<ProtectedRoute minRole="health_worker"><AllReportsPage /></ProtectedRoute>} />
            <Route path="/cases/:id" element={<ProtectedRoute minRole="health_worker"><ReportDetailPage /></ProtectedRoute>} />

            {/* Admin+ */}
            <Route path="/admin/reports" element={<ProtectedRoute minRole="admin"><AllReportsPage /></ProtectedRoute>} />
            <Route path="/admin/reports/:id" element={<ProtectedRoute minRole="admin"><ReportDetailPage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute minRole="admin"><UserManagementPage /></ProtectedRoute>} />
            <Route path="/admin/users/new" element={<ProtectedRoute minRole="admin"><CreateAccountPage /></ProtectedRoute>} />
            <Route path="/admin/facilities" element={<ProtectedRoute minRole="admin"><FacilityManagementPage /></ProtectedRoute>} />
            <Route path="/admin/education" element={<ProtectedRoute minRole="admin"><EducationManagementPage /></ProtectedRoute>} />

            {/* Super Admin */}
            <Route path="/admin/audit-log" element={<ProtectedRoute minRole="super_admin"><AuditLogPage /></ProtectedRoute>} />
            <Route path="/admin/analytics" element={<ProtectedRoute minRole="super_admin"><AnalyticsPage /></ProtectedRoute>} />
          </Route>

          {/* Fallback */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
