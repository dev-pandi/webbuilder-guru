"use client";

import { useParams, useSearchParams } from "next/navigation";
import { MateriForm } from "../MateriForm";

export default function NewMateriPage() {
  const params = useParams<{ id: string }>();
  // ?parent={uuid} dari list page quick-action "+ Sub" pre-fill form sebagai
  // sub-materi di parent itu — tanpa user harus cari dropdown manual.
  const search = useSearchParams();
  const parentId = search.get("parent") || undefined;
  return (
    <MateriForm siteId={params.id} material={null} initialParentId={parentId} />
  );
}
