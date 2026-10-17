import { Construction } from 'lucide-react'
import Card from '../components/Card.jsx'
import EmptyState from '../components/EmptyState.jsx'
import PageHeader from '../components/PageHeader.jsx'

export default function DashboardPlaceholder({ title }) {
  return (
    <>
      <PageHeader title={title} subtitle="This section will be built in a later phase." />
      <Card>
        <EmptyState icon={Construction} title="Nothing here yet" description="This page is not part of the customer experience built so far." />
      </Card>
    </>
  )
}
