import Dashboard from '../pages/customer/Dashboard.jsx'
import OrderDetails from '../pages/customer/OrderDetails.jsx'
import Orders from '../pages/customer/Orders.jsx'
import RequestReturn from '../pages/customer/RequestReturn.jsx'
import ReturnDetails from '../pages/customer/ReturnDetails.jsx'
import Refunds from '../pages/customer/Refunds.jsx'
import Returns from '../pages/customer/Returns.jsx'
import DashboardPlaceholder from '../pages/DashboardPlaceholder.jsx'
import ProfilePage from '../pages/shared/ProfilePage.jsx'

// Child routes of /dashboard for the customer role.
export const customerRoutes = [
  { index: true, element: <Dashboard /> },
  { path: 'orders', element: <Orders /> },
  { path: 'orders/:id', element: <OrderDetails /> },
  { path: 'returns', element: <Returns /> },
  { path: 'returns/new', element: <RequestReturn /> },
  { path: 'returns/:id', element: <ReturnDetails /> },
  { path: 'refunds', element: <Refunds /> },
  { path: 'profile', element: <ProfilePage /> },
  { path: 'settings', element: <DashboardPlaceholder title="Settings" /> },
]
