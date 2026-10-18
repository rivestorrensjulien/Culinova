import { Composition } from "remotion";
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
  );
}
