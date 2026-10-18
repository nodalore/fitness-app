import { equipmentDetails } from '../profile/profile'
import { supportRequirements } from './exerciseMetadata'
import type { Exercise } from './types'

function MovementSketch({ pattern }: { pattern: string }) {
  // Original pattern-level diagram. Deliberately not an exercise-specific photo.
  const lower = ['squat','hinge','knee_flexion','calf'].includes(pattern)
  return <figure className="movement-sketch"><svg viewBox="0 0 240 125" role="img" aria-label={`${pattern.replaceAll('_',' ')} movement schematic`}>
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 110h200" opacity=".25" />
      <circle cx="65" cy="22" r="8" /><path d="M65 32v35m0-23-20 17m20-17 20 17M65 67l-15 40m15-40 15 40" />
      {lower ? <><circle cx="165" cy="35" r="8" /><path d="m165 45-10 28 22 13-7 21m-15-34-20 15 5 19m22-52 22 10m-22-10-23 7" /></> : <><circle cx="175" cy="22" r="8" /><path d="M175 32v35m0-23-20-15m20 15 20-15m-20 38-15 40m15-40 15 40" /><path d="M144 19h62" opacity=".5" /></>}
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
