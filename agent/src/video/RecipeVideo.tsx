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
import { actionExpression, shotAction, shotText, stepLabel } from "./actions.ts";
import { WorkingChef } from "./Kitchen.tsx";
import { Mascot } from "./Mascot.tsx";
import { BackgroundMusic } from "./Music.tsx";
import { timeline, VOICE_FRAMES, WIDTH, type VideoProps } from "./timeline.ts";

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

function photoSrc(photoUrl: string | null): string | null {
  if (!photoUrl) return null;
  return photoUrl.startsWith("static:") ? staticFile(photoUrl.slice(7)) : photoUrl;
}

/**
 * Fond tiré de la photo du plat (très floutée, voilée d'ivoire) : chaque scène prend les
 * couleurs de la recette, pour que toute la vidéo soit cohérente avec sa photo.
 */
function PhotoBackdrop({ props, veil = 0.78 }: { props: VideoProps; veil?: number }) {
  const src = photoSrc(props.photoUrl);
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ivory, overflow: "hidden" }}>
      {src ? (
        <Img
          src={src}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(48px) saturate(1.2)",
            transform: "scale(1.25)",
          }}
        />
      ) : null}
      <AbsoluteFill style={{ backgroundColor: COLORS.ivory, opacity: veil }} />
    </AbsoluteFill>
  );
}

/** Le plat de la recette, en carte arrondie, toujours visible pendant les étapes. */
function DishCard({
  props,
  width,
  height,
  delay = 0,
  tilt = 0,
  style,
}: {
  props: VideoProps;
  width: number;
  height: number;
  delay?: number;
  tilt?: number;
  style: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = photoSrc(props.photoUrl);
  if (!src) return null;
  const enter = spring({ frame: frame - delay, fps, config: { damping: 14 } });
  return (
    <div
      style={{
        position: "absolute",
        width,
        height,
        borderRadius: 36,
        overflow: "hidden",
        border: "10px solid #ffffff",
        boxShadow: "0 30px 60px #0003",
        opacity: enter,
        transform: `translateY(${(1 - enter) * 120}px) rotate(${tilt}deg) scale(${0.9 + enter * 0.1})`,
        ...style,
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${1.04 + Math.sin(frame / 40) * 0.03})`,
        }}
      />
    </div>
  );
}

/** Phrase révélée mot à mot (chaque mot monte et apparaît avec un léger rebond). */
export function Words({
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
/** Chef Ju en 3D (image détourée) qui arrive avec un rebond puis respire doucement. */
export function Mascot3D({ src, style }: { src: string; style: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 11, mass: 0.8 } });
  const breathe = Math.sin(frame / 9) * 5;
  return (
    <Img
      src={staticFile(src)}
      style={{
        position: "absolute",
        objectFit: "contain",
        transform: `translateY(${(1 - enter) * 500 + breathe}px)`,
        ...style,
      }}
    />
  );
}

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

export function Brand() {
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
    <AbsoluteFill>
      <PhotoBackdrop props={props} />
      <Brand />
      <DishCard props={props} width={500} height={640} delay={20} tilt={4} style={{ right: 140, top: 900 }} />
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
      <BouncingMascot expression="waouh" jacket={props.jacket} size={460} style={{ left: 40, top: 1110 }} />
    </AbsoluteFill>
  );
}

/** Texte du plan : plus petit quand il est long, pour ne jamais passer sur Chef Ju. */
export function shotFontSize(text: string): number {
  if (text.length > 150) return 56;
  if (text.length > 110) return 64;
  if (text.length > 70) return 74;
  return 88;
}

function ShotScene({ props, index, frames }: { props: VideoProps; index: number; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = props.shots.length;
  const text = shotText(props.shots, index);
  const action = shotAction(props.shots[index] ?? "");
  const enter = spring({ frame, fps, config: { damping: 13, mass: 0.7 } });
  const progress = interpolate(frame, [0, frames], [index / count, (index + 1) / count], {
    extrapolateRight: "clamp",
  });
  const plating = action === "dresser";
  return (
    <AbsoluteFill>
      <PhotoBackdrop props={props} veil={0.8 - (index % 2) * 0.06} />
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
        {stepLabel(props.shots, index)}
      </div>
      <Words
        text={text}
        start={4}
        step={2}
        style={{
          position: "absolute",
          top: 280,
          left: 90,
          right: 90,
          fontFamily: serif,
          fontSize: shotFontSize(text),
          lineHeight: 1.08,
          color: COLORS.ink,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 160}px)`,
        }}
      >
        <WorkingChef
          action={action}
          expression={actionExpression(action, index === count - 1)}
          jacket={props.jacket}
          frame={frame}
          width={WIDTH}
        />
      </div>
      <DishCard
        props={props}
        width={plating ? 280 : 190}
        height={plating ? 350 : 240}
        delay={plating ? 18 : 6}
        tilt={index % 2 === 0 ? 4 : -4}
        style={{ right: 50, top: plating ? 680 : 780 }}
      />
    </AbsoluteFill>
  );
}

export function RevealScene({ props, frames }: { props: VideoProps; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, frames], [1.12, 1], { extrapolateRight: "clamp" });
  const flash = interpolate(frame, [0, 8], [1, 0], { extrapolateRight: "clamp" });
  const title = spring({ frame: frame - 12, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      {photoSrc(props.photoUrl) ? (
        <Img
          src={photoSrc(props.photoUrl)!}
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

export function EndScene({ props }: { props: VideoProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = spring({ frame: frame - 10, fps, config: { damping: 15 } });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <PhotoBackdrop props={props} veil={0.85} />
      {props.voice ? <Audio src={staticFile(props.voice)} /> : null}
      {props.endMascot ? (
        <Mascot3D
          src={props.endMascot}
          style={{ left: 0, right: 0, margin: "0 auto", top: 420, height: 640 }}
        />
      ) : (
        <BouncingMascot expression="clin" jacket={props.jacket} size={560} style={{ left: 260, top: 420 }} />
      )}
      {props.voice ? (
        <div
          style={{
            position: "absolute",
            top: 290,
            left: 60,
            right: 60,
            textAlign: "center",
            fontFamily: "'Dancing Script', cursive",
            fontWeight: 600,
            fontSize: 76,
            color: COLORS.copper,
            opacity: text,
          }}
        >
          Et voilà, y'a plus qu'à se régaler !
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          top: 1090,
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
  const total = segments.reduce((sum, s) => sum + s.frames, 0);
  const end = segments[segments.length - 1]!;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ivory }}>
      <BackgroundMusic
        src={props.music}
        total={total}
        voice={props.voice ? [end.from, end.from + VOICE_FRAMES] : null}
      />
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
