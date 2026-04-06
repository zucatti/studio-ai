/**
 * Prompt Preview API Route
 *
 * Returns the full final prompt that would be sent to Kling,
 * including cinematic header and Style Bible.
 */

import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { buildCinematicPrompt, type VideoModelType } from '@/lib/ai/cinematic-prompt-builder';
import { cinematicHeaderToPrompt, getStyleBibleFromCinematicStyle } from '@/lib/cinematic-header-to-prompt';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import type { GlobalAsset } from '@/types/database';
import type { Segment, CinematicHeaderConfig } from '@/types/cinematic';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

/**
 * GET - Get the full prompt preview for a shot
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const url = new URL(request.url);
    const targetModel = (url.searchParams.get('model') || 'kling-omni') as VideoModelType;
    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return Response.json(
        { error: 'Project not found', details: projectError },
        { status: 404 }
      );
    }

    // Get shot data with segments
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('*, segments, cinematic_header, sequence_id')
      .eq('id', shotId)
      .single();

    if (!shot) {
      return Response.json(
        { error: 'Shot not found', details: shotError },
        { status: 404 }
      );
    }

    const segments = shot.segments as Segment[] | null;
    let cinematicHeader = shot.cinematic_header as CinematicHeaderConfig | null;

    // If shot belongs to a sequence, inherit cinematic_header from sequence
    if (shot.sequence_id) {
      const { data: sequence } = await supabase
        .from('sequences')
        .select('cinematic_header')
        .eq('id', shot.sequence_id)
        .single();

      if (sequence?.cinematic_header) {
        cinematicHeader = sequence.cinematic_header as CinematicHeaderConfig;
      }
    }

    // Get project characters for mapping (global assets)
    const { data: projectAssets } = await supabase
      .from('project_assets')
      .select(`global_asset:global_assets (*)`)
      .eq('project_id', projectId);

    const globalCharacters = (projectAssets || [])
      .map(pa => pa.global_asset as unknown as GlobalAsset)
      .filter(a => a && a.asset_type === 'character');

    // Also get generic characters from project_generic_assets
    // Note: generic_asset_id is a TEXT field (e.g., "generic:woman"), not a FK
    // We use GENERIC_CHARACTERS in-memory array to look up character data
    const { data: projectGenericAssets } = await supabase
      .from('project_generic_assets')
      .select('*')
      .eq('project_id', projectId);

    const genericCharacters = (projectGenericAssets || [])
      .map(pga => {
        // Look up the generic character from in-memory array
        const genericChar = GENERIC_CHARACTERS.find(g => g.id === pga.generic_asset_id);
        if (!genericChar) return null;

        // Get local overrides (may have reference images)
        const localOverrides = (pga.local_overrides || {}) as {
          reference_images_metadata?: Array<{ url: string }>;
          visual_description?: string;
          fal_voice_id?: string;
        };
        const referenceImages = (localOverrides.reference_images_metadata || []).map(img => img.url);

        // Convert to GlobalAsset-like structure (partial, cast through unknown)
        // Use pga.id (UUID) as the unique identifier - NOT generic_asset_id which is shared by all variants
        return {
          id: pga.id,  // UUID from project_generic_assets (unique per imported character)
          name: pga.name_override || genericChar.name,  // Use name_override if set (e.g., "OldWoman#1")
          asset_type: 'character' as const,
          reference_images: referenceImages,
          data: {
            visual_description: localOverrides.visual_description || genericChar.description,
            fal_voice_id: localOverrides.fal_voice_id,
          },
        } as unknown as GlobalAsset;
      })
      .filter((a): a is GlobalAsset => a !== null);

    // Merge both character sources
    const allCharacters = [...globalCharacters, ...genericCharacters];

    // Build character map from segments
    const characterMap = new Map<string, GlobalAsset>();

    if (segments && segments.length > 0) {
      for (const segment of segments) {
        if (segment.beats && Array.isArray(segment.beats)) {
          for (const beat of segment.beats) {
            if (beat.character_id) {
              const char = allCharacters.find(c => c.id === beat.character_id);
              if (char) {
                characterMap.set(char.id, char);
              }
            }
          }
        }
        // Legacy dialogue field
        if (segment.dialogue?.character_id) {
          const char = allCharacters.find(c => c.id === segment.dialogue!.character_id);
          if (char) {
            characterMap.set(char.id, char);
          }
        }
      }
    }

    // Build the parts of the prompt for display
    const parts: { label: string; content: string }[] = [];

    // Part 1: Cinematic Header
    if (cinematicHeader) {
      const headerPrompt = cinematicHeaderToPrompt(cinematicHeader);
      parts.push({
        label: 'Cinematic Header',
        content: headerPrompt,
      });
    }

    // Part 2: Build the full prompt
    const mockShort = { dialogue_language: 'en' };
    const mockPlan = {
      id: shotId,
      shot_number: shot.shot_number || 1,
      duration: shot.duration || 5,
      sort_order: 0,
      segments: segments || [],
      cinematic_header: cinematicHeader,
      description: shot.description,
      action: shot.action,
      animation_prompt: shot.animation_prompt,
    };

    const hasFrameIn = !!(shot.first_frame_url || shot.storyboard_image_url);
    const fullPrompt = buildCinematicPrompt(mockShort as never, [mockPlan] as never, characterMap, hasFrameIn, targetModel);

    // Part 3: Style Bible (extracted for display)
    let styleBible = '';
    if (cinematicHeader?.cinematic_style) {
      styleBible = getStyleBibleFromCinematicStyle(
        cinematicHeader.cinematic_style,
        cinematicHeader.custom_style_bible
      );
      if (styleBible) {
        parts.push({
          label: 'Style Bible',
          content: styleBible,
        });
      }
    }

    // Character mapping info
    const characterInfo = Array.from(characterMap.entries()).map(([id, char], index) => ({
      elementIndex: index + 1,
      characterId: id,
      characterName: char.name,
      hasReferenceImages: (char.reference_images?.length || 0) > 0,
      hasFalVoice: !!(char.data as Record<string, unknown>)?.fal_voice_id,
    }));

    return Response.json({
      fullPrompt,
      parts,
      characters: characterInfo,
      hasCinematicMode: !!(segments && segments.length > 0),
      hasStyleBible: !!styleBible,
    });

  } catch (error) {
    console.error('[PromptPreview] Error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
