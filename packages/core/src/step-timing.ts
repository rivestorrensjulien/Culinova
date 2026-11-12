/** Durée des étapes dans la consigne. */

/** La consigne dit-elle combien de temps (« 9 minutes », « 1 h », « 30 s ») ? */
export function mentionsDuration(text: string): boolean {
  return /\d\s*(min|minutes?|mn|s\b|sec|secondes?|h\b|heures?)|\b(une|deux|trois|quatre|cinq|dix|quinze|vingt|trente|quelques) (minutes?|secondes?|heures?)\b|\b(minute|seconde|heure)s?\b/i.test(
    text,
  );
}

/**
 * Étape chronométrée : minuteur prévu ou cuisson (température) d'au moins une minute. Sa
 * consigne doit dire la durée, seule information affichée (retour de Julien du 12/11 : œufs
 * durs sans temps de cuisson).
 */
export function isTimedStep(step: {
  timer: boolean;
  durationSeconds: number | null;
  temperatureC?: number | null;
  phase?: string;
}): boolean {
  if (step.durationSeconds === null || step.durationSeconds < 60) return false;
  return step.timer || step.phase === "cooking" || (step.temperatureC ?? null) !== null;
}
