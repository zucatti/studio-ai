/**
 * Editly Spec Builder
 *
 * Converts our Sequence/Plan structure to Editly JSON spec
 */

import type {
  EditlySpec,
  EditlyClip,
  EditlyVideoLayer,
  EditlyAudioTrack,
  AssemblyInput,
  SequenceInput,
} from './types.js';
import { getTransitionStrategy, mapTransition } from './transitions.js';

/**
 * Build an Editly spec from sequences and optional music
 */
export function buildEditlySpec(input: AssemblyInput): EditlySpec {
  const { sequences, music, outputPath, width = 1920, height = 1080, fps = 30 } = input;

  const clips: EditlyClip[] = [];

  // Process each sequence
  for (let seqIdx = 0; seqIdx < sequences.length; seqIdx++) {
    const sequence = sequences[seqIdx];
    const isFirstSequence = seqIdx === 0;
    const isLastSequence = seqIdx === sequences.length - 1;
    const nextSequence = !isLastSequence ? sequences[seqIdx + 1] : null;

    // Process each clip within the sequence (concatenated without transitions)
    for (let clipIdx = 0; clipIdx < sequence.clips.length; clipIdx++) {
      const clip = sequence.clips[clipIdx];
      const isFirstClipInSequence = clipIdx === 0;
      const isLastClipInSequence = clipIdx === sequence.clips.length - 1;

      const editlyClip: EditlyClip = {
        duration: clip.duration,
        layers: [
          {
            type: 'video',
            path: clip.videoUrl,
            resizeMode: 'cover',
          } as EditlyVideoLayer,
        ],
      };

      // Add transition for first clip of sequence (transition_in)
      if (isFirstClipInSequence && !isFirstSequence && sequence.transition_in) {
        // Get the previous sequence's transition_out for combined strategy
        const prevSequence = sequences[seqIdx - 1];
        const { transition, duration } = getTransitionStrategy(
          prevSequence.transition_out,
          sequence.transition_in,
          prevSequence.transition_duration,
          sequence.transition_duration
        );

        editlyClip.transition = {
          name: transition,
          duration,
        };
      }

      // Add transition for last clip of sequence (transition_out to next sequence)
      if (isLastClipInSequence && !isLastSequence && sequence.transition_out) {
        // This will be handled by the next sequence's first clip
        // But if next sequence has no transition_in, we add it here
        if (!nextSequence?.transition_in) {
          editlyClip.transition = {
            name: mapTransition(sequence.transition_out) || 'fade',
            duration: sequence.transition_duration,
          };
        }
      }

      clips.push(editlyClip);
    }
  }

  // Build the spec
  const spec: EditlySpec = {
    outPath: outputPath,
    width,
    height,
    fps,
    clips,
    keepSourceAudio: true,
    allowRemoteRequests: true,
    verbose: true,
  };

  // Add background music if provided
  if (music) {
    spec.audioTracks = [
      {
        path: music.audioUrl,
        mixVolume: buildVolumeRamp(music.volume, music.fadeIn, music.fadeOut),
      },
    ];
    spec.loopAudio = false;
    // Lower the clip audio when music is playing
    spec.clipsAudioVolume = 1.0;
  }

  return spec;
}

/**
 * Build a volume ramp string for fade in/out
 *
 * Editly supports volume as a string expression or array [start, end]
 * For more complex fades, we'd need to use FFmpeg filters directly
 */
function buildVolumeRamp(
  baseVolume: number,
  fadeIn: number,
  fadeOut: number
): number | string | [number, number] {
  // For simple cases, just return the base volume
  // TODO: Implement proper fade in/out with FFmpeg filters
  // The current Editly API doesn't support complex volume envelopes
  // We'll handle this in the processor with FFmpeg post-processing
  return baseVolume;
}

/**
 * Calculate total duration from sequences
 */
export function calculateTotalDuration(sequences: SequenceInput[]): number {
  let total = 0;

  for (const sequence of sequences) {
    for (const clip of sequence.clips) {
      total += clip.duration;
    }
  }

  return total;
}

/**
 * Validate sequences have at least one clip
 */
export function validateSequences(sequences: SequenceInput[]): string | null {
  if (sequences.length === 0) {
    return 'No sequences provided';
  }

  for (const sequence of sequences) {
    if (sequence.clips.length === 0) {
      return `Sequence "${sequence.title || sequence.id}" has no clips`;
    }
  }

  return null;
}
