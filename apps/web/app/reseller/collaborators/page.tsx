"use client";

// Reseller collaborators — sites klien yang reseller bantu kelola sebagai
// editor/viewer. Endpoint: /api/v1/collaborations. Reseller biasanya bukan
// owner (klien yang own via on-behalf-of purchase), jadi list "sites yang
// saya bantu" lebih relevan daripada "kolaborator di sites saya".

import { MyCollaborationsList } from "@/components/collaborators/MyCollaborationsList";

export default function ResellerCollaboratorsPage() {
  return <MyCollaborationsList basePath="/reseller" />;
}
