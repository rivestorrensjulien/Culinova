/**
 * Version réaliste : Chef Ju en 3D dans une vraie cuisine, 1 à 3 clips IA par plan (une action
 * chacun). Le texte est dans un bandeau clair en haut, la vidéo dessous : il ne passe jamais
 * sur le chef. Même photo et même carte de fin que la version animée.
 */
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/Fraunces";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { ReactNode } from "react";
import { shotText, stepLabel } from "./actions.ts";
import { Mascot } from "./Mascot.tsx";
import {
  bandFontSize,
  playbackRate,
  REAL_HOOK_FRAMES,
  realisticTimeline,
  type RealisticProps,
  sceneFrames,
} from "./realistic.ts";
import { EndScene, RevealScene, Words } from "./RecipeVideo.tsx";

const serif = loadSerif("normal", { weights: ["600"], subsets: ["latin", "latin-ext"] }).fontFamily;
const sans = loadSans("normal", { weights: ["500"], subsets: ["latin", "latin-ext"] }).fontFamily;
const BAND = 560;
const IVORY = "#faf6ef";
const INK = "#1f1a16";
const COPPER = "#a84a24";

function Clip({ src, frames }: { src: string | null | undefined; frames: number }) {
  return (
    <div style={{ position: "absolute", top: BAND, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      {src ? (
        <OffthreadVideo
          src={staticFile(src)}
          muted
          playbackRate={playbackRate(frames)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 45%" }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, #0004 0%, #0000 8%)",
        }}
      />
    </div>
  );
}

/** Plan non filmé : image réaliste avec un zoom lent (effet « caméra qui avance »). */
function StillShot({ src, frames }: { src: string; frames: number }) {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, frames], [1.02, 1.12]);
  return (
    <div style={{ position: "absolute", top: BAND, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "50% 45%",
          transform: `scale(${zoom})`,
        }}
      />
    </div>
  );
}

function Band({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: BAND, backgroundColor: IVORY }}>
      {children}
    </div>
  );
}

function RealHook({ props }: { props: RealisticProps }) {
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Clip src={props.hookClip} frames={REAL_HOOK_FRAMES} />
      <Band>
        <div
          style={{ position: "absolute", top: 90, left: 80, fontFamily: serif, fontSize: 44, color: COPPER }}
        >
          Culinova
        </div>
        <Words
          text={props.hook}
          start={8}
          style={{
            position: "absolute",
            top: 170,
            left: 80,
            right: 80,
            fontFamily: serif,
            fontSize: bandFontSize(props.hook) + 6,
            lineHeight: 1.08,
            color: INK,
          }}
        />
      </Band>
    </AbsoluteFill>
  );
}

function RealShot({ props, index, frames }: { props: RealisticProps; index: number; frames: number }) {
  const frame = useCurrentFrame();
  const count = props.shots.length;
  const clips = props.plans[index]?.clips ?? [];
  const still = clips.length === 0 ? props.plans[index]?.still : null;
  const per = sceneFrames(Math.max(1, clips.length));
  const text = shotText(props.shots, index);
  const progress = interpolate(frame, [0, frames], [index / count, (index + 1) / count], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {still ? <StillShot src={still} frames={frames} /> : null}
      {clips.map((clip, i) => (
        <Sequence key={clip} from={i * per} durationInFrames={per} layout="none">
          <Clip src={clip} frames={per} />
        </Sequence>
      ))}
      <Band>
        <div
          style={{
            position: "absolute",
            top: 70,
            left: 80,
            right: 80,
            height: 10,
            borderRadius: 5,
            background: "#0000000f",
          }}
        >
          <div style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 5, background: COPPER }} />
        </div>
        <div
          style={{
            position: "absolute",
            top: 120,
            left: 80,
            fontFamily: sans,
            fontSize: 38,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: COPPER,
          }}
        >
          {stepLabel(props.shots, index)}
        </div>
        <Words
          text={text}
          start={4}
          step={2}
          style={{
            position: "absolute",
            top: 190,
            left: 80,
            right: 80,
            fontFamily: serif,
            fontSize: bandFontSize(text),
            lineHeight: 1.1,
            color: INK,
          }}
        />
      </Band>
    </AbsoluteFill>
  );
}

export function RealisticVideo(props: RealisticProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {props.music ? <Audio src={staticFile(props.music)} volume={0.35} /> : null}
      {realisticTimeline(props).map((segment) => (
        <Sequence
          key={`${segment.kind}-${segment.from}`}
          from={segment.from}
          durationInFrames={segment.frames}
        >
          {segment.kind === "hook" ? <RealHook props={props} /> : null}
          {segment.kind === "shot" ? (
            <RealShot props={props} index={segment.index ?? 0} frames={segment.frames} />
          ) : null}
          {segment.kind === "reveal" ? <RevealScene props={props} frames={segment.frames} /> : null}
          {segment.kind === "end" ? <EndScene props={props} /> : null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/** Image de référence de la mascotte envoyée au modèle d'images (fond blanc, corps entier). */
export function MascotReference() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" }}>
      <Mascot expression="content" jacket="blanche" size={860} />
    </AbsoluteFill>
  );
}
