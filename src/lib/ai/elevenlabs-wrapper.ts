/**
 * ElevenLabs API Wrapper with Credit Management
 *
 * Wraps all ElevenLabs API calls to:
 * 1. Estimate cost before the call
 * 2. Check available budget
 * 3. Make the API call
 * 4. Log actual usage
 * 5. Trigger alerts if needed
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  createCreditService,
  calculateElevenLabsCost,
  ensureCredit,
  ELEVENLABS_PRICES,
} from '@/lib/credits';
import { isCreditError, formatCreditError } from './credit-error';

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsWrapperOptions {
  userId: string;
  projectId?: string;
  supabase: SupabaseClient;
  operation: string;
}

export interface TextToSpeechOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
    useSpeakerBoost?: boolean;
  };
  outputFormat?: 'mp3_44100_128' | 'mp3_44100_64' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000' | 'pcm_44100';
}

export interface ElevenLabsWrapperResult {
  audio: ArrayBuffer;
  cost: number;
  characters: number;
}

export interface VoiceInfo {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

/**
 * Create a wrapped ElevenLabs client with credit management
 */
export class ElevenLabsWrapper {
  private apiKey: string;
  private creditService: ReturnType<typeof createCreditService>;
  private userId: string;
  private projectId?: string;
  private supabase: SupabaseClient;
  private operation: string;

  constructor(options: ElevenLabsWrapperOptions) {
    this.apiKey = process.env.AI_ELEVEN_LABS || '';
    this.creditService = createCreditService(options.supabase);
    this.userId = options.userId;
    this.projectId = options.projectId;
    this.supabase = options.supabase;
    this.operation = options.operation;
  }

  /**
   * Generate speech from text with automatic credit management
   */
  async textToSpeech(options: TextToSpeechOptions): Promise<ElevenLabsWrapperResult> {
    const {
      voiceId,
      text,
      modelId = 'eleven_multilingual_v2',
      voiceSettings = {
        stability: 0.5,
        similarityBoost: 0.75,
      },
      outputFormat = 'mp3_44100_128',
    } = options;

    const characters = text.length;

    // Step 1: Estimate cost before the call
    const estimatedCost = calculateElevenLabsCost(modelId, characters);

    // Step 2: Check budget
    try {
      await ensureCredit(
        this.creditService,
        this.userId,
        'elevenlabs',
        estimatedCost
      );
    } catch (error) {
      if (isCreditError(error)) {
        await this.creditService.logUsage(this.userId, {
          provider: 'elevenlabs',
          model: modelId,
          operation: this.operation,
          project_id: this.projectId,
          characters,
          estimated_cost: estimatedCost,
          status: 'blocked',
          error_message: formatCreditError(error),
        });
      }
      throw error;
    }

    // Step 3: Make the API call
    let audioBuffer: ArrayBuffer;
    try {
      const response = await fetch(
        `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: voiceSettings.stability,
              similarity_boost: voiceSettings.similarityBoost,
              style: voiceSettings.style,
              use_speaker_boost: voiceSettings.useSpeakerBoost,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      audioBuffer = await response.arrayBuffer();
    } catch (error) {
      await this.creditService.logUsage(this.userId, {
        provider: 'elevenlabs',
        model: modelId,
        operation: this.operation,
        project_id: this.projectId,
        characters,
        estimated_cost: 0,
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    // Step 4: Log successful usage
    await this.creditService.logUsage(this.userId, {
      provider: 'elevenlabs',
      model: modelId,
      operation: this.operation,
      project_id: this.projectId,
      characters,
      estimated_cost: estimatedCost,
      status: 'success',
      metadata: {
        voiceId,
        outputFormat,
      },
    });

    return {
      audio: audioBuffer,
      cost: estimatedCost,
      characters,
    };
  }

  /**
   * Generate speech and return as base64-encoded data URL
   */
  async textToSpeechBase64(options: TextToSpeechOptions): Promise<{
    dataUrl: string;
    cost: number;
    characters: number;
  }> {
    const result = await this.textToSpeech(options);
    const base64 = Buffer.from(result.audio).toString('base64');
    const mimeType = options.outputFormat?.startsWith('pcm_') ? 'audio/wav' : 'audio/mpeg';

    return {
      dataUrl: `data:${mimeType};base64,${base64}`,
      cost: result.cost,
      characters: result.characters,
    };
  }

  /**
   * Get list of available voices (no credit cost)
   */
  async getVoices(): Promise<VoiceInfo[]> {
    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: {
        'xi-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.voices || [];
  }

  /**
   * Get voice info by ID (no credit cost)
   */
  async getVoice(voiceId: string): Promise<VoiceInfo> {
    const response = await fetch(`${ELEVENLABS_API_URL}/voices/${voiceId}`, {
      headers: {
        'xi-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get subscription info (no credit cost)
   */
  async getSubscription(): Promise<{
    character_count: number;
    character_limit: number;
    next_character_count_reset_unix: number;
  }> {
    const response = await fetch(`${ELEVENLABS_API_URL}/user/subscription`, {
      headers: {
        'xi-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }
}

/**
 * Create an ElevenLabs wrapper instance
 */
export function createElevenLabsWrapper(
  options: ElevenLabsWrapperOptions
): ElevenLabsWrapper {
  return new ElevenLabsWrapper(options);
}

// Common ElevenLabs model identifiers
export const ELEVENLABS_MODELS = {
  V3: 'eleven_v3', // Latest - supports audio tags like [laughs], [sad], [whispers]
  MULTILINGUAL_V2: 'eleven_multilingual_v2',
  TURBO_V2: 'eleven_turbo_v2',
  MONOLINGUAL_V1: 'eleven_monolingual_v1',
} as const;
