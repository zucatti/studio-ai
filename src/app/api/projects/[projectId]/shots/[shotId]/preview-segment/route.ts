/**
 * Preview Segment API Route
 *
 * Generates a quick, cheap preview of a single segment using Grok 480p.
 * Simplified prompt without timeline complexity - just visual description + refs.
 */

import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';
import { enqueueVideoGen, type VideoGenJobData } from '@/lib/bullmq';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import type { GlobalAsset } from '@/types/database';
import type { Segment, SegmentElement, CinematicHeaderConfig } from '@/types/cinematic';

interface RouteParams {
  params: Promise<{ projectId: string; shotId: string }>;
}

// Framing labels for shot type
const SHOT_FRAMING_LABELS: Record<string, string> = {
  extreme_wide: 'EXTREME WIDE',
  wide: 'WIDE',
  medium_wide: 'MEDIUM WIDE',
  medium: 'MEDIUM',
  medium_close_up: 'MEDIUM CLOSE UP',
  close_up: 'CLOSE UP',
  extreme_close_up: 'EXTREME CLOSE UP',
};

// Camera movement labels
const CAMERA_MOVEMENT_LABELS: Record<string, string> = {
  static: 'static camera',
  slow_dolly_in: 'slow dolly in',
  slow_dolly_out: 'slow dolly out',
  dolly_left: 'dolly left',
  dolly_right: 'dolly right',
  pan_left: 'pan left',
  pan_right: 'pan right',
  tilt_up: 'tilt up',
  tilt_down: 'tilt down',
  crane_up: 'crane up',
  crane_down: 'crane down',
  orbit_cw: 'orbit clockwise',
  orbit_ccw: 'orbit counter-clockwise',
  handheld: 'handheld camera',
  zoom_in: 'zoom in',
  zoom_out: 'zoom out',
};

// Scene setting labels
const SCENE_SETTING_LABELS: Record<string, string> = {
  int: 'INT.',
  ext: 'EXT.',
  int_ext: 'INT./EXT.',
};

