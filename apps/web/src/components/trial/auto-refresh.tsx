"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recharge la page (côté serveur) à intervalle régulier tant que la recette se prépare. */
export function AutoRefresh({ seconds = 3 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}
