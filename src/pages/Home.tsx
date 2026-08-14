import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowRight,
  Award,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Lightbulb,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import EventCard from '@/components/EventCard'
import Reveal from '@/components/Reveal'
import { PageLoader } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useBranding } from '@/hooks/useBranding'
import { useSettings } from '@/hooks/useSettings'
import { fetchCoordinators, fetchEventCounts, fetchPublishedEvents } from '@/lib/queries'
import { supabase } from '@/lib/supabase'
import type { Event, Post } from '@/lib/types'

const marqueeWords = ['Innovate', 'Create', 'Incubate', 'Launch', 'Scale', 'Impact']

const heroCards = [
  {
    icon: Rocket,
    title: 'Launch your idea',
    text: 'Turn prototypes into startups with incubation support.',
    gradient: 'from-primary-500 to-fuchsia-500',
  },
  {
    icon: CalendarClock,
    title: 'Upcoming events',
    text: 'Hackathons, talks and workshops — seats fill fast.',
    gradient: 'from-emerald-400 to-teal-500',
  },
  {
    icon: Users,
    title: 'Join the community',
    text: 'Collaborate with fellow innovators and founders.',
    gradient: 'from-sky-400 to-indigo-500',
  },
]

const features = [
  {
    icon: Lightbulb,
    title: 'Innovate',
    text: 'Build ideas, prototypes and startups through events, hackathons and incubation support.',
    gradient: 'from-primary-500 to-fuchsia-500',
  },
  {
    icon: Users,
    title: 'Contribute',
    text: 'Volunteer, coordinate and lead events — every contribution builds your CIIE portfolio.',
    gradient: 'from-emerald-400 to-teal-500',
  },
  {
    icon: Award,
    title: 'Recognized',
    text: 'Earn certificates and recognition that reflect your achievements across the CIIE community.',
    gradient: 'from-sky-400 to-indigo-500',
  },
]

