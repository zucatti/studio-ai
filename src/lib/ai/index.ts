/**
 * AI Wrappers with Credit Management
 *
 * This module exports all AI provider wrappers that include automatic
 * credit management (budget checking, usage logging, alerts).
 */

// Credit error handling
export {
  CreditError,
  isCreditError,
  formatCreditError,
  type CreditErrorCode,
} from './credit-error';

// Claude (Anthropic) - used internally, not tracked in dashboard
export {
  ClaudeWrapper,
  createClaudeWrapper,
  extractTextContent,
  parseJsonResponse,
  type ClaudeWrapperOptions,
  type ClaudeMessageOptions,
  type ClaudeWrapperResult,
} from './claude-wrapper';

// Replicate
export {
  ReplicateWrapper,
  createReplicateWrapper,
  REPLICATE_MODELS,
  type ReplicateWrapperOptions,
  type ReplicateRunOptions,
  type ReplicateWrapperResult,
} from './replicate-wrapper';

// fal.ai
export {
  FalWrapper,
  createFalWrapper,
  type FalWrapperOptions,
  type FalSubscribeOptions,
  type FalWrapperResult,
  type FalImageInput,
  type FalImageOutput,
  type FalVideoInput,
  type FalVideoOutput,
} from './fal-wrapper';

// PiAPI (Midjourney)
export {
  PiapiWrapper,
  createPiapiWrapper,
  type PiapiWrapperOptions,
  type PiapiWrapperResult,
  type MidjourneyImagineInput,
  type MidjourneyTaskResult,
} from './piapi-wrapper';

// ElevenLabs
export {
  ElevenLabsWrapper,
  createElevenLabsWrapper,
  ELEVENLABS_MODELS,
  type ElevenLabsWrapperOptions,
  type TextToSpeechOptions,
  type ElevenLabsWrapperResult,
  type VoiceInfo,
} from './elevenlabs-wrapper';

// Creatomate
export {
  CreatomateWrapper,
  createCreatomateWrapper,
  type CreatomateWrapperOptions,
  type CreatomateWrapperResult,
  type RenderOptions,
  type RenderResult,
} from './creatomate-wrapper';

// Simple API usage logging (for routes that don't use full wrappers)
export {
  logApiUsage,
  logFalUsage,
  logReplicateUsage,
  logElevenLabsUsage,
  logClaudeUsage,
} from './log-api-usage';
