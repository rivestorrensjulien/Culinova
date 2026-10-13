"use client";

import { Button, Card, CardBody } from "@culinova/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "culinova-install";

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

function standalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Propose d'installer Culinova sur l'appareil : bouton « Installer » quand le navigateur
 * le permet (Chrome, Edge, Android), sinon la marche à suivre sur iPhone et iPad.
 */
export function InstallPrompt() {
  const t = useTranslations("Install");
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "button" | "ios">("hidden");

  useEffect(() => {
    if (standalone() || dismissed()) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setMode("button");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Safari sur iPhone ne propose pas de bouton : on affiche la marche à suivre.
    const timer = ios ? window.setTimeout(() => setMode("ios"), 0) : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (mode === "hidden") return null;

  const close = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "dismissed");
    } catch {
      // Stockage indisponible (navigation privée) : on masque pour cette visite seulement.
    }
    setMode("hidden");
  };

  const install = async () => {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setMode("hidden");
    setEvent(null);
  };

  return (
    <Card data-testid="install-prompt">
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
          <div>
            <p className="font-medium">{t("title")}</p>
            <p className="text-sm text-muted">{mode === "ios" ? t("ios") : t("text")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {mode === "button" ? <Button onClick={install}>{t("install")}</Button> : null}
          <Button variant="ghost" onClick={close}>
            {t("later")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
