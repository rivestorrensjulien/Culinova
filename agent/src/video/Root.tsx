import { Composition, Still } from "remotion";
import { CAROUSEL_HEIGHT, CAROUSEL_ID, CAROUSEL_WIDTH, EXAMPLE_CAROUSEL } from "./carousel.ts";
import { CarouselSlide } from "./CarouselSlide.tsx";
import { GESTURES_ID } from "./actions.ts";
import { Gestures } from "./Gestures.tsx";
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
      <Still id={GESTURES_ID} component={Gestures} width={1080} height={1680} />
    </>
  );
}