// Build a cinematic prompt for preview
// Grok Imagine supports native audio/lip-sync from prompt text
function buildPreviewPrompt(
  segment: Segment,
  characters: Map<string, GlobalAsset>,
  cinematicHeader?: CinematicHeaderConfig | null,
  locationName?: string,
  sceneSetting: 'int' | 'ext' | 'int_ext' = 'ext',
): string {
  const lines: string[] = [];

  // === CINEMATIC STYLE ===
  lines.push('=== CINEMATIC STYLE ===');

  // Location header (slugline format: INT. LOCATION - TIME OF DAY)
  if (locationName) {
    const setting = SCENE_SETTING_LABELS[sceneSetting] || 'EXT.';
    const timeOfDay = cinematicHeader?.time_of_day?.replace(/_/g, ' ') || 'DAY';
    lines.push(`${setting} ${locationName.toUpperCase()} - ${timeOfDay.toUpperCase()}`);
  }

  // Build style description from cinematic header
  if (cinematicHeader) {
    const styleParts: string[] = [];

    // Cinematic style preset (e.g., "film_noir", "wes_anderson")
    if (cinematicHeader.cinematic_style && cinematicHeader.cinematic_style !== 'custom') {
      const styleLabel = cinematicHeader.cinematic_style.replace(/_/g, ' ');
      styleParts.push(`STYLE: ${styleLabel}`);
    }

    // Lighting - extract from object
    if (cinematicHeader.lighting && typeof cinematicHeader.lighting === 'object') {
      const { type, style } = cinematicHeader.lighting;
      const lightingDesc = [type, style].filter(Boolean).join(' ');
      if (lightingDesc) {
        styleParts.push(`LIGHTING: ${lightingDesc} lighting`);
      }
    }

    // Camera style
    const cameraMove = segment.camera_movement;
    if (cameraMove && cameraMove !== 'static') {
      styleParts.push(`CAMERA: ${CAMERA_MOVEMENT_LABELS[cameraMove] || cameraMove}`);
    }

    // Color grade - extract style from object
    if (cinematicHeader.color_grade && typeof cinematicHeader.color_grade === 'object') {
      const colorStyle = cinematicHeader.color_grade.style;
      if (colorStyle) {
        const colorLabel = colorStyle.replace(/_/g, ' ');
        styleParts.push(`COLOR GRADE: ${colorLabel}`);
      }
    }

    // Custom style bible (for custom cinematic_style)
    if (cinematicHeader.custom_style_bible) {
      styleParts.push(`STYLE NOTES: ${cinematicHeader.custom_style_bible}`);
    }

    if (styleParts.length > 0) {
      lines.push(styleParts.join('. '));
    }
  }

  // Scene description
  if (segment.description) {
    lines.push(segment.description);
  }

  lines.push('');

  // === CHARACTER LEGEND ===
  // Grok uses @Image1, @Image2 syntax to reference images from reference_image_urls
  if (characters.size > 0) {
    lines.push('=== CHARACTER LEGEND ===');

    let imageIndex = 1;
    for (const char of characters.values()) {
      const charData = char.data as Record<string, unknown> | null;
      const visualDesc = (charData?.visual_description as string) || char.name;
      const hasImages = char.reference_images && char.reference_images.length > 0;

      if (hasImages) {
        // Use @Image1 syntax for Grok to reference the character image
        lines.push(`@Image${imageIndex} = ${char.name}: ${visualDesc}`);
        imageIndex++;
      } else {
        // Figurant - no reference image
        lines.push(`- ${char.name}: ${visualDesc}`);
      }
    }
    lines.push('');
  }

  // === SHOT ===
  lines.push('=== SHOT ===');

  // Shot type header
  const framing = SHOT_FRAMING_LABELS[segment.shot_framing || 'medium'] || 'MEDIUM';
  const camera = segment.camera_movement && segment.camera_movement !== 'static'
    ? `. Camera: ${CAMERA_MOVEMENT_LABELS[segment.camera_movement]}`
    : '';
  lines.push(`${framing}${camera}`);

  // Process elements (actions, dialogues, etc.)
  // Grok generates lip-sync automatically when dialogue is in the prompt
  const elements = segment.elements || segment.beats || [];
  for (const el of elements) {
    if (!el.content) continue;

    // Use English content if available
    const content = el.content_en || el.content;
    const charName = el.character_name || '';

    switch (el.type) {
      case 'dialogue': {
        const tone = el.tone && el.tone !== 'neutral' ? ` (${el.tone} tone)` : '';
        const isOffScreen = el.presence === 'off';

        if (isOffScreen) {
          // Off-screen dialogue: use Narration/Voice-over format (no lip-sync)
          if (charName) {
            lines.push(`[Narration/Voice-over: ${charName}${tone}: "${content}"]`);
          } else {
            lines.push(`[Narration/Voice-over${tone}: "${content}"]`);
          }
        } else {
          // On-screen dialogue: triggers lip-sync
          if (charName) {
            lines.push(`[Dialogue lipsync: ${charName} says${tone}: "${content}"]`);
          } else {
            lines.push(`[Dialogue lipsync: Says${tone}: "${content}"]`);
          }
        }
        break;
      }
      case 'action':
        if (charName) {
          lines.push(`[Action: ${charName} ${content}]`);
        } else {
          lines.push(`[Action: ${content}]`);
        }
        break;
      case 'sfx':
        // Grok generates ambient sounds from prompt
        lines.push(`[SFX: ${content}]`);
        break;
      case 'physics':
        lines.push(`[Physics: ${content}]`);
        break;
      case 'lighting':
        lines.push(`[Lighting: ${content}]`);
        break;
      default:
        lines.push(content);
    }
  }

  // === STYLE BIBLE ===
  if (cinematicHeader?.custom_style_bible) {
    lines.push('');
    lines.push('=== STYLE BIBLE ===');
    lines.push(cinematicHeader.custom_style_bible);
  }

  return lines.join('\n');
}

// Extract character IDs from segment elements
function extractCharacterIds(segment: Segment): string[] {
  const ids = new Set<string>();
  const elements = segment.elements || segment.beats || [];

  for (const el of elements) {
    if (el.character_id) {
      ids.add(el.character_id);
    }
  }

  // Legacy dialogue field
  if (segment.dialogue?.character_id) {
    ids.add(segment.dialogue.character_id);
  }

  return Array.from(ids);
}

