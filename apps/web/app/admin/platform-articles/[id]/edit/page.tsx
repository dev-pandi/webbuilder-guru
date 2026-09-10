"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { api, type PlatformArticle } from "@/lib/api";
import { ArticleForm } from "../../ArticleForm";

export default function EditPlatformArticlePage() {
  const params = useParams<{ id: string }>();
  const [article, setArticle] = useState<PlatformArticle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<PlatformArticle>(`/api/v1/admin/platform-articles/${params.id}`)
      .then(setArticle)
      .catch((e) => setErr((e as Error).message));
  }, [params.id]);

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

  if (!article) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat artikel…
      </div>
    );
  }

  return <ArticleForm article={article} />;
}
