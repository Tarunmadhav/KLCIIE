import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import { BrandingProvider } from '@/hooks/useBranding'
import { SettingsProvider } from '@/hooks/useSettings'
import { RequireAdmin, RequireAuth, RequireCiiieMember, RequireSuperAdmin, MfaResetWatcher } from '@/components/guards'
import { AuthLayout, PublicLayout } from '@/components/Layouts'
import OfflineIndicator from '@/components/OfflineIndicator'
import { PageLoader } from '@/components/ui'

const Home = lazy(() => import('@/pages/Home'))
const About = lazy(() => import('@/pages/About'))
const Contact = lazy(() => import('@/pages/Contact'))
const UpcomingEvents = lazy(() => import('@/pages/UpcomingEvents'))
const EventsList = lazy(() => import('@/pages/EventsList'))
const Gallery = lazy(() => import('@/pages/Gallery'))
const EventDetail = lazy(() => import('@/pages/EventDetail'))
const EventRegister = lazy(() => import('@/pages/EventRegister'))
const RegisterSuccess = lazy(() => import('@/pages/RegisterSuccess'))
const Leaderboard = lazy(() => import('@/pages/Leaderboard'))
const MembersList = lazy(() => import('@/pages/MembersList'))
const MemberPublic = lazy(() => import('@/pages/MemberPublic'))
const AmtpsPage = lazy(() => import('@/pages/AmtpsPage'))
const AmtpsMemberPage = lazy(() => import('@/pages/AmtpsMemberPage'))
const StartupsPage = lazy(() => import('@/pages/StartupsPage'))
const PostsList = lazy(() => import('@/pages/PostsList'))
const PostDetail = lazy(() => import('@/pages/PostDetail'))
const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const Register = lazy(() => import('@/pages/Register'))
const RoleRegister = lazy(() => import('@/pages/RoleRegister'))
const RoleRegisterSuccess = lazy(() => import('@/pages/RoleRegisterSuccess'))
const VerifyApplication = lazy(() => import('@/pages/VerifyApplication'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const MfaSetup = lazy(() => import('@/pages/auth/MfaSetup'))
const MfaVerify = lazy(() => import('@/pages/auth/MfaVerify'))

const MemberLayout = lazy(() => import('@/pages/member/MemberLayout'))
const MemberDashboard = lazy(() => import('@/pages/member/Dashboard'))
const MyEvents = lazy(() => import('@/pages/member/MyEvents'))
const MyPoints = lazy(() => import('@/pages/member/MyPoints'))
const ProfileEdit = lazy(() => import('@/pages/member/ProfileEdit'))
const MemberQrPage = lazy(() => import('@/pages/member/MemberQr'))
const MemberDuties = lazy(() => import('@/pages/member/Duties'))
const MemberScanQr = lazy(() => import('@/pages/member/ScanQr'))
const RecruitSuccess = lazy(() => import('@/pages/RecruitSuccess'))
const RecruitLayout = lazy(() => import('@/pages/member/recruit/RecruitLayout'))
const RecruitGd = lazy(() => import('@/pages/member/recruit/RecruitGd'))
const RecruitInterview = lazy(() => import('@/pages/member/recruit/RecruitInterview'))
const RecruitFinalSelection = lazy(() => import('@/pages/member/recruit/RecruitFinalSelection'))

const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const EventsAdmin = lazy(() => import('@/pages/admin/events/EventsAdmin'))
const EventEdit = lazy(() => import('@/pages/admin/events/EventEdit'))
const EventDetailAdmin = lazy(() => import('@/pages/admin/events/EventDetailAdmin'))
const EventTeam = lazy(() => import('@/pages/admin/events/EventTeam'))
const EventRoles = lazy(() => import('@/pages/admin/EventRoles'))
const PointRules = lazy(() => import('@/pages/admin/PointRules'))
const PointsAdmin = lazy(() => import('@/pages/admin/Points'))
const MembersAdmin = lazy(() => import('@/pages/admin/MembersAdmin'))
const MembersAdd = lazy(() => import('@/pages/admin/MembersAdd'))
const AmtpsAdmin = lazy(() => import('@/pages/admin/AmtpsAdmin'))
const MemberDetailAdmin = lazy(() => import('@/pages/admin/MemberDetailAdmin'))
const AttendanceScanner = lazy(() => import('@/pages/admin/AttendanceScanner'))
const AttendanceAdmin = lazy(() => import('@/pages/admin/AttendanceAdmin'))
const CertificatesAdmin = lazy(() => import('@/pages/admin/Certificates'))
const GalleryAdmin = lazy(() => import('@/pages/admin/Gallery'))
const GalleryLinksAdmin = lazy(() => import('@/pages/admin/GalleryLinks'))
const AnnouncementsAdmin = lazy(() => import('@/pages/admin/Announcements'))
const ContentAdmin = lazy(() => import('@/pages/admin/Content'))
const ReportsAdmin = lazy(() => import('@/pages/admin/Reports'))
const FormsSubmittedAdmin = lazy(() => import('@/pages/admin/FormsSubmitted'))
const AttendanceSubmittedAdmin = lazy(() => import('@/pages/admin/AttendanceSubmitted'))
const BrandingAdmin = lazy(() => import('@/pages/admin/Branding'))
const AuditLogsAdmin = lazy(() => import('@/pages/admin/AuditLogs'))
const AdminsAdmin = lazy(() => import('@/pages/admin/Admins'))
const UserRolesAdmin = lazy(() => import('@/pages/admin/UserRoles'))
const RecruitsAdmin = lazy(() => import('@/pages/admin/Recruits'))
const SettingsAdmin = lazy(() => import('@/pages/admin/Settings'))
const RegistrationKeysAdmin = lazy(() => import('@/pages/admin/RegistrationKeys'))
const DutiesAdmin = lazy(() => import('@/pages/admin/Duties'))
const LiveRegistrationsAdmin = lazy(() => import('@/pages/admin/recruit/LiveRegistrations'))
const RecruitFormsAdmin = lazy(() => import('@/pages/admin/recruit/RecruitForms'))
const RejectPermissionsAdmin = lazy(() => import('@/pages/admin/recruit/RejectPermissions'))
const SmtpSettingsAdmin = lazy(() => import('@/pages/admin/recruit/SmtpSettings'))
const SendMailAdmin = lazy(() => import('@/pages/admin/SendMail'))
const StartupsAdmin = lazy(() => import('@/pages/admin/StartupsAdmin'))

export default function App() {
  return (
    <BrandingProvider>
      <SettingsProvider>
        <AuthProvider>
        <BrowserRouter>
          <OfflineIndicator />
          <MfaResetWatcher />
          <Suspense fallback={<PageLoader />}>
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
              <Route path="/amtps" element={<AmtpsPage />} />
              <Route path="/amtps/:id" element={<AmtpsMemberPage />} />
              <Route path="/posts" element={<PostsList />} />
              <Route path="/posts/:slug" element={<PostDetail />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/startups" element={<StartupsPage />} />

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
                <Route path="amtps" element={<RequireSuperAdmin><AmtpsAdmin /></RequireSuperAdmin>} />
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
                <Route path="send-mail" element={<RequireSuperAdmin><SendMailAdmin /></RequireSuperAdmin>} />
                <Route path="audit-logs" element={<AuditLogsAdmin />} />
                <Route path="startups" element={<StartupsAdmin />} />
                <Route path="admins" element={<AdminsAdmin />} />
                <Route path="user-roles" element={<RequireSuperAdmin><UserRolesAdmin /></RequireSuperAdmin>} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
      </SettingsProvider>
    </BrandingProvider>
  )
}
