"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { api, type Article } from "@/lib/api";
import { TulisanForm } from "../../TulisanForm";

export default function EditTulisanPage() {
  const params = useParams<{ id: string; articleId: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Article>(`/api/v1/articles/${params.articleId}`)
      .then(setArticle)
      .catch((e) => setErr((e as Error).message));
  }, [params.articleId]);

  if (err) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span>
          <span className="font-medium">Gagal memuat tulisan:</span> {err}
        </span>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat tulisan…
      </div>
    );
  }

  return <TulisanForm siteId={params.id} article={article} />;
}
