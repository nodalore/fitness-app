import { equipmentDetails } from '../profile/profile'
import { supportRequirements } from './exerciseMetadata'
import type { Exercise } from './types'

function MovementSketch({ pattern }: { pattern: string }) {
  // Original pattern-level diagram. Deliberately not an exercise-specific photo.
  const poses: Record<string, { head: [number,number]; body: string }> = {
    squat: { head:[165,35], body:'M165 45l-10 28 22 13-7 21m-15-34-20 15 5 19m22-52 22 10m-22-10-23 7' },
    hinge: { head:[192,48], body:'M182 52l-30 20 4 18-8 17m4-35 20 14 4 21m-6-47 10 28m-10-28 25 16' },
    horizontal_push: { head:[190,73], body:'M180 75h-40l-28 20m58-20-3 25m-20-25-5 25' },
    horizontal_pull: { head:[185,40], body:'M179 50l-20 22 10 35m-10-35-20 35m33-50 21 10-12 10' },
    vertical_push: { head:[175,35], body:'M175 45v27m0-19-20-19V16m20 37 20-19V16m-20 56-15 35m15-35 15 35' },
    vertical_pull: { head:[175,35], body:'M175 45v27m0-19-20-16V16m20 37 20-16V16m-20 56-15 35m15-35 15 35M143 12h64' },
    knee_flexion: { head:[197,65], body:'M187 70h-38l-20 20-10-23m30 3-20 20-15 3m53-23 10 23' },
    calf: { head:[170,17], body:'M170 27v35m0-23-17 20m17-20 17 20m-17 3-10 31 5 9h12m-7-40 10 31 5 9h12' },
    trunk: { head:[197,85], body:'M187 90h-30l-20-17-15 7m35 10-18 12h-17m50-12 2-30m-15 30-8-28' },
    lateral_raise: { head:[170,22], body:'M170 32v35m0-22h-32m32 0h32m-32 22-15 40m15-40 15 40' },
    elbow_flexion: { head:[170,22], body:'M170 32v35m0-23 17 20 12-17m-29-3-17 20-12-17m29 20-15 40m15-40 15 40' },
    elbow_extension: { head:[170,22], body:'M170 32v35m0-23 12 20 8 25m-20-45-12 20-8 25m20-22-15 40m15-40 15 40' },
  }
  const pose = poses[pattern]
  if (!pose) return null
  return <figure className="movement-sketch"><svg viewBox="0 0 240 125" role="img" aria-label={`${pattern.replaceAll('_',' ')} movement schematic`}>
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 110h200" opacity=".25" />
      <circle cx="65" cy="22" r="8" /><path d="M65 32v35m0-23-20 17m20-17 20 17M65 67l-15 40m15-40 15 40" />
      <circle cx={pose.head[0]} cy={pose.head[1]} r="8" /><path d={pose.body} />
      <path d="M103 58h23m-6-6 6 6-6 6" strokeWidth="2" />
    </g>
  </svg><figcaption>Movement schematic · not a technique demonstration</figcaption></figure>
}
export function ExerciseInfo({ exercise }: { exercise: Exercise }) {
  const requirements = supportRequirements(exercise).map(group => group.map(key => equipmentDetails[key as keyof typeof equipmentDetails] ?? key).join(' or '))
  return <details className="exercise-info"><summary><span>{exercise.name}</span><span className="exercise-arrow" aria-hidden="true">↗</span><span className="sr-only"> — exercise details</span></summary>
    <MovementSketch pattern={exercise.movement_pattern} />
    <p>{exercise.technique_notes || 'Use controlled technique and a comfortable range of motion.'}</p>
    <dl><dt>Primary muscles</dt><dd>{exercise.primary_muscles.join(', ')}</dd><dt>Equipment</dt><dd>{[...exercise.equipment,...requirements].join(' · ')}</dd><dt>Load</dt><dd>{exercise.slug.startsWith('band-') ? 'Record band and setup; tension is not a kilogram load.' : exercise.loading_mode === 'per_implement' ? 'Weight per dumbbell / implement.' : exercise.loading_mode === 'bodyweight' ? 'Bodyweight reps; no external load assumed.' : 'Total external load; keep the setup consistent.'}</dd></dl>
    <p className="field-note">General technique notes. Stop for pain and seek qualified guidance.</p>
  </details>
}
