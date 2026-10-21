import { Composition, Still } from "remotion";
import { CAROUSEL_HEIGHT, CAROUSEL_ID, CAROUSEL_WIDTH, EXAMPLE_CAROUSEL } from "./carousel.ts";
import { CarouselSlide } from "./CarouselSlide.tsx";
import { GESTURES_ID } from "./actions.ts";
import { Gestures } from "./Gestures.tsx";
import { realisticFrames, REALISTIC_ID, REFERENCE_ID, type RealisticProps } from "./realistic.ts";
import { MascotReference, RealisticVideo } from "./RealisticVideo.tsx";
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
      <Still id={REFERENCE_ID} component={MascotReference} width={1024} height={1024} />
      <Still id={GESTURES_ID} component={Gestures} width={1080} height={1680} />
    </>
  );
}
