import { useEffect, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Newspaper, Pencil, Plus, Save, Trash2, Upload } from 'lucide-react'
import { Button, EmptyState, Field, PageHeader, PageLoader, TextArea, TextInput, Toggle } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import { errorMessage, formatDate, slugify } from '@/lib/utils'

const empty = { title: '', slug: '', excerpt: '', content: '', cover_image: '', published: false }

export default function Content() {
  const { user } = useAuth()
  const [posts, setPosts] = useState<Post[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data } = await supabase.from('posts').select('*').order('updated_at', { ascending: false })
    setPosts((data ?? []) as Post[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const startEdit = (p: Post) => {
    setEditing(p.id)
    setForm({
      title: p.title,
      slug: p.slug ?? '',
      excerpt: p.excerpt ?? '',
      content: p.content ?? '',
      cover_image: p.cover_image ?? '',
      published: p.published,
    })
  }

  const uploadCover = async (file: File) => {
    setUploading(true)
    setError('')
    const path = `posts/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const { error: upErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (upErr) {
      setError(errorMessage(upErr))
      setUploading(false)
      return
    }
    const { data: pub } = supabase.storage.from('media').getPublicUrl(path)
    setForm({ ...form, cover_image: pub.publicUrl })
    setUploading(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      title: form.title,
      slug: form.slug || slugify(form.title) || `post-${Date.now().toString(36)}`,
      excerpt: form.excerpt || null,
      content: form.content || null,
      cover_image: form.cover_image || null,
      published: form.published,
      author_id: user?.id ?? null,
    }
    let err: unknown
    if (editing) {
      const { error } = await supabase.from('posts').update(payload).eq('id', editing)
      err = error
    } else {
      const { error } = await supabase.from('posts').insert(payload)
      err = error
    }
    setBusy(false)
    if (err) {
      setError(errorMessage(err))
      return
    }
    setEditing(null)
    setForm({ ...empty })
    load()
  }

  const togglePublished = async (p: Post) => {
    await supabase.from('posts').update({ published: !p.published }).eq('id', p.id)
    load()
  }

  const remove = async (p: Post) => {
    if (!window.confirm('Delete this post?')) return
    await supabase.from('posts').delete().eq('id', p.id)
    load()
  }

  if (loading) return <PageLoader />

  return (
    <div className="max-w-5xl">
      <PageHeader title="Content (CMS)" subtitle="Write and publish blog posts and announcements for the public site." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card h-fit p-5 lg:col-span-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            {editing ? <Pencil size={16} /> : <Plus size={16} />} {editing ? 'Edit post' : 'New post'}
          </h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            <Field label="Title">
              <TextInput required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slug">
                <TextInput value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" />
              </Field>
              <Field label="Cover image">
                <div className="flex items-center gap-2">
                  <label className="btn-secondary cursor-pointer !px-3 !py-2">
                    <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
                  </label>
                  {form.cover_image && <img src={form.cover_image} alt="" className="h-10 w-16 rounded object-cover" />}
                </div>
              </Field>
            </div>
            <Field label="Excerpt">
              <TextInput value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
            </Field>
            <Field label="Content" hint="Plain text; paragraphs are separated by blank lines.">
              <TextArea rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </Field>
            <Toggle checked={form.published} onChange={(v) => setForm({ ...form, published: v })} label="Published (visible on public site)" />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                <Save size={15} /> {editing ? 'Save' : 'Create'}
              </Button>
              {editing && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(null)
                    setForm({ ...empty })
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-2">
          {posts.length === 0 ? (
            <EmptyState icon={<Newspaper size={40} />} title="No posts yet" />
          ) : (
            <div className="space-y-3">
              {posts.map((p) => (
                <div key={p.id} className="card flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{p.title}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(p.updated_at)} • {p.published ? 'published' : 'draft'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => togglePublished(p)} title={p.published ? 'Unpublish' : 'Publish'}>
                      {p.published ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary-600" onClick={() => startEdit(p)}>
                      <Pencil size={14} />
                    </button>
                    <button className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(p)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
