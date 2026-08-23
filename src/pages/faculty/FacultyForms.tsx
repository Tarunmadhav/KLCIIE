import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ClipboardList } from 'lucide-react'
import { Badge, Button, EmptyState, PageLoader } from '@/components/ui'
import { CustomFieldInputs, missingFields } from '@/components/RegistrationFormFields'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { CustomFieldDef, FacultyForm, FacultyFormSubmission } from '@/lib/types'
import { cn, errorMessage, formatDateTime } from '@/lib/utils'

export default function FacultyForms() {
  const { profile } = useAuth()
  const [forms, setForms] = useState<FacultyForm[]>([])
  const [subs, setSubs] = useState<Record<string, FacultyFormSubmission>>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!profile?.id) return
    let active = true
    const load = async () => {
      const [{ data: formsData }, { data: subsData }] = await Promise.all([
        supabase.from('faculty_forms').select('*').eq('status', 'published').order('created_at', { ascending: false }),
        supabase.from('faculty_form_submissions').select('*').eq('member_id', profile.id).order('submitted_at', { ascending: false }),
      ])
      if (!active) return
      setForms((formsData ?? []) as FacultyForm[])
      const latest: Record<string, FacultyFormSubmission> = {}
      const cnt: Record<string, number> = {}
      for (const s of (subsData ?? []) as FacultyFormSubmission[]) {
        if (!latest[s.form_id]) latest[s.form_id] = s
        cnt[s.form_id] = (cnt[s.form_id] ?? 0) + 1
      }
      setSubs(latest)
      setCounts(cnt)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [profile?.id])

  const toggle = (form: FacultyForm) => {
    if (openId === form.id) {
      setOpenId(null)
      return
    }
    const existing = subs[form.id]
    // Multi-submission forms always open a fresh blank response; single ones
    // open prefilled with the saved answers for editing/resubmitting.
    setValues(existing && !form.allow_multiple ? { ...existing.responses } : {})
    setError('')
    setFlash(null)
    setOpenId(form.id)
  }

  const save = async (form: FacultyForm) => {
    if (!profile) return
    const miss = missingFields(form.fields as CustomFieldDef[], values)
    if (miss) {
      setError(miss)
      return
    }
    setBusy(true)
    setError('')
    const existing = subs[form.id]
    let err: unknown
    let saved: FacultyFormSubmission | null = null
    if (existing && !form.allow_multiple) {
      const { data, error: upErr } = await supabase
        .from('faculty_form_submissions')
        .update({ responses: values })
        .eq('id', existing.id)
        .select()
        .maybeSingle()
      err = upErr
      saved = (data ?? null) as FacultyFormSubmission | null
    } else {
      const { data, error: insErr } = await supabase
        .from('faculty_form_submissions')
        .insert({ form_id: form.id, member_id: profile.id, responses: values })
        .select()
        .maybeSingle()
      err = insErr
      saved = (data ?? null) as FacultyFormSubmission | null
    }
    setBusy(false)
    if (err || !saved) {
      setError(errorMessage(err ?? new Error('Could not save your answers.')))
      return
    }
    setSubs((prev) => ({ ...prev, [form.id]: saved! }))
    setCounts((prev) => ({ ...prev, [form.id]: (prev[form.id] ?? 0) + (existing && !form.allow_multiple ? 0 : 1) }))
    setFlash(`Response submitted at ${formatDateTime(saved.submitted_at)}.`)
    if (form.allow_multiple) setValues({})
  }

  const pendingCount = useMemo(() => forms.filter((f) => !subs[f.id]).length, [forms, subs])

  if (loading) return <PageLoader />

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Forms</h2>
        <Badge tone={pendingCount === 0 ? 'green' : 'amber'}>
          {pendingCount === 0 ? 'All caught up' : `${pendingCount} pending`}
        </Badge>
      </div>

      {forms.length === 0 ? (
        <EmptyState icon={<ClipboardList size={40} />} title="No forms right now" subtitle="When CIIE shares a form it will appear here." />
      ) : (
        <div className="space-y-3">
          {forms.map((form) => {
            const sub = subs[form.id]
            const count = counts[form.id] ?? 0
            const open = openId === form.id
            const multi = !!form.allow_multiple
            return (
              <section key={form.id} className={cn('card overflow-hidden transition', open && 'ring-1 ring-primary-200')}>
                <button type="button" onClick={() => toggle(form)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl',
                      sub ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600',
                    )}
                  >
                    {sub ? <CheckCircle2 size={18} /> : <ClipboardList size={18} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{form.title}</span>
                    {form.description && <span className="mt-0.5 block line-clamp-1 text-xs text-slate-500">{form.description}</span>}
                  </span>
                  {multi && count > 0 && (
                    <Badge tone="slate">
                      {count} {count === 1 ? 'response' : 'responses'}
                    </Badge>
                  )}
                  <Badge tone={sub ? 'green' : 'amber'}>{sub ? 'Filled' : 'Pending'}</Badge>
                  <ChevronDown size={16} className={cn('shrink-0 text-slate-400 transition', open && 'rotate-180')} />
                </button>

                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-5">
                    {multi ? (
                      <p className="mb-4 text-xs font-medium text-primary-700">
                        This form accepts multiple responses — submit as many times as you need; each one is recorded separately.
                        {count > 0 && <> You have submitted {count} {count === 1 ? 'time' : 'times'} so far.</>}
                      </p>
                    ) : (
                      sub && (
                        <p className="mb-4 text-xs font-medium text-emerald-700">
                          You submitted this form on {formatDateTime(sub.submitted_at)}
                          {sub.updated_at !== sub.submitted_at && <> · last updated {formatDateTime(sub.updated_at)}</>} — you can edit and resubmit anytime while the form is open.
                        </p>
                      )
                    )}
                    <CustomFieldInputs fields={form.fields as CustomFieldDef[]} values={values} onChange={setValues} />
                    {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                    {flash && !error && <p className="mt-3 text-sm font-medium text-emerald-700">{flash}</p>}
                    <Button className="mt-4" onClick={() => void save(form)} disabled={busy}>
                      {busy ? 'Saving…' : multi ? 'Submit response' : sub ? 'Update submission' : 'Submit form'}
                    </Button>
                    {multi && (
                      <button
                        type="button"
                        onClick={() => setOpenId(null)}
                        className="mt-2 block text-xs font-medium text-slate-500 hover:text-slate-700"
                      >
                        Done for now — close this form
                      </button>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
