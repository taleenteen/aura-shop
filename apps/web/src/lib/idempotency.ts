import { useRef } from "react";

/**
 * One Idempotency-Key per attempt at a step that must not run twice (placing an order, paying).
 * The key is kept only while the attempt has no answer: if the request fails before the server
 * replies (dropped connection, timeout), the retry sends the same key and the server returns
 * the first result instead of placing a second order or charging again. Once the server has
 * answered, success or error, the next attempt gets a new key.
 */
export function useIdempotencyKey() {
  const key = useRef<string | null>(null);
  return {
    /** The key for the current attempt, created on first use. */
    current: () => (key.current ??= crypto.randomUUID()),
    /** Ends the attempt after the request finished; keeps the key when no answer came back. */
    settle: (err?: unknown) => {
      if (!isNetworkError(err)) key.current = null;
    },
  };
}

/** fetch rejects with a TypeError when no response arrived at all. */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}
