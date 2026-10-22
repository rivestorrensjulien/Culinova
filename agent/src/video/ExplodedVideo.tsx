/**
 * Format court « vue éclatée » (voir exploded.ts) : photo → les couches s'écartent → vue du
 * dessus, les couches se reposent une à une → photo finale → Chef Ju « Et voilà ! » → fin.
 */
import { loadFont as loadDancing } from "@remotion/google-fonts/DancingScript";
import { loadFont as loadSans } from "@remotion/google-fonts/DMSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/Fraunces";
import type { CSSProperties } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  EMPTY_FRAMES,
  EXPLODE_FRAMES,
  explodedTimeline,
  type ExplodedProps,
  LAYER_FRAMES,
  layerAt,
  VOICE_START,
} from "./exploded.ts";
import { BackgroundMusic } from "./Music.tsx";
import { EndScene, Words } from "./RecipeVideo.tsx";
import { VOICE_FRAMES } from "./timeline.ts";

const serif = loadSerif("normal", { weights: ["600"], subsets: ["latin", "latin-ext"] }).fontFamily;
const sans = loadSans("normal", { weights: ["500"], subsets: ["latin", "latin-ext"] }).fontFamily;
const script = loadDancing("normal", { weights: ["600"], subsets: ["latin"] }).fontFamily;
const INK = "#1f1a16";
const COPPER = "#a84a24";
const SHADOW = "0 4px 24px #000c, 0 2px 6px #0009";

function src(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith("static:") ? staticFile(path.slice(7)) : staticFile(path);
}

function Cover({ path, zoom = 1, style }: { path: string | null; zoom?: number; style?: CSSProperties }) {
  const url = src(path);
  return url ? (
    <Img
      src={url}
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: `scale(${zoom})`,
        ...style,
      }}
    />
  ) : null;
}

function PhotoScene({ props, frames }: { props: ExplodedProps; frames: number }) {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, frames], [1.12, 1.02]);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Cover path={props.photoUrl} zoom={zoom} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #000a 0%, #0000 38%)" }} />
      <Words
        text={props.hook}
        start={4}
        step={2}
        style={{
          position: "absolute",
          top: 150,
          left: 80,
          right: 80,
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

/** Les couches s'écartent ; leurs noms apparaissent un à un. */
function ExplodeScene({ props }: { props: ExplodedProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clip = src(props.explodeClip);
  const names = props.layerNames;
  const step = (EXPLODE_FRAMES - 30) / Math.max(1, names.length);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {clip ? (
        <OffthreadVideo
          src={clip}
          muted
          playbackRate={(5 * fps) / EXPLODE_FRAMES}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <Cover path={props.photoUrl} />
      )}
      <AbsoluteFill style={{ background: "linear-gradient(0deg, #000b 0%, #0000 36%)" }} />
      <div style={{ position: "absolute", left: 80, right: 80, bottom: 170 }}>
        {[...names].reverse().map((name, i) => {
          const index = names.length - 1 - i;
          const shown = spring({ frame: frame - 12 - index * step, fps, config: { damping: 15 } });
          return (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                marginTop: 14,
                opacity: shown,
                transform: `translateX(${(1 - shown) * -60}px)`,
                fontFamily: sans,
                fontSize: 46,
                color: "#ffffff",
                textShadow: SHADOW,
              }}
            >
              <span style={{ width: 18, height: 18, borderRadius: 9, background: "#f2b07a" }} />
              {name}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Vue du dessus : chaque couche se pose avec un petit rebond, son nom s'affiche. */
function AssembleScene({ props }: { props: ExplodedProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = props.layerNames.length;
  const current = layerAt(frame, count);
  // Entrée : on « bascule » au-dessus du plat (zoom et flou qui se dissipent).
  const enter = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: "clamp" });
  const since = current < 0 ? frame : frame - EMPTY_FRAMES - current * LAYER_FRAMES;
  const drop = spring({ frame: since, fps, config: { damping: 11, mass: 0.6 } });
  const name = current >= 0 ? props.layerNames[current] : null;
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {current >= 0 ? <Cover path={props.topViews[current] ?? null} /> : null}
      <Cover
        path={props.topViews[current + 1] ?? null}
        zoom={current < 0 ? 1.35 - enter * 0.35 : 1.05 - drop * 0.05}
        style={{
          opacity: current < 0 ? enter : drop,
          filter: current < 0 ? `blur(${(1 - enter) * 24}px)` : undefined,
        }}
      />
      {name ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 200,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              padding: "18px 40px",
              borderRadius: 60,
              background: "#faf6efee",
              fontFamily: sans,
              fontSize: 48,
              color: INK,
              transform: `scale(${0.8 + drop * 0.2})`,
              opacity: drop,
            }}
          >
            <span style={{ color: COPPER }}>+ </span>
            {name}
          </div>
        </div>
      ) : null}
      <AbsoluteFill style={{ backgroundColor: "#ffffff", opacity: 1 - enter }} />
    </AbsoluteFill>
  );
}

function FinalScene({ props, frames }: { props: ExplodedProps; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = spring({ frame: frame - 6, fps, config: { damping: 16 } });
  const zoom = interpolate(frame, [0, frames], [1, 1.06]);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <Cover path={props.photoUrl} zoom={zoom} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #0000 50%, #000c 100%)" }} />
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          bottom: 260,
          opacity: title,
          transform: `translateY(${(1 - title) * 50}px)`,
          fontFamily: serif,
          fontSize: 76,
          lineHeight: 1.05,
          color: "#ffffff",
          textShadow: SHADOW,
        }}
      >
        {props.name}
      </div>
    </AbsoluteFill>
  );
}

