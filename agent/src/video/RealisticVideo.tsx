/**
 * Version réaliste (comparatif) : chaque plan est un clip vidéo IA de Chef Ju en 3D dans une
 * vraie cuisine, avec le texte du plan par-dessus ; même photo et même carte de fin que la
 * version animée.
 */
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/Fraunces";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Mascot } from "./Mascot.tsx";
import { realisticTimeline, type RealisticProps } from "./realistic.ts";
import { EndScene, RevealScene, Words } from "./RecipeVideo.tsx";

const serif = loadSerif("normal", { weights: ["600"], subsets: ["latin", "latin-ext"] }).fontFamily;
const sans = loadSans("normal", { weights: ["500"], subsets: ["latin", "latin-ext"] }).fontFamily;
const SHADOW = "0 4px 24px #000c, 0 2px 6px #0009";

function Clip({ src }: { src: string | undefined }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#1f1a16" }}>
      {src ? (
        <OffthreadVideo
          src={staticFile(src)}
          muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : null}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #000b 0%, #0006 30%, #0000 52%)" }} />
    </AbsoluteFill>
  );
}

function RealHook({ props }: { props: RealisticProps }) {
  return (
    <AbsoluteFill>
      <Clip src={props.clips[0]} />
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 90,
          fontFamily: serif,
          fontSize: 44,
          color: "#ffffff",
          textShadow: SHADOW,
        }}
      >
        Culinova
      </div>
      <Words
        text={props.hook}
        start={8}
        style={{
          position: "absolute",
          top: 230,
          left: 90,
          right: 90,
          fontFamily: serif,
          fontSize: 92,
          lineHeight: 1.08,
          color: "#ffffff",
          textShadow: SHADOW,
        }}
      />
    </AbsoluteFill>
  );
}

function RealShot({ props, index, frames }: { props: RealisticProps; index: number; frames: number }) {
  const frame = useCurrentFrame();
  const count = props.shots.length;
  const progress = interpolate(frame, [0, frames], [index / count, (index + 1) / count], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill>
      <Clip src={props.clips[index + 1]} />
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 90,
          right: 90,
          height: 10,
          borderRadius: 5,
          background: "#ffffff40",
        }}
      >
        <div
          style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 5, background: "#ffffff" }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 170,
          left: 90,
          fontFamily: sans,
          fontSize: 40,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#ffffff",
          textShadow: SHADOW,
        }}
      >
        Étape {index + 1} / {count}
      </div>
      <Words
        text={props.shots[index] ?? ""}
        start={4}
        step={2}
        style={{
          position: "absolute",
          top: 250,
          left: 90,
          right: 90,
          fontFamily: serif,
          fontSize: 84,
          lineHeight: 1.08,
          color: "#ffffff",
          textShadow: SHADOW,
        }}
      />
    </AbsoluteFill>
  );
}

export function RealisticVideo(props: RealisticProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#1f1a16" }}>
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
