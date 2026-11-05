/**
 * Demo helpers (the seeded-account sign-in shortcuts on the sign-in modal and admin console)
 * are shown in development, or in a deployed build only when VITE_DEMO_MODE=true.
 * Real customers of a production build never see them.
 */
export const DEMO_MODE: boolean =
  import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true";
