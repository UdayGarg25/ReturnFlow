import { ArrowRight, Boxes, ClipboardCheck, ScanSearch, Store, Truck, User, UserRound, Warehouse } from 'lucide-react'
import Button from '../components/Button.jsx'
import FeatureCard from '../components/FeatureCard.jsx'
import RoleFlow from '../components/RoleFlow.jsx'

const features = [
  { icon: UserRound, title: 'Easy Returns', description: 'for Customers', tone: 'bg-blue-100 text-blue-600' },
  { icon: Store, title: 'Efficient Workflow', description: 'for Sellers', tone: 'bg-emerald-100 text-emerald-600' },
  { icon: Truck, title: 'Smooth Pickup', description: 'for Agents', tone: 'bg-orange-100 text-orange-600' },
  { icon: ScanSearch, title: 'AI Inspection', description: 'for Warehouse', tone: 'bg-violet-100 text-violet-600' },
]

const steps = [
  { icon: User, title: 'Customer requests', text: 'Pick the item, choose a reason and upload a photo.' },
  { icon: ClipboardCheck, title: 'Seller reviews', text: 'Approve or reject the request with a clear decision trail.' },
  { icon: Truck, title: 'Agent collects', text: 'A pickup agent is assigned and collects the item.' },
  { icon: Warehouse, title: 'Warehouse inspects', text: 'AI assists the inspection, staff make the final call, then the refund is issued.' },
]

export default function Home() {
  return (
    <>
      <section id="home" className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-2 lg:px-8">
          <div>
            <span className="inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
              AI-Assisted Returns Management
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-5xl">
              Simplify Returns
              <span className="block bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
                For Everyone
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600 sm:text-lg">
              A complete return management platform for customers, sellers, and logistics partners with
              AI-powered inspection and real-time tracking.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to="/register" size="lg">
                Get Started <ArrowRight size={16} aria-hidden="true" />
              </Button>
              <Button to="/demo" variant="outline" size="lg">Explore Live Demo <ArrowRight size={16} aria-hidden="true" /></Button>
            </div>
          </div>
          <RoleFlow />
        </div>

        <div id="features" className="relative mx-auto max-w-7xl scroll-mt-20 px-4 pb-14 sm:px-6 lg:px-8">
          <div className="grid gap-6 rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-card backdrop-blur sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => <FeatureCard key={f.title} {...f} />)}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-16 bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-navy-900">How It Works</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-slate-500">One connected workflow from request to refund.</p>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-2xl border border-slate-200/70 bg-slate-50 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-semibold text-navy-900">{i + 1}. {title}</h3>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="about" className="scroll-mt-16 bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-navy-900 text-white">
            <Boxes size={24} aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-3xl font-bold text-navy-900">About ReturnFlow</h2>
          <p className="mt-3 text-slate-600">
            ReturnFlow brings customers, sellers, pickup agents and warehouse teams onto one platform, so every
            return has a clear owner, a clear status and a clear outcome.
          </p>
        </div>
      </section>
    </>
  )
}
