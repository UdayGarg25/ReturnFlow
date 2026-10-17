import { Route, Routes } from 'react-router-dom'
import GuestRoute from '../components/GuestRoute.jsx'
import ProtectedRoute from '../components/ProtectedRoute.jsx'
import PublicLayout from '../layouts/PublicLayout.jsx'
import AcceptInvitation from '../pages/AcceptInvitation.jsx'
import Demo from '../pages/Demo.jsx'
import Home from '../pages/Home.jsx'
import Login from '../pages/Login.jsx'
import NotFound from '../pages/NotFound.jsx'
import Register from '../pages/Register.jsx'
import AdminRoutes from './adminRoutes.jsx'
import RoleDashboard from './RoleDashboard.jsx'

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/demo" element={<Demo />} />
      </Route>
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />

      {/* Public: opened from an invitation email (the token in the link is the credential) */}
      <Route path="/accept-invitation" element={<AcceptInvitation />} />

      {/* Administrators only (see adminRoutes) */}
      <Route path="/admin/*" element={<ProtectedRoute><AdminRoutes /></ProtectedRoute>} />

      {/* Needs a session; which pages inside depend on user.role (see RoleDashboard) */}
      <Route path="/dashboard/*" element={<ProtectedRoute><RoleDashboard /></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
