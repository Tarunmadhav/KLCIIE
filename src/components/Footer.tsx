import { Link } from 'react-router-dom'
import { Facebook, Instagram, Linkedin, Twitter, Youtube } from 'lucide-react'
import Logo from '@/components/Logo'
import { useBranding } from '@/hooks/useBranding'
import { useSettings } from '@/hooks/useSettings'

export default function Footer() {
  const branding = useBranding()
  const settings = useSettings()

  const socials = [
    { url: settings.facebook_url, icon: Facebook, label: 'Facebook' },
    { url: settings.instagram_url, icon: Instagram, label: 'Instagram' },
    { url: settings.linkedin_url, icon: Linkedin, label: 'LinkedIn' },
    { url: settings.twitter_url, icon: Twitter, label: 'X' },
    { url: settings.youtube_url, icon: Youtube, label: 'YouTube' },
  ].filter((s) => s.url)

  return (
    <footer className="border-t border-slate-200 bg-white text-slate-600">
      <div className="container-page grid gap-8 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-md text-sm text-slate-500">{branding.ciie_name}</p>
          <p className="mt-1 text-sm text-slate-400">{branding.institution_name}</p>
          {socials.length > 0 && (
            <div className="mt-4 flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-primary-100 hover:text-primary-700"
                >
                  <s.icon size={15} />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-900">Platform</h4>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-primary-600" to="/events">Events</Link></li>
            <li><Link className="hover:text-primary-600" to="/upcoming-events">Upcoming Events</Link></li>
            <li><Link className="hover:text-primary-600" to="/gallery">Gallery</Link></li>
            <li><Link className="hover:text-primary-600" to="/members">Members</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-900">CIIE</h4>
          <ul className="space-y-2 text-sm">
            <li><Link className="hover:text-primary-600" to="/about">About CIIE</Link></li>
            <li><Link className="hover:text-primary-600" to="/contact">Contact</Link></li>
            <li><Link className="hover:text-primary-600" to="/login">Log in</Link></li>
            {settings.allow_public_signup && (
              <li><Link className="hover:text-primary-600" to="/signup">Join CIIE</Link></li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} KL CIIE Platform.
      </div>
    </footer>
  )
}
