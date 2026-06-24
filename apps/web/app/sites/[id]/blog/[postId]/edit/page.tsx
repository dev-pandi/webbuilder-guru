"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { BlogForm, type BlogPost } from "../../BlogForm";

export default function EditBlogPostPage() {
  const params = useParams<{ id: string; postId: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<BlogPost>(`/api/v1/blog-posts/${params.postId}`)
      .then(setPost)
      .catch((e) => setErr((e as Error).message));
  }, [params.postId]);

  if (err) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span>
          <span className="font-medium">Gagal memuat artikel:</span> {err}
        </span>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat artikel…
      </div>
    );
  }

  return <BlogForm siteId={params.id} post={post} />;
}
