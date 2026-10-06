"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseWizardState, type WizardState } from "@/lib/wizard";
import { saveDraftAction } from "@/server/actions/wizard";
import { readLocalDraft, writeLocalDraft } from "./offline-store";

export type SaveStatus = "saved" | "saving" | "offline" | "error";

const DEBOUNCE_MS = 600;

/**
 * Sauvegarde automatique : copie locale immédiate, envoi au serveur après une
 * courte pause, renvoi automatique au retour du réseau. Le plus récent gagne.
 */
export function useAutosave(
  draftId: string,
  serverState: WizardState,
  serverUpdatedAt: string | null,
): {
  state: WizardState;
  setState: (update: (previous: WizardState) => WizardState) => void;
  status: SaveStatus;
  flush: () => Promise<void>;
} {
  const [state, setLocalState] = useState(serverState);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pending = useRef<{ state: WizardState; at: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const send = useCallback(async () => {
    const change = pending.current;
    if (!change) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }
    setStatus("saving");
    try {
      const result = await saveDraftAction(draftId, change.state, change.at);
      if (pending.current === change) pending.current = null;
      if (result.ok) {
        await writeLocalDraft({ draftId, state: change.state, clientUpdatedAt: change.at, synced: true });
        setStatus(pending.current ? "saving" : "saved");
      } else if (result.reason === "stale") {
        // Une version plus récente existe (autre onglet ou appareil) : on la reprend.
        setLocalState(result.state);
        await writeLocalDraft({
          draftId,
          state: result.state,
          clientUpdatedAt: result.clientUpdatedAt ?? change.at,
          synced: true,
        });
        setStatus("saved");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
    }
  }, [draftId]);

  const setState = useCallback(
    (update: (previous: WizardState) => WizardState) => {
      setLocalState((previous) => {
        const next = update(previous);
        const at = new Date().toISOString();
        pending.current = { state: next, at };
        void writeLocalDraft({ draftId, state: next, clientUpdatedAt: at, synced: false });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void send(), DEBOUNCE_MS);
        setStatus("saving");
        return next;
      });
    },
    [draftId, send],
  );

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await send();
  }, [send]);

  // Au chargement : une copie locale plus récente et non envoyée (coupure, fermeture) l'emporte.
  useEffect(() => {
    let cancelled = false;
    void readLocalDraft(draftId).then((local) => {
      if (cancelled || !local || local.synced) return;
      if (serverUpdatedAt && local.clientUpdatedAt <= serverUpdatedAt) return;
      const restored = parseWizardState(local.state);
      setLocalState(restored);
      pending.current = { state: restored, at: local.clientUpdatedAt };
      void send();
    });
    return () => {
      cancelled = true;
    };
  }, [draftId, serverUpdatedAt, send]);

  // Retour du réseau : on renvoie ce qui attend.
  useEffect(() => {
    const online = () => void send();
    const offline = () => pending.current && setStatus("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const retry = setInterval(() => pending.current && void send(), 15_000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      clearInterval(retry);
    };
  }, [send]);

  return { state, setState, status, flush };
}
