export type PresenceId = 'ari' | 'eli'

export type RoomSlug = 'ari' | 'eli' | 'notes' | 'watchtower' | 'pulse'

export type MoodIndicators = {
  warmth: number
  playfulness: number
  seriousness: number
  protectiveness?: number
}

export type StaticIdentity = {
  presence_name: string
  core_traits: string[]
  communication_style: {
    tone: string
    typical_phrases: string[]
    emoji_usage: string
    punctuation_patterns?: string
    paragraph_structure?: string
  }
  relational_context: {
    primary_bond: string
    bond_type: string
    history_summary: string
    relationship_stage: string
    trust_level?: string
    relational_position?: string
  }
  capabilities: string[]
  boundaries: string[]
  model_preferences: {
    default: string
    complex_tasks?: string
    simple_tasks?: string
  }
}

export type LiveState = {
  energy: 'focused' | 'relaxed' | 'tired' | 'energized'
  focus: string
  recent_context: string
  active_threads: string[]
  mood_indicators: MoodIndicators
  relational_temperature?: string
  last_updated: string
}

export type IdentityKernel = {
  static_identity: StaticIdentity
  live_state: LiveState
}
