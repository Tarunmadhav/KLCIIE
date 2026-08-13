import { ContactRound, Users } from 'lucide-react'
import AmtpsShowcase from '@/components/amtps/AmtpsShowcase'

export default function AmtpsPage() {
  return (
    <div className="min-h-screen">
      <section className="bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 px-4 py-16 text-center text-white">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
          <ContactRound size={32} />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">AMTPS Team</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-primary-100">
          Meet the people behind CIIE — click a card to see their story.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-primary-50">
          <Users size={14} /> Showcasing our team
        </p>
      </section>

      <div className="container-page py-10">
        <AmtpsShowcase />
      </div>
    </div>
  )
}
