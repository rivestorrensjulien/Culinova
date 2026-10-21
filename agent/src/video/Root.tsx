import { Audio, Composition, Sequence, Still, staticFile } from "remotion";
import { CAROUSEL_HEIGHT, CAROUSEL_ID, CAROUSEL_WIDTH, EXAMPLE_CAROUSEL } from "./carousel.ts";
import { CarouselSlide } from "./CarouselSlide.tsx";
import { GESTURES_ID } from "./actions.ts";
import { Gestures } from "./Gestures.tsx";
import { realisticFrames, REALISTIC_ID, REFERENCE_ID, type RealisticProps } from "./realistic.ts";
import { MascotReference, RealisticVideo } from "./RealisticVideo.tsx";
import { EXPLODED_ID, explodedFrames, type ExplodedProps, VOICE_START, VOICE_TRACK_ID } from "./exploded.ts";
import { ExplodedVideo } from "./ExplodedVideo.tsx";

function VoiceTrack({ voice }: { voice: string }) {
  return (
    <Sequence from={VOICE_START}>
      <Audio src={staticFile(voice)} />
    </Sequence>
  );
}
import { RecipeVideo } from "./RecipeVideo.tsx";
import {
  COMPOSITION_ID,
  EXAMPLE_PROPS,
  FPS,
  HEIGHT,
  WIDTH,
  totalFrames,
  type VideoProps,
} from "./timeline.ts";

const REALISTIC_EXAMPLE: RealisticProps = {
  ...EXAMPLE_PROPS,
  hookClip: null,
  plans: EXAMPLE_PROPS.shots.map(() => ({ clips: [] })),
};

const EXPLODED_EXAMPLE: ExplodedProps = {
  ...EXAMPLE_PROPS,
  explodeClip: null,
  topViews: [],
  layerNames: ["Baghrir", "Beurre au miel"],
  voilaClip: null,
};

export function Root() {
  return (
    <>
      <Composition
        id={COMPOSITION_ID}
        component={RecipeVideo}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={totalFrames(EXAMPLE_PROPS)}
        defaultProps={EXAMPLE_PROPS}
        calculateMetadata={({ props }: { props: VideoProps }) => ({ durationInFrames: totalFrames(props) })}
      />
      <Still
        id={CAROUSEL_ID}
        component={CarouselSlide}
        width={CAROUSEL_WIDTH}
        height={CAROUSEL_HEIGHT}
        defaultProps={EXAMPLE_CAROUSEL}
      />
      <Composition
        id={REALISTIC_ID}
        component={RealisticVideo}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={realisticFrames(REALISTIC_EXAMPLE)}
        defaultProps={REALISTIC_EXAMPLE}
        calculateMetadata={({ props }: { props: RealisticProps }) => ({
          durationInFrames: realisticFrames(props),
        })}
      />
      <Composition
        id={EXPLODED_ID}
        component={ExplodedVideo}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={explodedFrames(EXPLODED_EXAMPLE)}
        defaultProps={EXPLODED_EXAMPLE}
        calculateMetadata={({ props }: { props: ExplodedProps }) => ({
          durationInFrames: explodedFrames(props),
        })}
      />
      <Composition
        id={VOICE_TRACK_ID}
        component={VoiceTrack}
        width={360}
        height={640}
        fps={FPS}
        durationInFrames={150}
        defaultProps={{ voice: "voix/et-voila.mp3" }}
      />
      <Still id={REFERENCE_ID} component={MascotReference} width={1024} height={1024} />
      <Still id={GESTURES_ID} component={Gestures} width={1080} height={1680} />
    </>
  );
}
