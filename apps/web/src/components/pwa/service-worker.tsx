"use client";

import { useEffect } from "react";

/** Enregistre le service worker (application installable, page hors ligne), en production seulement. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
      console.warn("Service worker non enregistré", error);
    });
  }, []);
  return null;
}
