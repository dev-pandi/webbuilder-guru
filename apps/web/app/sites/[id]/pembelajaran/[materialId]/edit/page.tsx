"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { api, type LearningMaterial } from "@/lib/api";
import { MateriForm } from "../../MateriForm";

export default function EditMateriPage() {
  const params = useParams<{ id: string; materialId: string }>();
  const [material, setMaterial] = useState<LearningMaterial | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<LearningMaterial>(`/api/v1/learning-materials/${params.materialId}`)
      .then(setMaterial)
      .catch((e) => setErr((e as Error).message));
  }, [params.materialId]);

  if (err) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span>
          <span className="font-medium">Gagal memuat materi:</span> {err}
        </span>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat materi…
      </div>
    );
  }

  return <MateriForm siteId={params.id} material={material} />;
}
