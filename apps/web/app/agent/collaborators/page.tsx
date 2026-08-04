"use client";

// Agent collaborators — sites klien yang agent bantu kelola sebagai
// editor/viewer. Endpoint: /api/v1/collaborations (agent bukan owner —
// jadi CollaboratorsList yang scope-nya "sites yang saya OWN" akan kosong).

import { MyCollaborationsList } from "@/components/collaborators/MyCollaborationsList";

export default function AgentCollaboratorsPage() {
  return <MyCollaborationsList />;
}
