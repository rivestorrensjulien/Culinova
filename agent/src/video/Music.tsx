/** Musique de fond en boucle, baissée pendant la voix de Julien (voir musicVolume). */
import { Audio, staticFile } from "remotion";
import { musicVolume } from "./timeline.ts";

export function BackgroundMusic({
  src,
  total,
  voice,
}: {
  src: string | null | undefined;
  total: number;
  voice: [number, number] | null;
}) {
  if (!src) return null;
  return <Audio src={staticFile(src)} loop volume={(frame) => musicVolume(frame, total, voice)} />;
}