/**
 * POST - Queue a preview generation for a single segment
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await auth0.getSession();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId, shotId } = await params;
    const body = await request.json();
    const { segment } = body as { segment: Segment };

    if (!segment) {
      return Response.json({ error: 'Segment required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, aspect_ratio')
      .eq('id', projectId)
      .eq('user_id', session.user.sub)
      .single();

    if (!project) {
      return Response.json(
        { error: 'Project not found', details: projectError },
        { status: 404 }
      );
    }

    // Get shot data for first frame and cinematic header
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select('id, shot_number, first_frame_url, storyboard_image_url, cinematic_header, sequence_id')
      .eq('id', shotId)
      .single();

    if (!shot) {
      return Response.json(
        { error: 'Shot not found', details: shotError },
        { status: 404 }
      );
    }

    // Get cinematic header (merge sequence + shot)
    let cinematicHeader: CinematicHeaderConfig | null = null;

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

    // Merge shot-level overrides
    if (shot.cinematic_header) {
      const shotHeader = shot.cinematic_header as CinematicHeaderConfig;
      cinematicHeader = cinematicHeader
        ? { ...cinematicHeader, ...shotHeader }
        : shotHeader;
    }

    // Map aspect ratio
    const aspectRatioMap: Record<string, '9:16' | '16:9' | '1:1'> = {
      '9:16': '9:16',
      '16:9': '16:9',
      '1:1': '1:1',
      '4:5': '9:16',
      '2:3': '9:16',
      '21:9': '16:9',
    };
    const aspectRatio = aspectRatioMap[project.aspect_ratio] || '16:9';

    // Calculate segment duration
    const segmentDuration = Math.max(2, Math.min(10, segment.end_time - segment.start_time));

    // Get characters referenced in segment
    const characterIds = extractCharacterIds(segment);
    const characterMap = new Map<string, GlobalAsset>();

    if (characterIds.length > 0) {
      // Get global characters
      const { data: projectAssets } = await supabase
        .from('project_assets')
        .select(`global_asset:global_assets (*)`)
        .eq('project_id', projectId);

      const globalCharacters = (projectAssets || [])
        .map(pa => pa.global_asset as unknown as GlobalAsset)
        .filter(a => a && a.asset_type === 'character');

      // Get generic characters
      const { data: projectGenericAssets } = await supabase
        .from('project_generic_assets')
        .select('*')
        .eq('project_id', projectId);

      const genericCharacters = (projectGenericAssets || [])
        .map(pga => {
          const genericChar = GENERIC_CHARACTERS.find(g => g.id === pga.generic_asset_id);
          if (!genericChar) return null;

          const localOverrides = (pga.local_overrides || {}) as {
            reference_images_metadata?: Array<{ url: string }>;
            visual_description?: string;
            character_matrix_url?: string;
          };
          const referenceImages = (localOverrides.reference_images_metadata || []).map(img => img.url);

          return {
            id: pga.id,
            name: pga.name_override || genericChar.name,
            asset_type: 'character' as const,
            reference_images: referenceImages,
            data: {
              visual_description: localOverrides.visual_description || genericChar.description,
              character_matrix_url: localOverrides.character_matrix_url,
            },
          } as unknown as GlobalAsset;
        })
        .filter((a): a is GlobalAsset => a !== null);

      // Build character map
      const allCharacters = [...globalCharacters, ...genericCharacters];
      for (const charId of characterIds) {
        const char = allCharacters.find(c => c.id === charId);
        if (char) {
          characterMap.set(char.id, char);
        }
      }
    }

    // Get location name from cinematic header
    let locationName: string | undefined;
    let sceneSetting: 'int' | 'ext' | 'int_ext' = 'ext';

    if (cinematicHeader?.scene) {
      sceneSetting = cinematicHeader.scene.setting || 'ext';

      if (cinematicHeader.scene.location_custom) {
        locationName = cinematicHeader.scene.location_custom;
      } else if (cinematicHeader.scene.location_id) {
        // Fetch location name from Bible
        const { data: location } = await supabase
          .from('locations')
          .select('name')
          .eq('id', cinematicHeader.scene.location_id)
          .single();
        locationName = location?.name;
      }
    }

    // Build preview prompt with full cinematic context
    const prompt = buildPreviewPrompt(segment, characterMap, cinematicHeader, locationName, sceneSetting);
    console.log('[PreviewSegment] Prompt:\n', prompt);

    // Build reference images for Grok (up to 7)
    // IMPORTANT: @Image1, @Image2 in prompt maps to reference_image_urls[0], [1], etc.
    // So character images must come FIRST, then first_frame at the end
    const referenceImageUrls: string[] = [];

    // Add character references FIRST (prefer matrix over individual images)
    // These will be @Image1, @Image2, etc. in the prompt
    for (const char of characterMap.values()) {
      const charData = char.data as Record<string, unknown> | null;
      const matrixUrl = charData?.character_matrix_url as string | undefined;

      if (matrixUrl) {
        // Use matrix: 1 slot instead of 3-4
        if (referenceImageUrls.length < 7) {
          referenceImageUrls.push(matrixUrl);
          console.log(`[PreviewSegment] @Image${referenceImageUrls.length} = matrix for ${char.name}`);
        }
      } else {
        // Fallback to individual reference images
        const refImages = char.reference_images || [];
        for (const img of refImages) {
          if (referenceImageUrls.length < 7) {
            referenceImageUrls.push(img);
          }
        }
        if (refImages.length > 0) {
          console.log(`[PreviewSegment] Added ${refImages.length} individual images for ${char.name}`);
        }
      }
    }

    // Add first frame AFTER character images (as additional context, not @Image referenced)
    const firstFrameUrl = shot.first_frame_url || shot.storyboard_image_url;
    if (firstFrameUrl && referenceImageUrls.length < 7) {
      referenceImageUrls.push(firstFrameUrl);
      console.log('[PreviewSegment] Added first frame as additional context');
    }

    console.log('[PreviewSegment] Reference images:', referenceImageUrls.length);

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: session.user.sub,
        asset_type: 'shot',
        asset_name: `Preview Segment`,
        job_type: 'video',
        job_subtype: 'grok-480p',
        status: 'queued',
        progress: 0,
        message: 'Preview en file d\'attente...',
        fal_endpoint: 'fal',
        input_data: {
          projectId,
          shotId,
          segmentId: segment.id,
          isPreview: true,
          videoModel: 'grok-480p',
          duration: segmentDuration,
          aspectRatio,
          prompt,
        },
        queued_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (jobError || !job) {
      console.error('[PreviewSegment] Failed to create job:', jobError);
      return Response.json(
        { error: 'Failed to create job', details: jobError },
        { status: 500 }
      );
    }

    // Build cinematic elements for Grok reference-to-video
    // With @Image1 syntax in prompt, Grok should understand matrix as character reference
    const cinematicElements = Array.from(characterMap.values())
      .slice(0, 7)
      .filter(char => {
        const charData = char.data as Record<string, unknown> | null;
        const hasMatrix = !!charData?.character_matrix_url;
        const hasRefImages = char.reference_images && char.reference_images.length > 0;
        return hasMatrix || hasRefImages;
      })
      .map(char => {
        const charData = char.data as Record<string, unknown> | null;
        const matrixUrl = charData?.character_matrix_url as string | undefined;

        if (matrixUrl) {
          // Matrix: single image with all views
          return {
            characterId: char.id,
            characterName: char.name,
            frontalImageUrl: matrixUrl,
            referenceImageUrls: [],
          };
        } else {
          // Individual reference images
          return {
            characterId: char.id,
            characterName: char.name,
            frontalImageUrl: char.reference_images![0],
            referenceImageUrls: char.reference_images!.slice(1),
          };
        }
      });

    // Build job data
    const jobData: Omit<VideoGenJobData, 'type'> = {
      userId: session.user.sub,
      jobId: job.id,
      createdAt: new Date().toISOString(),
      projectId,
      shotId,
      shotNumber: shot.shot_number || 1,
      model: 'grok-480p',
      provider: 'fal',
      duration: segmentDuration,
      aspectRatio: aspectRatio as VideoGenJobData['aspectRatio'],
      prompt,
      firstFrameUrl: shot.first_frame_url || shot.storyboard_image_url || undefined,
      characterReferenceImages: referenceImageUrls,
      hasDialogue: false,
      isCinematicMode: cinematicElements.length > 0,
      cinematicElements: cinematicElements.length > 0 ? cinematicElements : undefined,
      // Preview mode: don't update shot, just return video URL
      isPreview: true,
    };

    // Enqueue the job
    try {
      console.log('[PreviewSegment] Enqueueing job:', job.id);
      await enqueueVideoGen(jobData);
    } catch (queueError) {
      console.error('[PreviewSegment] Failed to enqueue:', queueError);

      await supabase
        .from('generation_jobs')
        .update({
          status: 'failed',
          error_message: queueError instanceof Error ? queueError.message : 'Failed to enqueue',
        })
        .eq('id', job.id);

      return Response.json(
        { error: 'Failed to enqueue job', details: queueError instanceof Error ? queueError.message : 'Unknown' },
        { status: 500 }
      );
    }

    // Return job ID for polling
    return Response.json({
      jobId: job.id,
      status: 'queued',
      message: 'Preview queued',
      duration: segmentDuration,
      model: 'grok-480p',
    });

  } catch (error) {
    console.error('[PreviewSegment] Unexpected error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
