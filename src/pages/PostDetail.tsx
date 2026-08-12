import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageLoader } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import { formatDate } from '@/lib/utils'

export default function PostDetail() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    supabase
      .from('posts')
      .select('*')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle()
      .then(({ data }) => {
        setPost((data as Post) ?? null)
        setLoading(false)
      })
  }, [slug])

  if (loading) return <PageLoader />
  if (!post) {
    return (
      <div className="container-page py-20 text-center">
        <p className="text-lg font-semibold text-slate-700">Post not found</p>
        <Link to="/posts" className="btn-primary mt-4">
          All posts
        </Link>
      </div>
    )
  }

  return (
    <div className="container-page max-w-3xl py-10">
      <Link to="/posts" className="text-sm font-medium text-primary-600 hover:underline">
        ← All posts
      </Link>
      <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">{post.title}</h1>
      <p className="mt-2 text-sm text-slate-400">{formatDate(post.created_at)}</p>
      {post.cover_image && <img src={post.cover_image} alt={post.title} className="mt-6 h-64 w-full rounded-xl object-cover" />}
      <div className="prose prose-slate mt-6 max-w-none whitespace-pre-line text-slate-700">{post.content}</div>
    </div>
  )
}
