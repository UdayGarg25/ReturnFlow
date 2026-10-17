import DashboardPlaceholder from '../pages/DashboardPlaceholder.jsx'
import Dashboard from '../pages/pickup/Dashboard.jsx'
import History from '../pages/pickup/History.jsx'
import PickupDetails from '../pages/pickup/PickupDetails.jsx'
import Pickups from '../pages/pickup/Pickups.jsx'
import ProfilePage from '../pages/shared/ProfilePage.jsx'

// Child routes of /dashboard for the pickup agent role.
export const pickupRoutes = [
  { index: true, element: <Dashboard /> },
  { path: 'pickups', element: <Pickups /> },
  { path: 'pickups/:id', element: <PickupDetails /> },
  { path: 'history', element: <History /> },
  { path: 'profile', element: <ProfilePage showPhoto /> },
  { path: 'settings', element: <DashboardPlaceholder title="Settings" /> },
]
