import {
  Clock,
  Facebook,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  Twitter,
  Youtube,
} from 'lucide-react'
import Reveal from '@/components/Reveal'
import { useBranding } from '@/hooks/useBranding'
import { useSettings } from '@/hooks/useSettings'

const socialBrands: Record<string, string> = {
  Facebook: 'hover:border-[#1877F2] hover:bg-[#1877F2]/5 hover:text-[#1877F2]',
  Instagram: 'hover:border-[#E4405F] hover:bg-[#E4405F]/5 hover:text-[#E4405F]',
  LinkedIn: 'hover:border-[#0A66C2] hover:bg-[#0A66C2]/5 hover:text-[#0A66C2]',
  Twitter: 'hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900',
  YouTube: 'hover:border-[#FF0000] hover:bg-[#FF0000]/5 hover:text-[#FF0000]',
}

export default function Contact() {
  const branding = useBranding()
  const settings = useSettings()

  const socials = [
    { label: 'Facebook', url: settings.facebook_url, icon: Facebook },
    { label: 'Instagram', url: settings.instagram_url, icon: Instagram },
    { label: 'LinkedIn', url: settings.linkedin_url, icon: Linkedin },
    { label: 'Twitter', url: settings.twitter_url, icon: Twitter },
    { label: 'YouTube', url: settings.youtube_url, icon: Youtube },
  ].filter((s) => s.url)

  const cards = [
    {
      icon: Mail,
      title: 'Email',
      value: settings.contact_email ?? 'ciie@kluniversity.in',
      href: `mailto:${settings.contact_email ?? 'ciie@kluniversity.in'}`,
      hint: 'We reply within 1–2 business days',
      gradient: 'from-primary-500 to-fuchsia-500',
    },
    {
      icon: Phone,
      title: 'Phone',
      value: settings.contact_phone ?? 'Reach out to a coordinator',
      href: settings.contact_phone ? `tel:${settings.contact_phone.replace(/[^+\d]/g, '')}` : null,
      hint: 'Mon–Fri, 9am–5pm',
      gradient: 'from-emerald-400 to-teal-500',
    },
    {
      icon: MapPin,
      title: 'Office',
      value: settings.office_address ?? branding.institution_name,
      href: null,
      hint: 'Drop by for a conversation',
      gradient: 'from-sky-400 to-indigo-500',
    },
  ]

  return (
    <div className="overflow-x-clip">
      {/* HERO */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-orb-1 absolute -left-28 -top-36 h-[30rem] w-[30rem] rounded-full bg-primary-600/40 blur-[130px]" />
          <div className="animate-orb-2 absolute -right-28 bottom-[-6rem] h-[26rem] w-[26rem] rounded-full bg-emerald-500/30 blur-[130px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(2,6,23,0.5))]" />
          <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:72px_72px]" />
        </div>

        <div className="container-page relative z-10 py-20 text-center lg:py-28">
          <Reveal>
            <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white">
              <MessageCircle size={14} className="text-primary-300" /> Contact
            </span>
          </Reveal>
          <Reveal delay={120}>
            <h1 className="mt-6 font-display text-4xl font-black leading-tight tracking-tight sm:text-6xl">
              Let's <span className="text-gradient-animated">talk</span>
            </h1>
          </Reveal>
          <Reveal delay={240}>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
              Questions about membership, events or CIIE itself? Reach out to us — we'd love to hear from you.
            </p>
          </Reveal>
          <Reveal delay={360}>
            <a
              href={`mailto:${settings.contact_email ?? 'ciie@kluniversity.in'}`}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-900 shadow-[0_0_36px_rgba(139,92,246,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(139,92,246,0.7)]"
            >
              <Send size={15} /> Send us a message
            </a>
          </Reveal>
        </div>
      </section>

      {/* CONTACT CARDS */}
      <section className="container-page py-16">
        <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-3">
          {cards.map((card, i) => (
            <Reveal key={card.title} delay={i * 120} variant="zoom">
              <div className="glass-card group h-full p-7 text-center hover:-translate-y-2">
                <div
                  className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${card.gradient} text-white shadow-lg shadow-primary-500/25 transition duration-300 group-hover:rotate-6 group-hover:scale-110`}
                >
                  <card.icon size={24} />
                </div>
                <h3 className="font-display text-lg font-bold text-slate-900">{card.title}</h3>
                {card.href ? (
                  <a
                    href={card.href}
                    className="mt-1.5 block break-all text-sm font-medium text-primary-600 transition hover:underline"
                  >
                    {card.value}
                  </a>
                ) : (
                  <p className="mt-1.5 break-words text-sm font-medium text-slate-600">{card.value}</p>
                )}
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock size={12} /> {card.hint}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* SOCIALS */}
      {socials.length > 0 && (
        <section className="relative overflow-hidden bg-white py-16">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="animate-orb-1 absolute -top-24 left-1/4 h-[20rem] w-[20rem] rounded-full bg-primary-200/50 blur-3xl" />
            <div className="animate-orb-2 absolute -bottom-24 right-1/4 h-[20rem] w-[20rem] rounded-full bg-emerald-200/50 blur-3xl" />
          </div>

          <div className="container-page relative">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-700">
                  <Sparkles size={13} /> Stay connected
                </span>
                <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                  Follow <span className="text-gradient">CIIE</span>
                </h2>
                <p className="mt-3 text-sm text-slate-500">
                  Stay updated on events, announcements and opportunities across our social channels.
                </p>
              </div>
            </Reveal>

            <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
              {socials.map((s, i) => (
                <Reveal key={s.label} delay={i * 90}>
                  <a
                    href={s.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg ${socialBrands[s.label] ?? 'hover:border-primary-300 hover:text-primary-700'}`}
                  >
                    <s.icon size={17} /> {s.label}
                  </a>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
