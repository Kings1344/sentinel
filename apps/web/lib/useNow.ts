"use client";
import { useEffect, useState } from "react";

/** Re-renders every `ms` so relative times ("8s ago", countdowns) stay current. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
