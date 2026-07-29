"use client";

// Reseller collaborators — sites yang reseller OWN (self-purchase) + siapa
// saja yang punya akses kolaborator. Untuk site yang di-manage as editor
// (client owns, reseller collab), buka via /reseller/clients → detail site.

import { CollaboratorsList } from "@/components/collaborators/CollaboratorsList";

export default function ResellerCollaboratorsPage() {
  return <CollaboratorsList />;
}
