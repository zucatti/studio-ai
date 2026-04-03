/**
 * Editly Video Assembly Module
 *
 * Wraps the editly library for declarative JSON-to-video assembly
 */

import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import type { EditlySpec, AssemblyInput } from './types.js';
import { buildEditlySpec, validateSequences, calculateTotalDuration } from './spec-builder.js';

export * from './types.js';
export * from './transitions.js';
export * from './spec-builder.js';

// Lazy-load editly to avoid native module errors on startup
async function getEditly() {
  const editlyModule = await import('editly');
  // Handle both ESM default export and named export
  return (editlyModule as unknown as { default?: typeof editlyModule }).default || editlyModule;
}

/**
 * Assemble video using Editly
 *
 * @param input Assembly input with sequences and optional music
 * @returns Path to the output video file
 */
export async function assembleWithEditly(input: AssemblyInput): Promise<string> {
  // Validate input
  const validationError = validateSequences(input.sequences);
  if (validationError) {
    throw new Error(validationError);
  }

  // Build the Editly spec
  const spec = buildEditlySpec(input);

  console.log('[Editly] Starting assembly...');
  console.log('[Editly] Sequences:', input.sequences.length);
  console.log('[Editly] Total duration:', calculateTotalDuration(input.sequences).toFixed(2), 's');
  console.log('[Editly] Output:', spec.outPath);

  // Log spec for debugging
  console.log('[Editly] Spec:', JSON.stringify(spec, null, 2));

  try {
    // Lazy-load editly and run - cast to callable function
    const editly = await getEditly();
    const editlyFn = editly as unknown as (config: EditlySpec) => Promise<void>;
    await editlyFn(spec);

    console.log('[Editly] Assembly completed successfully');
    return spec.outPath;
  } catch (error) {
    console.error('[Editly] Assembly failed:', error);
    throw error;
  }
}

/**
 * Save spec to JSON file for debugging or manual execution
 */
export async function saveEditlySpec(spec: EditlySpec, outputPath: string): Promise<void> {
  await writeFile(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
  console.log('[Editly] Spec saved to:', outputPath);
}

/**
 * Create a temporary directory for Editly work files
 */
export async function createTempDir(jobId: string): Promise<string> {
  const tempDir = join(tmpdir(), `editly-${jobId}`);
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(tempDir: string, files: string[]): Promise<void> {
  for (const file of files) {
    try {
      await unlink(file);
    } catch {
      // Ignore cleanup errors
    }
  }

  try {
    const { rmdir } = await import('fs/promises');
    await rmdir(tempDir);
  } catch {
    // Ignore cleanup errors
  }
}
