// Phase 24A — Reflection display formatting helpers
// Pure functions — no side effects, no data fetching.

// --- Reflection type ---

export function formatReflectionType(type: string): string {
  switch (type) {
    case 'pattern':      return 'Pattern'
    case 'lesson':       return 'Lesson'
    case 'tension':      return 'Tension'
    case 'model_update': return 'Model Update'
    default:             return type
  }
}

export function reflectionTypeColorClass(type: string): string {
  switch (type) {
    case 'pattern':      return 'text-amber-400'
    case 'lesson':       return 'text-green-400'
    case 'tension':      return 'text-rose-400'
    case 'model_update': return 'text-blue-400'
    default:             return 'text-text-muted'
  }
}

export function reflectionTypeBorderClass(type: string): string {
  switch (type) {
    case 'pattern':      return 'border-amber-400/30'
    case 'lesson':       return 'border-green-400/30'
    case 'tension':      return 'border-rose-400/30'
    case 'model_update': return 'border-blue-400/30'
    default:             return 'border-house-border'
  }
}

// --- Suggested target ---

export function formatSuggestedTarget(target: string | null): string {
  if (!target) return '—'
  switch (target) {
    case 'timeline_draft':  return 'Timeline draft'
    case 'living_state':    return 'Living state'
    case 'presence_model':  return 'Presence model'
    default:                return target
  }
}

// --- Confidence ---

export function formatConfidence(confidence: number | null): string {
  if (confidence === null || confidence === undefined) return '—'
  return (confidence * 100).toFixed(0) + '%'
}

export function confidenceLabel(confidence: number | null): string {
  if (confidence === null || confidence === undefined) return 'Unknown'
  if (confidence >= 0.8) return 'High'
  if (confidence >= 0.5) return 'Medium'
  return 'Low'
}

export function confidenceColorClass(confidence: number | null): string {
  if (confidence === null || confidence === undefined) return 'text-text-muted'
  if (confidence >= 0.8) return 'text-green-400'
  if (confidence >= 0.5) return 'text-amber-400'
  return 'text-rose-400'
}

// --- Source refs ---

export function formatSourceRefType(type: string): string {
  switch (type) {
    case 'timeline_entry':   return 'Timeline entry'
    case 'concept':          return 'Approved concept'
    case 'build':            return 'Committed build'
    case 'living_state':     return 'Living State transition'
    case 'cross_room_event': return 'Cross-room event'
    case 'cross_room_impact': return 'Cross-room impact'
    default:                 return type
  }
}

// --- Trigger type ---

export function formatTriggerType(triggerType: string): string {
  switch (triggerType) {
    case 'timeline_keep':           return 'Timeline keep'
    case 'concept_approved':        return 'Concept approval'
    case 'forgekeeper_accepted':    return 'Forgekeeper acceptance'
    case 'living_state_transition': return 'Living State transition'
    case 'cross_room_event':        return 'Cross-room reflection'
    default:                        return triggerType
  }
}

// --- Date ---

export function formatReflectionDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