function VoilaScene({ props }: { props: ExplodedProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clip = src(props.voilaClip);
  const words = spring({ frame: frame - VOICE_START, fps, config: { damping: 9, mass: 0.7 } });
  // « y'a plus qu'à se régaler » arrive environ 1,1 s après « Et voilà ».
  const rest = spring({ frame: frame - VOICE_START - 34, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      {clip ? (
        <OffthreadVideo
          src={clip}
          muted={Boolean(props.voice)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <Cover path={props.photoUrl} />
      )}
      <div
        style={{
          position: "absolute",
          top: 170,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: script,
          fontSize: 170,
          color: "#ffffff",
          textShadow: SHADOW,
          opacity: words,
          transform: `scale(${0.6 + words * 0.4}) rotate(${(1 - words) * -8}deg)`,
        }}
      >
        Et voilà !
      </div>
      {props.voice ? (
        <>
          <Sequence from={VOICE_START} layout="none">
            <Audio src={staticFile(props.voice)} />
          </Sequence>
          <div
            style={{
              position: "absolute",
              top: 380,
              left: 60,
              right: 60,
              textAlign: "center",
              fontFamily: script,
              fontSize: 92,
              color: "#ffffff",
              textShadow: SHADOW,
              opacity: rest,
              transform: `translateY(${(1 - rest) * 30}px)`,
            }}
          >
            y'a plus qu'à se régaler !
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
}

export function ExplodedVideo(props: ExplodedProps) {
  const segments = explodedTimeline(props);
  const total = segments.reduce((sum, s) => sum + s.frames, 0);
  const voila = segments.find((s) => s.kind === "voila")!;
  const voiceFrom = voila.from + VOICE_START;
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <BackgroundMusic
        src={props.music}
        total={total}
        voice={props.voice ? [voiceFrom, voiceFrom + VOICE_FRAMES] : null}
      />
      {segments.map((segment) => (
        <Sequence key={segment.kind} from={segment.from} durationInFrames={segment.frames}>
          {segment.kind === "photo" ? <PhotoScene props={props} frames={segment.frames} /> : null}
          {segment.kind === "explode" ? <ExplodeScene props={props} /> : null}
          {segment.kind === "assemble" ? <AssembleScene props={props} /> : null}
          {segment.kind === "final" ? <FinalScene props={props} frames={segment.frames} /> : null}
          {segment.kind === "voila" ? <VoilaScene props={props} /> : null}
          {segment.kind === "end" ? <EndScene props={{ ...props, voice: null }} /> : null}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
