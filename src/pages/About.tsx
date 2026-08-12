import { Link } from 'react-router-dom'
import { ArrowRight, Award, CheckCircle2, Compass, Lightbulb, Rocket, Sparkles, Target, Users } from 'lucide-react'
import Reveal from '@/components/Reveal'
import { useBranding } from '@/hooks/useBranding'
import { useSettings } from '@/hooks/useSettings'

const pillars = [
  {
    icon: Lightbulb,
    title: 'Innovate',
    text: 'Build ideas, prototypes and startups through events, hackathons and incubation support.',
    gradient: 'from-primary-500 to-fuchsia-500',
  },
  {
    icon: Users,
    title: 'Contribute',
    text: 'Volunteer, coordinate and lead — every contribution strengthens the CIIE community.',
    gradient: 'from-emerald-400 to-teal-500',
  },
  {
    icon: Award,
    title: 'Recognized',
    text: 'Earn certificates and recognition that publicly reflect your CIIE journey.',
    gradient: 'from-sky-400 to-indigo-500',
  },
]

const values = [
  { icon: Target, title: 'Mission', text: 'Turn student ideas into action through hands-on events, mentorship and incubation.' },
  { icon: Compass, title: 'Vision', text: 'A campus where every student has the opportunity to create, build and launch.' },
  { icon: Rocket, title: 'Culture', text: 'Experimentation over perfection — fail fast, learn faster, ship always.' },
]

export default function About() {
  const branding = useBranding()
  const settings = useSettings()

  return (
    <div className="overflow-x-clip">
      {/* HERO */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-orb-1 absolute -left-28 -top-36 h-[30rem] w-[30rem] rounded-full bg-primary-600/40 blur-[130px]" />
          <div className="animate-orb-2 absolute -right-28 top-1/3 h-[26rem] w-[26rem] rounded-full bg-emerald-500/30 blur-[130px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(2,6,23,0.5))]" />
          <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(to_right,rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:72px_72px]" />
        </div>

        <div className="container-page relative z-10 grid gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div>
            <Reveal>
              <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white">
                <Sparkles size={14} className="text-primary-300" /> About CIIE
              </span>
            </Reveal>
            <Reveal delay={120}>
              <h1 className="mt-6 font-display text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
                A home for
                <br />
                <span className="text-gradient-animated">innovators</span>
              </h1>
            </Reveal>
            <Reveal delay={240}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
                {branding.ciie_name} — the innovation, incubation and entrepreneurship centre of{' '}
                {branding.institution_name}.
              </p>
            </Reveal>
            <Reveal delay={360}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/events"
                  className="group btn bg-white text-slate-900 shadow-[0_0_36px_rgba(139,92,246,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_0_48px_rgba(139,92,246,0.65)]"
                >
                  Explore events <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <Link to="/gallery" className="glass btn text-white transition hover:-translate-y-0.5 hover:bg-white/20">
                  See the gallery
                </Link>
              </div>
            </Reveal>
          </div>

          {/* Floating mission card */}
          <div className="relative hidden lg:block">
            <div aria-hidden className="animate-orb-2 absolute inset-0 rounded-full bg-gradient-to-tr from-primary-500/40 to-emerald-400/25 blur-3xl" />
            <div className="animate-float-y glass relative z-10 mt-10 w-[26rem] rounded-3xl p-8 shadow-2xl shadow-slate-950/50 hover:bg-white/20">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-emerald-400 text-white shadow-lg">
                <Compass size={22} />
              </div>
              <p className="font-display text-xl font-bold text-white">Where students become founders</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Every activity a student participates in — attending an event, volunteering, coordinating a team,
                winning a competition — contributes to their CIIE record of recognition within the community.
              </p>
              <ul className="mt-5 space-y-2.5">
                {['Hands-on workshops & hackathons', 'Mentorship and incubation support', 'Recognition you can build on'].map(
                  (point) => (
                    <li key={point} className="flex items-center gap-2 text-sm text-slate-200">
                      <CheckCircle2 size={15} className="shrink-0 text-emerald-400" /> {point}
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* MISSION */}
      <section className="relative overflow-hidden bg-white py-20">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="animate-orb-1 absolute -top-24 right-[-4rem] h-[22rem] w-[22rem] rounded-full bg-primary-200/50 blur-3xl" />
          <div className="animate-orb-2 absolute bottom-[-4rem] left-[-4rem] h-[22rem] w-[22rem] rounded-full bg-emerald-200/50 blur-3xl" />
        </div>

        <div className="container-page relative">
          <Reveal>
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-700">
                <Rocket size={13} /> What we stand for
              </span>
              <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                A community where ideas take flight
              </h2>
              <p className="mt-4 leading-relaxed text-slate-600">
                CIIE is the innovation, incubation and entrepreneurship centre of our university — a community where
                students turn ideas into action. Through events, workshops, projects and competitions, members gain
                real-world exposure, mentorship and recognition that grows their academic and professional portfolio.
              </p>
            </div>
          </Reveal>

          <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-3">
            {values.map((v, i) => (
              <Reveal key={v.title} delay={i * 120} variant="zoom">
                <div className="glass-card group h-full p-7 text-center hover:-translate-y-2">
                  <div
                    className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${
                      i === 0
                        ? 'from-primary-500 to-fuchsia-500'
                        : i === 1
                          ? 'from-emerald-400 to-teal-500'
                          : 'from-sky-400 to-indigo-500'
                    } text-white shadow-lg shadow-primary-500/25 transition duration-300 group-hover:rotate-6 group-hover:scale-110`}
                  >
                    <v.icon size={24} />
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900">{v.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{v.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* THREE PILLARS */}
      <section className="container-page py-20">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-100 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary-700">
              <Award size={13} /> The CIIE experience
            </span>
            <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Three pillars, one <span className="text-gradient">journey</span>
            </h2>
          </div>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 130} variant="zoom">
              <div className="glass-card group h-full p-7 text-center hover:-translate-y-2">
                <div
                  className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${p.gradient} text-white shadow-lg shadow-primary-500/25 transition duration-300 group-hover:rotate-6 group-hover:scale-110`}
                >
                  <p.icon size={28} />
                </div>
                <h3 className="font-display text-lg font-bold text-slate-900">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container-page pb-20">
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
                Join CIIE to become a member, or register for an event right now.
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
                <Link to="/events" className="glass btn text-white transition hover:-translate-y-0.5 hover:bg-white/20">
                  <ArrowRight size={16} /> Explore events
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  )
}
