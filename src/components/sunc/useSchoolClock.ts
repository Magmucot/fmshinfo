"use client";

import { useEffect, useState } from "react";
import { nowNsk } from "./types";

/** Stable initial HTML; live Novosibirsk time starts after hydration. */
export function useSchoolClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(nowNsk());
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);
  return now;
}
