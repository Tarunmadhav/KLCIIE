import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { BrandingProvider } from '@/hooks/useBranding'
import { SettingsProvider } from '@/hooks/useSettings'
import { RequireAdmin, RequireAuth, RequireCiiieMember, RequireSuperAdmin, MfaResetWatcher } from '@/components/guards'
import { AuthLayout, PublicLayout } from '@/components/Layouts'
import OfflineIndicator from '@/components/OfflineIndicator'

import Home from '@/pages/Home'
import About from '@/pages/About'
import Contact from '@/pages/Contact'
import UpcomingEvents from '@/pages/UpcomingEvents'
import EventsList from '@/pages/EventsList'
import Gallery from '@/pages/Gallery'
import EventDetail from '@/pages/EventDetail'
import EventRegister from '@/pages/EventRegister'
import RegisterSuccess from '@/pages/RegisterSuccess'
import Leaderboard from '@/pages/Leaderboard'
import MembersList from '@/pages/MembersList'
import MemberPublic from '@/pages/MemberPublic'
import PostsList from '@/pages/PostsList'
import PostDetail from '@/pages/PostDetail'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import Register from '@/pages/Register'
import RoleRegister from '@/pages/RoleRegister'
import RoleRegisterSuccess from '@/pages/RoleRegisterSuccess'
import VerifyApplication from '@/pages/VerifyApplication'
import NotFound from '@/pages/NotFound'

import MfaSetup from '@/pages/auth/MfaSetup'
import MfaVerify from '@/pages/auth/MfaVerify'

import MemberLayout from '@/pages/member/MemberLayout'
import MemberDashboard from '@/pages/member/Dashboard'
import MyEvents from '@/pages/member/MyEvents'
import MyPoints from '@/pages/member/MyPoints'
import ProfileEdit from '@/pages/member/ProfileEdit'
import MemberQrPage from '@/pages/member/MemberQr'
import MemberDuties from '@/pages/member/Duties'
import MemberScanQr from '@/pages/member/ScanQr'
import RecruitSuccess from '@/pages/RecruitSuccess'
import RecruitLayout from '@/pages/member/recruit/RecruitLayout'
import RecruitGd from '@/pages/member/recruit/RecruitGd'
import RecruitInterview from '@/pages/member/recruit/RecruitInterview'
import RecruitFinalSelection from '@/pages/member/recruit/RecruitFinalSelection'

import AdminLayout from '@/pages/admin/AdminLayout'
import AdminDashboard from '@/pages/admin/Dashboard'
import EventsAdmin from '@/pages/admin/events/EventsAdmin'
import EventEdit from '@/pages/admin/events/EventEdit'
import EventDetailAdmin from '@/pages/admin/events/EventDetailAdmin'
import EventTeam from '@/pages/admin/events/EventTeam'
import EventRoles from '@/pages/admin/EventRoles'
import PointRules from '@/pages/admin/PointRules'
import PointsAdmin from '@/pages/admin/Points'
import MembersAdmin from '@/pages/admin/MembersAdmin'
import MembersAdd from '@/pages/admin/MembersAdd'
import MemberDetailAdmin from '@/pages/admin/MemberDetailAdmin'
import AttendanceScanner from '@/pages/admin/AttendanceScanner'
import AttendanceAdmin from '@/pages/admin/AttendanceAdmin'
import CertificatesAdmin from '@/pages/admin/Certificates'
import GalleryAdmin from '@/pages/admin/Gallery'
import GalleryLinksAdmin from '@/pages/admin/GalleryLinks'
import AnnouncementsAdmin from '@/pages/admin/Announcements'
import ContentAdmin from '@/pages/admin/Content'
import ReportsAdmin from '@/pages/admin/Reports'
import FormsSubmittedAdmin from '@/pages/admin/FormsSubmitted'
import AttendanceSubmittedAdmin from '@/pages/admin/AttendanceSubmitted'
import BrandingAdmin from '@/pages/admin/Branding'
import AuditLogsAdmin from '@/pages/admin/AuditLogs'
import AdminsAdmin from '@/pages/admin/Admins'
import UserRolesAdmin from '@/pages/admin/UserRoles'
import RecruitsAdmin from '@/pages/admin/Recruits'
import SettingsAdmin from '@/pages/admin/Settings'
import RegistrationKeysAdmin from '@/pages/admin/RegistrationKeys'
import DutiesAdmin from '@/pages/admin/Duties'
import LiveRegistrationsAdmin from '@/pages/admin/recruit/LiveRegistrations'
import RecruitFormsAdmin from '@/pages/admin/recruit/RecruitForms'
import RejectPermissionsAdmin from '@/pages/admin/recruit/RejectPermissions'
import SmtpSettingsAdmin from '@/pages/admin/recruit/SmtpSettings'

