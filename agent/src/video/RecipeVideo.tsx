/**
 * Vidéo verticale d'une recette : la mascotte réagit, le texte apparaît mot à mot
 * au rythme du script TikTok, puis la photo du plat se dévoile.
 * Zones sûres : rien d'important dans les 320 px du bas ni les 150 px de droite
 * (boutons de TikTok et d'Instagram).
 */
import { loadFont as loadDancing } from "@remotion/google-fonts/DancingScript";
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/Fraunces";
import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Mascot } from "./Mascot.tsx";
import { shotExpression, timeline, type VideoProps } from "./timeline.ts";

const serif = loadSerif("normal", { weights: ["600"], subsets: ["latin", "latin-ext"] }).fontFamily;
const sans = loadSans("normal", { weights: ["500"], subsets: ["latin", "latin-ext"] }).fontFamily;
loadDancing("normal", { weights: ["600"], subsets: ["latin"] });

const COLORS = {
  ivory: "#faf6ef",
  ink: "#1f1a16",
  copper: "#a84a24",
  sage: "#55634a",
  gold: "#b08a3e",
  muted: "#6b5f55",
};
const BACKGROUNDS = ["#faf6ef", "#f3e4d6", "#e6eadf", "#f1e7cf"];

/** Phrase révélée mot à mot (chaque mot monte et apparaît avec un léger rebond). */
function Words({
  text,
  start = 0,
  step = 3,
  style,
}: {
  text: string;
  start?: number;
  step?: number;
  style: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 0.28em", ...style }}>
      {text
        .split(/\s+/)
        .filter(Boolean)
        .map((word, i) => {
          const progress = spring({
            frame: frame - start - i * step,
            fps,
            config: { damping: 14, mass: 0.6 },
          });
          return (
            <span
              key={`${word}-${i}`}
              style={{
                display: "inline-block",
                opacity: progress,
                transform: `translateY(${(1 - progress) * 40}px) scale(${0.9 + progress * 0.1})`,
              }}
            >
              {word}
            </span>
          );
        })}
    </div>
  );
}

/** Mascotte qui arrive avec un rebond puis respire doucement. */
function BouncingMascot({
  expression,
  jacket,
  size,
  bust,
  delay = 0,
  style,
}: {
  expression: Parameters<typeof Mascot>[0]["expression"];
  jacket: VideoProps["jacket"];
  size: number;
  bust?: boolean;
  delay?: number;
  style: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.8 } });
  const breathe = Math.sin(frame / 9) * 6;
  return (
    <div
      style={{
        position: "absolute",
        transform: `translateY(${(1 - enter) * 500 + breathe}px) rotate(${Math.sin(frame / 14) * 2}deg)`,
        ...style,
      }}
    >
      <Mascot expression={expression} jacket={jacket} size={size} bust={bust} frame={frame} />
    </div>
  );
}

function Brand() {
  return (
    <div
      style={{
        position: "absolute",
        top: 110,
        left: 90,
        fontFamily: serif,
        fontSize: 44,
        color: COLORS.copper,
        letterSpacing: "0.02em",
      }}
    >
      Culinova
    </div>
  );
}

function HookScene({ props }: { props: VideoProps }) {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ivory }}>
      <Brand />
      <Words
        text={props.hook}
        start={8}
        style={{
          position: "absolute",
          top: 260,
          left: 90,
          right: 150,
          fontFamily: serif,
          fontSize: 92,
          lineHeight: 1.08,
          color: COLORS.ink,
        }}
      />
      <BouncingMascot expression="waouh" jacket={props.jacket} size={620} style={{ left: 230, top: 980 }} />
    </AbsoluteFill>
  );
}

function ShotScene({ props, index, frames }: { props: VideoProps; index: number; frames: number }) {
  const frame = useCurrentFrame();
  const count = props.shots.length;
  const progress = interpolate(frame, [0, frames], [index / count, (index + 1) / count], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: BACKGROUNDS[index % BACKGROUNDS.length] }}>
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 90,
          right: 150,
          height: 10,
          borderRadius: 5,
          background: "#0000000f",
        }}
      >
        <div
          style={{ width: `${progress * 100}%`, height: "100%", borderRadius: 5, background: COLORS.copper }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 190,
          left: 90,
          fontFamily: sans,
          fontSize: 40,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: COLORS.copper,
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
          top: 290,
          left: 90,
          right: 150,
          fontFamily: serif,
          fontSize: 96,
          lineHeight: 1.08,
          color: COLORS.ink,
        }}
      />
      <BouncingMascot
        expression={shotExpression(index, count)}
        jacket={props.jacket}
        size={460}
        bust
        delay={2}
        style={{ left: 70, top: 1060 }}
      />
    </AbsoluteFill>
  );
}

function RevealScene({ props, frames }: { props: VideoProps; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, frames], [1.12, 1], { extrapolateRight: "clamp" });
  const flash = interpolate(frame, [0, 8], [1, 0], { extrapolateRight: "clamp" });
  const title = spring({ frame: frame - 12, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      {props.photoUrl ? (
        <Img
          src={props.photoUrl.startsWith("static:") ? staticFile(props.photoUrl.slice(7)) : props.photoUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})` }}
        />
      ) : null}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #0000 45%, #000a 78%, #000c 100%)" }} />
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 150,
          bottom: 420,
          opacity: title,
          transform: `translateY(${(1 - title) * 60}px)`,
          fontFamily: serif,
          fontSize: 84,
          lineHeight: 1.05,
          color: "#ffffff",
        }}
      >
        {props.name}
      </div>
      <BouncingMascot
        expression="croque"
        jacket={props.jacket}
        size={300}
        bust
        delay={30}
        style={{ right: 170, top: 150 }}
      />
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: flash }} />
    </AbsoluteFill>
  );
}

function EndScene({ props }: { props: VideoProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = spring({ frame: frame - 10, fps, config: { damping: 15 } });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ivory, alignItems: "center" }}>
      <BouncingMascot expression="clin" jacket={props.jacket} size={560} style={{ left: 260, top: 230 }} />
      <div
        style={{
          position: "absolute",
          top: 900,
          left: 90,
          right: 90,
          textAlign: "center",
          opacity: text,
          transform: `translateY(${(1 - text) * 40}px)`,
        }}
      >
        <div style={{ fontFamily: sans, fontSize: 44, color: COLORS.muted }}>
          La recette complète, pesée et chiffrée
        </div>
        <div style={{ fontFamily: serif, fontSize: 110, color: COLORS.copper, marginTop: 24 }}>
          {props.site}
        </div>
        <div style={{ fontFamily: sans, fontSize: 48, color: COLORS.ink, marginTop: 24 }}>{props.handle}</div>
      </div>
    </AbsoluteFill>
  );
}

export function RecipeVideo(props: VideoProps) {
  const segments = timeline(props);
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ivory }}>
      {props.music ? <Audio src={staticFile(props.music)} volume={0.35} /> : null}
      {segments.map((segment) => (
        <Sequence
          key={`${segment.kind}-${segment.from}`}
          from={segment.from}
          durationInFrames={segment.frames}
        >
          {segment.kind === "hook" ? <HookScene props={props} /> : null}
          {segment.kind === "shot" ? (
            <ShotScene props={props} index={segment.index ?? 0} frames={segment.frames} />
          ) : null}
          {segment.kind === "reveal" ? <RevealScene props={props} frames={segment.frames} /> : null}
          {segment.kind === "end" ? <EndScene props={props} /> : null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
