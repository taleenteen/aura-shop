/**
 * True when a URL flag such as `?import=1` is set. The router parses a typed `?import=1` as the
 * number 1 but writes in-app links as the string "1", so both must count.
 */
export const isFlagSet = (value: unknown): boolean => value === 1 || value === "1" || value === true;
