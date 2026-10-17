import { Compass, Crown, Rocket, Users } from 'lucide-react'
import { ErrorState, LoadingState } from '../components/ApiState.jsx'
import DemoAccountCard from '../components/demo/DemoAccountCard.jsx'
import GuidedDemo from '../components/demo/GuidedDemo.jsx'
import useApi from '../hooks/useApi.js'
import { getDemoEnabled } from '../services/demoService.js'
import { DEMO_ACCOUNTS, DEMO_ADMIN } from '../utils/demoAccounts.js'

const OVERVIEW = [
  { href: '#guided', icon: Rocket, title: 'Guided End-to-End Demo', text: 'Follow a return from customer request to refund.', tone: 'border-blue-200 bg-blue-50/60', badge: 'bg-blue-100 text-blue-600' },
  { href: '#accounts', icon: Users, title: 'Explore Demo Accounts', text: 'Log into pre-configured operational roles.', tone: 'border-emerald-200 bg-emerald-50/60', badge: 'bg-emerald-100 text-emerald-600' },
  { href: '#admin', icon: Crown, title: 'Platform Administration', text: 'Explore users, invitations and role-based access.', tone: 'border-indigo-200 bg-indigo-50/60', badge: 'bg-indigo-100 text-indigo-600' },
]

const ADMIN_CAN = [
  'Invite new team members by email',
  'Assign an operational role (Seller, Pickup Agent, Warehouse)',
  'See every existing user',
  'Track invitation status; resend or cancel invitations',
]

function Section({ id, title, text, children }) {
  return (
    <section id={id} className="scroll-mt-20 py-10">
      <h2 className="text-2xl font-bold text-navy-900 sm:text-3xl">{title}</h2>
      <p className="mt-1 max-w-3xl text-slate-600">{text}</p>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export default function Demo() {
  const status = useApi((signal) => getDemoEnabled({ signal }))

  return (
    <div className="bg-gradient-to-b from-brand-50/60 via-white to-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700"><Compass size={14} aria-hidden="true" /> Explore Live Demo</span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-navy-900 sm:text-5xl">Experience ReturnFlow</h1>
          <p className="mt-3 text-slate-600">Follow a complete return from customer request to refund, or explore each operational role independently. Everything you see is real data from the ReturnFlow database.</p>
        </header>

        {status.loading ? (
          <div className="mt-10"><LoadingState label="Checking the demo..." /></div>
        ) : status.error ? (
          <div className="mt-10"><ErrorState error={status.error} onRetry={status.reload} /></div>
        ) : !status.data ? (
          <p className="mx-auto mt-10 max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-600">The live demo is not enabled on this server.</p>
        ) : (
          <>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {OVERVIEW.map(({ href, icon: Icon, title, text, tone, badge }) => (
                <li key={href}>
                  <a href={href} className={`flex h-full items-start gap-4 rounded-2xl border p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}>
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${badge}`}><Icon size={22} aria-hidden="true" /></span>
                    <span><span className="block font-bold text-navy-900">{title}</span><span className="mt-1 block text-sm text-slate-600">{text}</span></span>
                  </a>
                </li>
              ))}
            </ul>

            <Section id="guided" title="Guided End-to-End Demo" text="Follow one return from customer request to refund. Alice's Sony WH-1000XM5 is sold by Sam, collected by Pete and inspected by Wendy; each step uses the real ReturnFlow APIs and changes the real database.">
              <GuidedDemo />
            </Section>

            <Section id="accounts" title="Explore Demo Accounts" text="Want to explore ReturnFlow on your own? Use these pre-configured accounts to experience each operational role independently. They contain realistic sample data.">
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {DEMO_ACCOUNTS.map((a) => <DemoAccountCard key={a.role} account={a} />)}
              </div>
              <p className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                These accounts participate in the same connected demo scenario. You can log into each role independently and follow the return as it moves through the system.
              </p>
            </Section>

            <Section id="admin" title="Platform Administration" text="See how administrators manage users, invitations and role-based access. This is a separate account with elevated privileges.">
              <div className="grid gap-5 lg:grid-cols-2">
                <DemoAccountCard account={DEMO_ADMIN} />
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
                  <h3 className="text-lg font-bold text-navy-900">What an admin can do</h3>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {ADMIN_CAN.map((t) => <li key={t} className="flex gap-2"><span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />{t}</li>)}
                  </ul>
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    Roles are assigned by the server from the invitation, never chosen in the browser, and ADMIN can never be invited. Logging in here sends no email; an
                    invitation email is only sent when an admin deliberately invites an address.
                  </p>
                </div>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
