# Interface asset credits

- `public/images/training-floor.webp` and `training-floor-small.webp`: Ambitious Studio / Rick Barrett, “a gym with a row of exercise equipment,” published January 27, 2023. [Original](https://unsplash.com/photos/a-gym-with-a-row-of-exercise-equipment-03b61PY89hs). Downloaded October 18, 2026 from `images.unsplash.com/photo-1674834727206-4bc272bfd8da`, resized to 1440/720 pixels and converted to WebP by the source service.
- [Unsplash License](https://unsplash.com/license), checked October 18, 2026: permits commercial use and modification; attribution appreciated. Do not sell unmodified copies or compile a competing image service. This equipment-only image is decorative; it does not endorse Fitness App or demonstrate exercise technique.
- Fonts use installed local typefaces and fallbacks; no font files are redistributed or fetched externally.
- Interface icons are original inline SVG paths. The Dribbble reference was inspiration only; no reference images or branding were copied.


## Exercise photographs removed

The user's latest Stage 3 corrections withdraw the exercise-photography requirement. All exercise-photo files, runtime mappings, provenance JSON and attribution UI were removed. No exercise-photo coverage gate remains. Exercises in the recommendation preview use original short text descriptions from `src/features/routines/exerciseDescriptions.ts`. Create My Own Routine does not display automatic explanations or exercise media. The decorative gym-floor assets credited above remain separate and are not demonstrations.

## UI polish placement

The existing licensed gym-floor WebP asset is reused for the compact Discover recommendation thumbnail and the restrained Dashboard banner. CSS crops and a subtle desaturation keep it consistent with charcoal/beige surfaces; no new photo downloads or exercise-demonstration media were introduced. Both placements share the existing responsive 720/1440 WebP sources and browser cache. Shared original inline SVG icons now cover chevrons, close controls and navigation arrows; the dropdown/disclosure CSS uses the matching chevron path. No icon/font package or external asset request was added.