export default function App() {
  return (
    <BrandingProvider>
      <SettingsProvider>
        <AuthProvider>
        <BrowserRouter>
          <OfflineIndicator />
          <MfaResetWatcher />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/upcoming-events" element={<UpcomingEvents />} />
              <Route path="/events" element={<EventsList />} />
              <Route path="/events/:id" element={<EventDetail />} />
              <Route path="/events/:id/register" element={<EventRegister />} />
              <Route path="/register/success/:registrationId" element={<RegisterSuccess />} />
              <Route path="/members" element={<MembersList />} />
              <Route path="/members/:id" element={<MemberPublic />} />
              <Route path="/posts" element={<PostsList />} />
              <Route path="/posts/:slug" element={<PostDetail />} />
              <Route path="/gallery" element={<Gallery />} />

              <Route element={<RequireAuth />}>
                <Route path="/dashboard" element={<MemberLayout />}>
                  <Route index element={<MemberDashboard />} />
                  <Route path="events" element={<MyEvents />} />
                  <Route path="points" element={<MyPoints />} />
                  <Route path="leaderboard" element={<Leaderboard />} />
                  <Route path="duties" element={<RequireCiiieMember><MemberDuties /></RequireCiiieMember>} />
                  <Route path="scan-qr" element={<RequireCiiieMember><MemberScanQr /></RequireCiiieMember>} />
                  <Route path="profile" element={<ProfileEdit />} />
                  <Route path="qr" element={<MemberQrPage />} />
                </Route>
                <Route path="/recruit" element={<RequireCiiieMember><RecruitLayout /></RequireCiiieMember>}>
                  <Route path="gd" element={<RecruitGd />} />
                  <Route path="interview" element={<RecruitInterview />} />
                  <Route path="final" element={<RecruitFinalSelection />} />
                </Route>
                <Route path="/leaderboard" element={<Navigate to="/dashboard/leaderboard" replace />} />
                <Route path="/recruit/success" element={<RecruitSuccess />} />
              </Route>
            </Route>

            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/register" element={<Register />} />
              <Route path="/register/:slug" element={<RoleRegister />} />
              <Route path="/register/role/success" element={<RoleRegisterSuccess />} />
              <Route path="/verify-application" element={<VerifyApplication />} />
            </Route>

            <Route path="/auth/mfa-setup" element={<MfaSetup />} />
            <Route path="/auth/mfa-verify" element={<MfaVerify />} />

            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="events" element={<EventsAdmin />} />
                <Route path="events/new" element={<EventEdit />} />
                <Route path="events/:id" element={<EventDetailAdmin />} />
                <Route path="events/:id/edit" element={<EventEdit />} />
                <Route path="events/:id/team" element={<EventTeam />} />
                <Route path="roles" element={<EventRoles />} />
                <Route path="point-rules" element={<PointRules />} />
                <Route path="points" element={<RequireSuperAdmin><PointsAdmin /></RequireSuperAdmin>} />
                <Route path="members" element={<MembersAdmin />} />
<Route path="members/add" element={<MembersAdd />} />
                <Route path="members/:id" element={<MemberDetailAdmin />} />
                <Route path="recruits" element={<RecruitsAdmin />} />
                <Route path="attendance" element={<AttendanceAdmin />} />
                <Route path="attendance/:eventId" element={<AttendanceScanner />} />
                <Route path="duties" element={<DutiesAdmin />} />
                <Route path="certificates" element={<CertificatesAdmin />} />
                <Route path="gallery" element={<GalleryAdmin />} />
                <Route path="gallery-links" element={<GalleryLinksAdmin />} />
                <Route path="announcements" element={<AnnouncementsAdmin />} />
                <Route path="content" element={<ContentAdmin />} />
                <Route path="reports" element={<ReportsAdmin />} />
                <Route path="forms-submitted" element={<FormsSubmittedAdmin />} />
                <Route path="attendance-records" element={<AttendanceSubmittedAdmin />} />
                <Route path="branding" element={<BrandingAdmin />} />
                <Route path="settings" element={<SettingsAdmin />} />
                <Route path="registration-keys" element={<RegistrationKeysAdmin />} />
                <Route path="live-registrations" element={<LiveRegistrationsAdmin />} />
                <Route path="recruit-forms" element={<RecruitFormsAdmin />} />
                <Route path="reject-permissions" element={<RejectPermissionsAdmin />} />
                <Route path="smtp" element={<RequireSuperAdmin><SmtpSettingsAdmin /></RequireSuperAdmin>} />
                <Route path="audit-logs" element={<AuditLogsAdmin />} />
                <Route path="admins" element={<AdminsAdmin />} />
                <Route path="user-roles" element={<RequireSuperAdmin><UserRolesAdmin /></RequireSuperAdmin>} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </SettingsProvider>
    </BrandingProvider>
  )
}
