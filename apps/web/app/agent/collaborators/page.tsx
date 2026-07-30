"use client";

// Agent collaborators — sites yang agent OWN (self-purchase) + siapa saja
// yang punya akses kolaborator. Site yang di-manage as editor (client owns,
// agent collab) buka via /agent/clients → detail site.

import { CollaboratorsList } from "@/components/collaborators/CollaboratorsList";

export default function AgentCollaboratorsPage() {
  return <CollaboratorsList />;
}
