import DashboardPlaceholder from '../pages/DashboardPlaceholder.jsx'
import Analytics from '../pages/seller/Analytics.jsx'
import Dashboard from '../pages/seller/Dashboard.jsx'
import OrderDetails from '../pages/seller/OrderDetails.jsx'
import Orders from '../pages/seller/Orders.jsx'
import ProductFormPage from '../pages/seller/ProductFormPage.jsx'
import Products from '../pages/seller/Products.jsx'
import ReturnDetails from '../pages/seller/ReturnDetails.jsx'
import Returns from '../pages/seller/Returns.jsx'
import ProfilePage from '../pages/shared/ProfilePage.jsx'

// Child routes of /dashboard for the seller role.
export const sellerRoutes = [
  { index: true, element: <Dashboard /> },
  { path: 'products', element: <Products /> },
  { path: 'products/new', element: <ProductFormPage /> },
  { path: 'products/:id', element: <ProductFormPage /> },
  { path: 'orders', element: <Orders /> },
  { path: 'orders/:id', element: <OrderDetails /> },
  { path: 'returns', element: <Returns /> },
  { path: 'returns/:id', element: <ReturnDetails /> },
  { path: 'analytics', element: <Analytics /> },
  { path: 'profile', element: <ProfilePage showPhoto /> },
  { path: 'settings', element: <DashboardPlaceholder title="Settings" /> },
]
