// The pre-configured demo accounts (they exist in the seeded PostgreSQL data; see backend/src/config/seed.sql).
// These credentials are public on purpose: they only open demo data.
import { Crown, Store, Truck, User, Warehouse } from 'lucide-react'

export const DEMO_PASSWORD = 'Password123!'

export const DEMO_ACCOUNTS = [
  {
    role: 'CUSTOMER', label: 'Customer', name: 'Alice', email: 'alice@returnflow.test', icon: User,
    description: 'Manage orders, request returns and track return progress.',
    card: 'border-emerald-200 bg-emerald-50/60', badge: 'bg-emerald-100 text-emerald-700',
  },
  {
    role: 'SELLER', label: 'Seller', name: 'Sam', email: 'sam@returnflow.test', icon: Store,
    description: 'Manage products, orders and return requests, and review analytics.',
    card: 'border-blue-200 bg-blue-50/60', badge: 'bg-blue-100 text-blue-700',
  },
  {
    role: 'PICKUP_AGENT', label: 'Pickup Agent', name: 'Pete', email: 'pete@returnflow.test', icon: Truck,
    description: 'View assigned pickups, accept them and update pickup status.',
    card: 'border-orange-200 bg-orange-50/60', badge: 'bg-orange-100 text-orange-700',
  },
  {
    role: 'WAREHOUSE', label: 'Warehouse', name: 'Wendy', email: 'wendy@returnflow.test', icon: Warehouse,
    description: 'Inspect returned items, read AI results and make the final decision.',
    card: 'border-violet-200 bg-violet-50/60', badge: 'bg-violet-100 text-violet-700',
  },
]

export const DEMO_ADMIN = {
  role: 'ADMIN', label: 'Admin', name: 'Admin Demo', email: 'admin@returnflow.test', icon: Crown,
  description: 'Log in as admin to explore user management, invitations and role-based access.',
  card: 'border-indigo-200 bg-indigo-50/60', badge: 'bg-indigo-100 text-indigo-700',
}

// who the guided demo may be run as (only these emails count as "in the demo")
export const DEMO_EMAILS = new Set(DEMO_ACCOUNTS.map((a) => a.email))
