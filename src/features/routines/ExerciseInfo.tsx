import { useState } from 'react'
import { exerciseDescriptions } from './exerciseDescriptions'
import { equipmentDetails } from '../profile/profile'
import { supportRequirements } from './exerciseMetadata'
import type { Exercise } from './types'

// Text-only explanations are offered in the recommendation preview, never in
// the custom routine composer. One controlled disclosure opens per plan.
export function ExerciseInfo({ exercise, open, onOpenChange }: { exercise: Exercise; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [localOpen, setLocalOpen] = useState(false)
  const expanded = open ?? localOpen
  const requirements = supportRequirements(exercise).map(group => group.map(key => equipmentDetails[key as keyof typeof equipmentDetails] ?? key).join(' or '))
  return <details className="exercise-info" open={expanded}><summary onClick={event => { event.preventDefault(); if (onOpenChange) onOpenChange(!expanded); else setLocalOpen(!expanded) }}><span>{exercise.name}<small className="exercise-equipment">Equipment: {[...exercise.equipment, ...requirements].join(' · ') || 'None'}</small></span><span className="exercise-arrow" aria-hidden="true">↗</span><span className="sr-only"> — exercise details</span></summary>
    {expanded && <>
      <p>{exerciseDescriptions[exercise.slug] || exercise.technique_notes || 'No description available.'}</p>
      {exercise.loading_mode === 'per_implement' && <p className="field-note">Weight is per dumbbell / implement.</p>}
    </>}
  </details>
}
