// Phase 24 — Interior Reflection Engine: routing layer
// Classifies a reflection output into a suggested next surface.
// This file performs NO writes. It only classifies.
// Routing decisions are stored alongside the reflection for human review.

import type { ReflectionOutput, SuggestedTarget } from './reflection-types'

export interface RoutingDecision {
  suggested_target: SuggestedTarget
  rationale: string
}

/**
 * Evaluate a completed reflection and return a routing decision.
 *
 * The model's own suggested_target is the primary signal. This layer:
 *   - rejects routing when confidence is too low
 *   - applies type-based defaults when the model returned null
 *   - confirms or annotates the model's choice — does not override it
 *
 * The result is stored in reflections.routing_rationale. No surface is written.
 */
export function classifyReflectionRoute(output: ReflectionOutput): RoutingDecision {
  const { reflection_type, suggested_target, confidence } = output

  // Gate: low confidence reflections do not route anywhere
  if (confidence < 0.5) {
    return {
      suggested_target: null,
      rationale: `Confidence ${confidence.toFixed(2)} below routing threshold (0.5) — no target suggested`,
    }
  }

  // model_update: always routes to presence_model when the model left it null
  if (reflection_type === 'model_update' && suggested_target === null) {
    return {
      suggested_target: 'presence_model',
      rationale: 'model_update type with null target — presence_model applied as default',
    }
  }

  // pattern or lesson with high confidence: suggest timeline_draft if model left it null
  if (
    (reflection_type === 'pattern' || reflection_type === 'lesson') &&
    confidence >= 0.8 &&
    suggested_target === null
  ) {
    return {
      suggested_target: 'timeline_draft',
      rationale: `High-confidence ${reflection_type} (${confidence.toFixed(2)}) with no target — timeline_draft suggested`,
    }
  }

  // tension: stays internal unless the model explicitly chose a target
  if (reflection_type === 'tension' && suggested_target === null) {
    return {
      suggested_target: null,
      rationale: 'tension type — stays internal when model did not specify a target',
    }
  }

  // All other cases: honour the model's choice
  if (suggested_target !== null) {
    return {
      suggested_target,
      rationale: `Model suggested ${suggested_target} — accepted (confidence: ${confidence.toFixed(2)})`,
    }
  }

  return {
    suggested_target: null,
    rationale: 'No routing — reflection stands on its own',
  }
}
