/** Musique de fond en boucle, arrêtée juste avant la voix de Julien (voir musicVolume). */
import { Audio, staticFile } from "remotion";
import { musicVolume } from "./timeline.ts";

export function BackgroundMusic({
  src,
  total,
  voiceFrom,
}: {
  src: string | null | undefined;
  total: number;
  voiceFrom: number | null;
}) {
  if (!src) return null;
  return <Audio src={staticFile(src)} loop volume={(frame) => musicVolume(frame, total, voiceFrom)} />;
}
