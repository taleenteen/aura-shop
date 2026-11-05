/**
 * Orders found through the order lookup (number + email) are remembered for this browser tab,
 * so the order page can load them without the browser that placed them. The email is sent as
 * X-Order-Email, which the API accepts as proof for read-only access.
 */
const KEY = "aura_order_lookup";

function read(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function rememberOrderLookup(orderNumber: string, email: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...read(), [orderNumber]: email }));
  } catch {
    // Storage unavailable: the order page will ask the customer to look the order up again.
  }
}

/** Request headers that let this tab read an order it looked up. Empty when it did not. */
export function orderAccessHeaders(orderNumber: string): HeadersInit {
  const email = read()[orderNumber];
  return email ? { "X-Order-Email": email } : {};
}
