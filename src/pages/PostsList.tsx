import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Newspaper } from 'lucide-react'
import { EmptyState, PageHeader, PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import { formatDate } from '@/lib/utils'

export default function PostsList() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('posts')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (active) {
          setPosts((data ?? []) as Post[])
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="container-page max-w-4xl py-10">
      <PageHeader title="CIIE Blog" subtitle="News, insights and announcements from the CIIE community." />
      {loading ? (
        <PageLoader />
      ) : posts.length === 0 ? (
        <EmptyState icon={<Newspaper size={40} />} title="No posts yet" />
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <Link key={p.id} to={`/posts/${p.slug ?? p.id}`} className="card block p-6 transition hover:shadow-md">
              <p className="text-xs text-slate-400">{formatDate(p.created_at)}</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">{p.title}</h2>
              {p.excerpt && <p className="mt-1 text-sm text-slate-500">{p.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
