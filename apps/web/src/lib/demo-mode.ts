/**
 * Demo helpers (seeded-account shortcuts, the PromptPay webhook simulator, card-decline tips)
 * are shown in development, or in a deployed build only when VITE_DEMO_MODE=true.
 * Real customers of a production build never see them.
 */
export const DEMO_MODE: boolean =
  import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === "true";
