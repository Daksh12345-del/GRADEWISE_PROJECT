// Non-hook helper for plain async functions/modules that need the current
// user's id outside of a React component. Safe to call any time after
// ClerkProvider has mounted — returns null if signed out.
//
// Split into its own file (rather than living in useAuthUser.js) so that
// useAuthUser.js and useMarksData.js can both import it without creating a
// circular dependency between the two.
export function getClerkUserId() {
  return window.Clerk?.user?.id ?? null
}
