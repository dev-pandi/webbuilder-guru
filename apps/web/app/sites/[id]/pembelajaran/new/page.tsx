"use client";

import { useParams } from "next/navigation";
import { MateriForm } from "../MateriForm";

export default function NewMateriPage() {
  const params = useParams<{ id: string }>();
  return <MateriForm siteId={params.id} material={null} />;
}
