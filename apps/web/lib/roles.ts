// Role → default dashboard route mapping. Dipakai login page + home page
// untuk auto-redirect user yang sudah authenticated ke portal yang sesuai.

export function defaultRouteForRole(role: string | undefined): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "reseller":
      return "/reseller/dashboard";
    case "agent":
      return "/agent/dashboard";
    default:
      // client / user (legacy) / role tidak dikenal → dashboard client biasa.
      return "/dashboard";
  }
}
