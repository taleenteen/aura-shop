import type { AnchorHTMLAttributes } from "react";
import { useNavigate } from "@tanstack/react-router";

/**
 * A link whose address an admin typed or picked: a site path ("/catalog?category=mac") opens in-app,
 * keeping its query string; any other address opens in a new tab.
 */
export function BannerLink({ href, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const navigate = useNavigate();
  const internal = href.startsWith("/") && !href.startsWith("//");
  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (!internal || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate({ href });
      }}
      {...rest}
      {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
    >
      {children}
    </a>
  );
}
