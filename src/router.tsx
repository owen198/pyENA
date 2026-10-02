// A minimal router over the History API: real paths (/projects/…, /login)
// that survive a reload and work with Back and Forward. server/start.ts sends
// every non-API path to index.html, as Vite's dev server does.

import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const EVENT = "pyena:navigate";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(EVENT, callback);
  };
}

const snapshot = () => location.pathname + location.search + location.hash;

export interface Location {
  pathname: string;
  search: URLSearchParams;
  hash: string;
}

export function useLocation(): Location {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, location.origin);
  return { pathname: url.pathname, search: url.searchParams, hash: url.hash };
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const target = new URL(to, location.href);
  const samePage = target.pathname === location.pathname;
  if (options.replace) history.replaceState(null, "", target);
  else history.pushState(null, "", target);
  window.dispatchEvent(new Event(EVENT));
  if (target.hash) {
    document.getElementById(decodeURIComponent(target.hash.slice(1)))?.scrollIntoView({ behavior: "smooth" });
  } else if (!samePage) {
    window.scrollTo({ top: 0 });
  }
}

/** An anchor that navigates in place; modified clicks still open a new tab. */
export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return (
    <a
      href={to}
      {...rest}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || rest.target) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
      }}
    />
  );
}

/** Match `/projects/:id` style patterns; null when the path does not match. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const names: string[] = [];
  const source = pattern.replace(/:([a-zA-Z]+)/g, (_, name: string) => {
    names.push(name);
    return "([^/]+)";
  });
  const match = new RegExp(`^${source}/?$`).exec(pathname);
  if (!match) return null;
  return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
}
