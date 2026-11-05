type NavigatorWithUAData = Navigator & { userAgentData?: { platform?: string } };

function detectApple(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as NavigatorWithUAData;
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** True on macOS and iOS, where shortcuts use ⌘ instead of Ctrl. */
export const IS_APPLE = detectApple();

/** Visible label and ARIA value for the search shortcut on this platform. */
export const SEARCH_SHORTCUT = IS_APPLE
  ? { label: "⌘K", aria: "Meta+K" }
  : { label: "Ctrl K", aria: "Control+K" };