export default function Home() {
  const { user, loading: authLoading } = useAuth()
  const branding = useBranding()
  const settings = useSettings()
  const [events, setEvents] = useState<Event[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [coords, setCoords] = useState<Record<string, string[]>>({})
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      const upcoming = await fetchPublishedEvents({ upcomingOnly: true })
      const countMap = await fetchEventCounts()
      const coordMap = await fetchCoordinators(upcoming.slice(0, 6).map((e) => e.id))
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('published', true)
        .order('created_at', { ascending: false })
        .limit(3)
      if (active) {
        setEvents(upcoming.slice(0, 6))
        setCounts(countMap)
        setCoords(coordMap)
        setPosts((data ?? []) as Post[])
        setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [])

  const totalRegistrations = Object.values(counts).reduce((a, b) => a + b, 0)

  if (authLoading) return <PageLoader />
  if (user) return <Navigate to="/dashboard" replace />

  return (
    <div className="overflow-x-clip">
      {/* ============================== HERO ============================== */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-orb-1 absolute -left-32 -top-40 h-[34rem] w-[34rem] rounded-full bg-primary-600/40 blur-[130px]" />
          <div className="animate-orb-2 absolute -right-32 top-1/4 h-[28rem] w-[28rem] rounded-full bg-emerald-500/30 blur-[130px]" />
          <div className="animate-orb-1 absolute -bottom-48 left-1/3 h-[30rem] w-[30rem] rounded-full bg-indigo-500/30 blur-[140px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(2,6,23,0.55))]" />
          <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:72px_72px]" />
        </div>

        <div className="container-page relative z-10 grid gap-16 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-32">
          <div>
            <Reveal>
              <span className="glass inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                {branding.institution_name}
              </span>
            </Reveal>

            <Reveal delay={120}>
              <h1 className="mt-6 font-display text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.25rem]">
                Where ideas
                <br />
                <span className="text-gradient-animated">defy gravity.</span>
              </h1>
            </Reveal>

            <Reveal delay={240}>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
                A community of innovators, creators and entrepreneurs. Participate in events, contribute to the
                ecosystem and be recognized for every step of your journey.
              </p>
            </Reveal>

            <Reveal delay={360}>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  to="/upcoming-events"
                  className="group btn bg-white text-slate-900 shadow-[0_0_36px_rgba(139,92,246,0.5)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_0_48px_rgba(139,92,246,0.65)]"
                >
                  <CalendarClock size={17} /> Upcoming Events
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </Link>
                {settings.allow_public_signup && (
                  <Link
                    to="/signup"
                    className="glass btn text-white transition hover:-translate-y-0.5 hover:bg-white/20"
                  >
                    <Sparkles size={16} /> Join CIIE
                  </Link>
                )}
                <Link
                  to="/about"
                  className="glass btn text-white transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  About CIIE
                </Link>
              </div>
            </Reveal>

            <Reveal delay={480}>
              <div className="mt-12 flex flex-wrap gap-x-10 gap-y-5">
                <div>
                  <p className="font-display text-3xl font-black text-white">{events.length}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Upcoming events
                  </p>
                </div>
                <div className="hidden h-11 w-px bg-white/15 sm:block" />
                <div>
                  <p className="font-display text-3xl font-black text-white">{totalRegistrations}</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Registrations
                  </p>
                </div>
                <div className="hidden h-11 w-px bg-white/15 sm:block" />
                <div>
                  <p className="font-display text-3xl font-black text-white">24/7</p>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Innovation hub
                  </p>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Floating glass cards */}
          <div className="relative hidden lg:block">
            <div aria-hidden className="animate-orb-2 absolute inset-0 rounded-full bg-gradient-to-tr from-primary-500/40 to-emerald-400/25 blur-3xl" />
            {heroCards.map((card, i) => (
              <div
                key={card.title}
                className={
                  i === 0
                    ? 'animate-float-y relative z-10'
                    : i === 1
                      ? 'animate-float-y-lg absolute left-2 top-28 z-20'
                      : 'animate-float-y absolute bottom-16 right-0 z-20'
                }
                style={i === 1 ? { animationDelay: '1.2s' } : i === 2 ? { animationDelay: '2.1s' } : undefined}
              >
                <div className="glass w-72 rounded-3xl p-6 shadow-2xl shadow-slate-950/50 hover:bg-white/20">
                  <div
                    className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.gradient} text-white shadow-lg`}
                  >
                    <card.icon size={22} />
                  </div>
                  <p className="font-display text-lg font-bold text-white">{card.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-300">{card.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex justify-center pb-8">
          <span className="animate-scroll-hint flex flex-col items-center gap-1.5 text-white/50">
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">Scroll</span>
            <ChevronDown size={16} />
          </span>
        </div>
      </section>

      {/* ============================== MARQUEE ============================== */}
      <section aria-hidden className="overflow-hidden border-y border-white/10 bg-slate-950 py-5">
        <div className="animate-marquee flex w-max items-center gap-10 whitespace-nowrap">
          {[...marqueeWords, ...marqueeWords].map((word, i) => (
            <span
              key={i}
              className="flex items-center gap-10 font-display text-sm font-bold uppercase tracking-[0.35em] text-white/45"
            >
              {word}
              <Sparkles size={16} className="text-primary-400" />
            </span>
          ))}
        </div>
      </section>

      {/* ============================== UPCOMING EVENTS ============================== */}
      <section className="container-page py-20">
        <Reveal>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-700">
                <CalendarClock size={13} /> What's happening
              </span>
              <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Upcoming <span className="text-gradient">Events</span>
              </h2>
              <p className="mt-2 text-sm text-slate-500">Register before the seats are gone.</p>
            </div>
            <Link
              to="/upcoming-events"
              className="group btn-secondary shrink-0 transition hover:-translate-y-0.5"
            >
              View all
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>

        {loading ? (
          <PageLoader />
        ) : events.length === 0 ? (
          <Reveal>
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
              No upcoming events right now. Check back soon!
            </p>
          </Reveal>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e, i) => (
              <Reveal key={e.id} delay={i * 90} variant="zoom">
                <EventCard event={e} registrations={counts[e.id] ?? 0} coordinators={coords[e.id]} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* ============================== WHY CIIE ============================== */}
      <section className="relative overflow-hidden bg-white py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-orb-1 absolute -top-32 right-[-6rem] h-[26rem] w-[26rem] rounded-full bg-primary-200/50 blur-3xl" />
          <div className="animate-orb-2 absolute -bottom-32 left-[-6rem] h-[26rem] w-[26rem] rounded-full bg-emerald-200/50 blur-3xl" />
        </div>

        <div className="container-page relative">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-700">
                <Sparkles size={13} /> Why CIIE
              </span>
              <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                The <span className="text-gradient">CIIE experience</span>
              </h2>
              <p className="mt-3 text-sm text-slate-500">
                More than events — a community where your participation and contributions are recognized.
              </p>
            </div>
          </Reveal>

          <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 130} variant="zoom">
                <div className="glass-card group h-full p-7 text-center hover:-translate-y-2">
                  <div
                    className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${f.gradient} text-white shadow-lg shadow-primary-500/25 transition duration-300 group-hover:rotate-6 group-hover:scale-110`}
                  >
                    <f.icon size={28} />
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================== NEWS ============================== */}
      {posts.length > 0 && (
        <section className="container-page py-20">
          <Reveal>
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-700">
                  <TrendingUp size={13} /> Newsroom
                </span>
                <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                  From the <span className="text-gradient">CIIE Blog</span>
                </h2>
              </div>
              <Link to="/posts" className="group btn-ghost shrink-0 transition hover:text-primary-600">
                All posts
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-3">
            {posts.map((p, i) => (
              <Reveal key={p.id} delay={i * 110} variant="zoom">
                <Link
                  to={`/posts/${p.slug ?? p.id}`}
                  className="glass-card group flex h-full flex-col p-7 hover:-translate-y-1.5"
                >
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-bold text-primary-700">
                    <Sparkles size={11} /> CIIE Blog
                  </span>
                  <h3 className="mt-3 font-display text-lg font-bold text-slate-900 transition group-hover:text-primary-700">
                    {p.title}
                  </h3>
                  {p.excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-500">{p.excerpt}</p>
                  )}
                  <span className="mt-auto pt-4 text-sm font-semibold text-primary-600">
                    Read more →
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ============================== CTA ============================== */}
      <section className="container-page py-20">
        <Reveal variant="zoom">
          <div className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-16 text-center text-white shadow-2xl shadow-slate-900/30 sm:px-16">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="animate-orb-1 absolute -left-20 -top-24 h-80 w-80 rounded-full bg-primary-600/40 blur-[110px]" />
              <div className="animate-orb-2 absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-emerald-500/30 blur-[110px]" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(2,6,23,0.6))]" />
            </div>

            <div className="relative">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-emerald-400 shadow-lg shadow-primary-500/40">
                <Rocket size={26} />
              </div>
              <h2 className="font-display text-3xl font-black tracking-tight sm:text-4xl">
                Want to be part of <span className="text-gradient-animated">CIIE?</span>
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-slate-300">
                Join CIIE to become a member, or explore upcoming events right now.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {settings.allow_public_signup && (
                  <Link
                    to="/signup"
                    className="btn bg-white text-slate-900 shadow-[0_0_36px_rgba(139,92,246,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(139,92,246,0.7)]"
                  >
                    <Sparkles size={16} /> Join CIIE
                  </Link>
                )}
                <Link
                  to="/events"
                  className="glass btn text-white transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  <CalendarClock size={16} /> Explore events
                </Link>
              </div>
              <p className="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                <CheckCircle2 size={13} className="text-emerald-400" /> {branding.institution_name}
              </p>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
