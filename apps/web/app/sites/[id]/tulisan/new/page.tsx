"use client";

import { useParams } from "next/navigation";
import { TulisanForm } from "../TulisanForm";

export default function NewTulisanPage() {
  const params = useParams<{ id: string }>();
  return <TulisanForm siteId={params.id} article={null} />;
}
