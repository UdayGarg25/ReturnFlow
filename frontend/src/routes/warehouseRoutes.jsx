import DashboardPlaceholder from '../pages/DashboardPlaceholder.jsx'
import ProfilePage from '../pages/shared/ProfilePage.jsx'
import CompletedInspections from '../pages/warehouse/CompletedInspections.jsx'
import AiTestScenario from '../pages/warehouse/AiTestScenario.jsx'
import Dashboard from '../pages/warehouse/Dashboard.jsx'
import InspectionDetails from '../pages/warehouse/InspectionDetails.jsx'
import Inspections from '../pages/warehouse/Inspections.jsx'
import Refunds from '../pages/warehouse/Refunds.jsx'

// Child routes of /dashboard for the warehouse role. The static "history" path
// ranks above the dynamic ":id" one, so it is never read as a return ID.
export const warehouseRoutes = [
  { index: true, element: <Dashboard /> },
  { path: 'inspections', element: <Inspections /> },
  { path: 'inspections/history', element: <CompletedInspections /> },
  { path: 'inspections/:id', element: <InspectionDetails /> },
  { path: 'refunds', element: <Refunds /> },
  // development-only: the isolated AI test scenario (the route does not exist in a production build)
  ...(import.meta.env.DEV ? [{ path: 'dev/ai-test', element: <AiTestScenario /> }] : []),
  { path: 'profile', element: <ProfilePage showPhoto /> },
  { path: 'settings', element: <DashboardPlaceholder title="Settings" /> },
]
