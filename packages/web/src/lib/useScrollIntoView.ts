import { useEffect, useRef } from "react";

/** Scrolls the returned ref's element into the current viewport whenever `trigger` becomes truthy —
 * used so side panels open where the user is actually looking, not at the top of a scrolled page. */
export function useScrollIntoView<T extends HTMLElement>(trigger: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (trigger) {
      ref.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  }, [trigger]);
  return ref;
}
