#!/usr/bin/env bun
/**
 * Camera Movements Preview Generator
 *
 * Generates video previews for all camera movements using fal.ai (Kling 3),
 * then converts them to GIFs using ffmpeg.
 *
 * Usage:
 *   bun run scripts/generate-camera-movements.ts --image ./reference.jpg
 *   bun run scripts/generate-camera-movements.ts --image ./reference.jpg --skip-existing
 *   bun run scripts/generate-camera-movements.ts --image ./reference.jpg --only dolly_zoom,tilt_up
 *
 * Output:
 *   public/camera-movements/
 *   ├── {movement}.mp4      - Original video (trimmed)
 *   ├── {movement}.gif      - Converted GIF
 *   ├── {movement}.jpg      - Reference frame
 *   └── manifest.json       - Generation manifest
 */

import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// CAMERA MOVEMENTS DEFINITIONS (copied from types/shot.ts for standalone use)
// ============================================================================

interface CameraMovementDefinition {
  value: string;
  label: string;
  category: string;
  description: string;
  promptTemplate: string;
}

const CAMERA_MOVEMENTS: CameraMovementDefinition[] = [
  // Static - skip this one
  {
    value: 'static',
    label: 'Statique',
    category: 'other',
    description: 'Caméra fixe, sans mouvement.',
    promptTemplate: 'Static camera shot, locked off, no movement.',
  },

  // === DOLLY MOVEMENTS ===
  {
    value: 'slow_dolly_in',
    label: 'Dolly In Lent',
    category: 'dolly',
    description: 'La caméra avance lentement vers le sujet.',
    promptTemplate: 'Camera slowly pushes forward, moving closer to {subject}. The camera approaches the subject, getting nearer with each frame. Push in, move forward, approach.',
  },
  {
    value: 'slow_dolly_out',
    label: 'Dolly Out Lent',
    category: 'dolly',
    description: 'La caméra recule doucement, révélant l\'environnement.',
    promptTemplate: 'Camera slowly pulls backward, moving away from {subject}. The camera retreats, getting farther with each frame, revealing more of the environment. Pull back, move backward, retreat.',
  },
  {
    value: 'fast_dolly_in',
    label: 'Dolly Rush',
    category: 'dolly',
    description: 'Mouvement rapide vers le sujet.',
    promptTemplate: 'Camera rushes forward quickly toward {subject}. Fast push in, rapid approach, camera races closer to the subject.',
  },
  {
    value: 'dolly_zoom',
    label: 'Dolly Zoom (Vertigo)',
    category: 'dolly',
    description: 'Effet "Vertigo" - la caméra recule pendant que le zoom avance.',
    promptTemplate: 'Dolly zoom (zolly): the camera moves backward while zooming in, violently warping the background. {subject} stays the same size despite extreme perspective distortion.',
  },

  // === ZOOM MOVEMENTS ===
  {
    value: 'macro_zoom',
    label: 'Macro Zoom',
    category: 'zoom',
    description: 'Zoom extrême vers le détail microscopique.',
    promptTemplate: 'Extreme zoom in, camera lens zooms closer and closer into extreme detail, macro close-up.',
  },
  {
    value: 'hyper_zoom',
    label: 'Hyper Zoom Cosmique',
    category: 'zoom',
    description: 'Zoom ininterrompu depuis l\'espace jusqu\'au niveau de la rue.',
    promptTemplate: 'Continuous zoom in from far away to close up, unbroken zoom getting closer and closer to {subject}.',
  },
  {
    value: 'smooth_zoom_in',
    label: 'Zoom In Fluide',
    category: 'zoom',
    description: 'Zoom optique fluide vers le sujet.',
    promptTemplate: 'Camera lens zooms in, {subject} grows larger in frame, zoom closer, magnify, get nearer optically.',
  },
  {
    value: 'smooth_zoom_out',
    label: 'Zoom Out Fluide',
    category: 'zoom',
    description: 'Zoom optique fluide s\'éloignant.',
    promptTemplate: 'Camera lens zooms out, {subject} grows smaller in frame, zoom wider, reveal more environment, pull back optically.',
  },
  {
    value: 'snap_zoom',
    label: 'Snap Zoom (Crash)',
    category: 'zoom',
    description: 'Zoom instantané et agressif vers les yeux du sujet.',
    promptTemplate: 'Snap zoom straight into {subject}\'s eyes mid-realization, jarring high-impact framing shift.',
  },

  // === SPECIAL SHOTS ===
  {
    value: 'over_the_shoulder',
    label: 'Par-dessus l\'épaule (OTS)',
    category: 'special',
    description: 'Caméra derrière l\'épaule d\'un personnage secondaire.',
    promptTemplate: 'Over-the-shoulder shot from a blurred figure\'s shoulder, framing {subject}, shallow depth of field.',
  },
  {
    value: 'fisheye',
    label: 'Fisheye / Judas',
    category: 'special',
    description: 'Objectif ultra-grand angle avec distorsion prononcée.',
    promptTemplate: 'Fisheye lens view of {subject}, walls curving unnaturally toward the edges, security-camera mood.',
  },
  {
    value: 'reveal_wipe',
    label: 'Révélation Latérale',
    category: 'special',
    description: 'Le cadre commence obscurci et glisse pour révéler le sujet.',
    promptTemplate: 'Cinematic lateral wipe reveal from behind a foreground element, sliding sideways to reveal {subject}.',
  },
  {
    value: 'fly_through',
    label: 'Vol À Travers',
    category: 'special',
    description: 'La caméra traverse une ouverture étroite pour révéler le sujet.',
    promptTemplate: 'Cinematic fly-through as the camera passes through a narrow opening, revealing {subject} beyond.',
  },
  {
    value: 'reveal_blur',
    label: 'Révélation du Flou',
    category: 'special',
    description: 'Plan entièrement flou qui fait progressivement le point sur le sujet.',
    promptTemplate: 'Focus-pull reveal from full bokeh to sharp focus on {subject}, circular bokeh lights glowing.',
  },
  {
    value: 'rack_focus',
    label: 'Rack Focus',
    category: 'special',
    description: 'Transfert de mise au point de l\'avant-plan vers l\'arrière-plan.',
    promptTemplate: 'Rack focus shot: foreground in sharp focus with soft background, then focus shifts as foreground softens and background snaps sharp on {subject}.',
  },

  // === TILT MOVEMENTS ===
  {
    value: 'tilt_up',
    label: 'Tilt Haut',
    category: 'tilt',
    description: 'La caméra pivote vers le haut, des pieds vers le visage.',
    promptTemplate: 'Camera tilts upward, panning up vertically from bottom to top, revealing {subject} from feet to face, vertical pan up.',
  },
  {
    value: 'tilt_down',
    label: 'Tilt Bas',
    category: 'tilt',
    description: 'La caméra pivote vers le bas, du visage vers les pieds.',
    promptTemplate: 'Camera tilts downward, panning down vertically from top to bottom, revealing {subject} from face to feet, vertical pan down.',
  },

  // === TRUCK MOVEMENTS ===
  {
    value: 'truck_left',
    label: 'Travelling Gauche',
    category: 'truck',
    description: 'Caméra glisse vers la gauche.',
    promptTemplate: 'Camera moves left, sliding sideways to the left, lateral tracking left, {subject} shifts right in frame.',
  },
  {
    value: 'truck_right',
    label: 'Travelling Droit',
    category: 'truck',
    description: 'Caméra glisse vers la droite.',
    promptTemplate: 'Camera moves right, sliding sideways to the right, lateral tracking right, {subject} shifts left in frame.',
  },

  // === ORBIT MOVEMENTS ===
  {
    value: 'orbit_180',
    label: 'Orbite 180°',
    category: 'orbit',
    description: 'La caméra tourne autour du sujet (demi-cercle).',
    promptTemplate: 'Camera orbits around {subject}, circling halfway around, rotating 180 degrees, arc movement around the subject.',
  },
  {
    value: 'orbit_360_fast',
    label: 'Orbite 360° Rapide',
    category: 'orbit',
    description: 'Rotation rapide complète autour du sujet.',
    promptTemplate: 'Camera spins rapidly around {subject}, fast 360 degree rotation, spinning orbit, whirling around.',
  },
  {
    value: 'slow_arc',
    label: 'Arc Cinématique',
    category: 'orbit',
    description: 'La caméra glisse en arc autour du sujet.',
    promptTemplate: 'Camera slowly arcs around {subject}, gentle curved movement, smooth orbit, circling gracefully.',
  },

  // === PEDESTAL MOVEMENTS ===
  {
    value: 'pedestal_down',
    label: 'Pedestal Bas',
    category: 'pedestal',
    description: 'La caméra descend verticalement du niveau des yeux à la taille.',
    promptTemplate: 'Pedestal down on {subject}, camera lowering smoothly from eye level to waist level.',
  },
  {
    value: 'pedestal_up',
    label: 'Pedestal Haut',
    category: 'pedestal',
    description: 'La caméra monte verticalement de la taille au niveau des yeux.',
    promptTemplate: 'Pedestal up on {subject} rising emotionally as the environment opens up.',
  },

  // === CRANE MOVEMENTS ===
  {
    value: 'crane_up',
    label: 'Grue Montante',
    category: 'crane',
    description: 'La caméra s\'élève vers le haut.',
    promptTemplate: 'Camera rises upward, ascending, moving up vertically, crane shot going up, elevating above {subject}, bird\'s eye view.',
  },
  {
    value: 'crane_down',
    label: 'Grue Descendante',
    category: 'crane',
    description: 'La caméra descend vers le bas.',
    promptTemplate: 'Camera descends downward, lowering, moving down vertically, crane shot going down toward {subject}, landing.',
  },

  // === DRONE MOVEMENTS ===
  {
    value: 'drone_flyover',
    label: 'Survol Drone',
    category: 'drone',
    description: 'Survol haute altitude, mouvement fluide au-dessus du sujet.',
    promptTemplate: 'High-altitude drone flyover of {subject}, gliding smoothly above and sweeping across the landscape.',
  },
  {
    value: 'drone_reveal',
    label: 'Révélation Drone',
    category: 'drone',
    description: 'Le drone s\'élève derrière un obstacle puis révèle le sujet et l\'horizon.',
    promptTemplate: 'Epic drone reveal rising from behind an obstacle to expose {subject} and the horizon.',
  },
  {
    value: 'drone_orbit',
    label: 'Orbite Drone',
    category: 'drone',
    description: 'Cercle aérien continu autour du sujet.',
    promptTemplate: 'Wide drone orbit circling {subject}, maintaining distance to showcase environmental magnitude.',
  },
  {
    value: 'drone_topdown',
    label: 'Vue du Ciel (God\'s Eye)',
    category: 'drone',
    description: 'Caméra directement au-dessus à 90°, rotation lente.',
    promptTemplate: 'Top-down rotating drone shot of {subject} centered below, shifting light.',
  },
  {
    value: 'fpv_dive',
    label: 'Plongée FPV',
    category: 'drone',
    description: 'Descente rapide et agressive style FPV.',
    promptTemplate: 'Aggressive FPV drone dive racing down tall architecture toward {subject} at the base.',
  },

  // === TRACKING MOVEMENTS ===
  {
    value: 'tracking_backward',
    label: 'Suivi Arrière',
    category: 'tracking',
    description: 'La caméra recule devant le sujet qui avance.',
    promptTemplate: 'Camera moves backward while facing {subject} who walks forward, leading shot, camera retreats as subject approaches.',
  },
  {
    value: 'tracking_forward',
    label: 'Suivi Avant',
    category: 'tracking',
    description: 'La caméra suit le sujet de dos.',
    promptTemplate: 'Camera follows behind {subject} who walks away, following shot, camera moves forward behind the subject.',
  },
  {
    value: 'tracking_side',
    label: 'Suivi Latéral',
    category: 'tracking',
    description: 'La caméra accompagne le sujet de profil.',
    promptTemplate: 'Camera moves sideways, tracking left to right parallel to {subject}, side tracking, lateral movement.',
  },
  {
    value: 'pov_walk',
    label: 'POV Marche',
    category: 'tracking',
    description: 'Vue à la première personne avec léger balancement de marche.',
    promptTemplate: 'First-person POV camera advances with gentle walking sway, {subject} implied by shadow or edge in frame.',
  },

  // === OTHER MOVEMENTS ===
  {
    value: 'handheld',
    label: 'Caméra Portée',
    category: 'other',
    description: 'Style documentaire avec micro-tremblements naturels.',
    promptTemplate: 'Handheld camera follows {subject} with natural micro-jitters and human breathing drift.',
  },
  {
    value: 'whip_pan',
    label: 'Whip Pan',
    category: 'other',
    description: 'Panoramique rapide avec flou de mouvement intense.',
    promptTemplate: 'Whip pan reveals {subject} across two connected spaces fused by streaking motion blur.',
  },
  {
    value: 'dutch_roll',
    label: 'Angle Hollandais (Roll)',
    category: 'other',
    description: 'Rotation de la caméra sur l\'axe Z, horizon en diagonale.',
    promptTemplate: 'Dutch angle with Z-axis roll frames {subject} in a tilted, unsettling composition.',
  },
];

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  outputDir: 'public/camera-movements',
  subject: 'a confident woman with flowing hair',
  videoDuration: '5', // seconds
  trimSeconds: 1, // seconds to trim from start
  gifFps: 15,
  gifWidth: 480,
};

// ============================================================================
// TYPES
// ============================================================================

interface ManifestEntry {
  movement: string;
  label: string;
  category: string;
  mp4: string;
  gif: string;
  jpg: string;
  generatedAt: string;
  status: 'success' | 'failed';
  error?: string;
}

interface Manifest {
  generatedAt: string;
  referenceImage: string;
  totalMovements: number;
  successCount: number;
  failedCount: number;
  movements: ManifestEntry[];
}

interface ProgressState {
  total: number;
  completed: number;
  current: string;
  startTime: number;
}

// ============================================================================
// UTILITIES
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors.dim}[${timestamp}]${colors.reset} ${colors[color]}${message}${colors.reset}`);
}

function logProgress(state: ProgressState) {
  const percent = Math.round((state.completed / state.total) * 100);
  const elapsed = Math.round((Date.now() - state.startTime) / 1000);
  const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));

  process.stdout.write(`\r${colors.cyan}[${bar}] ${percent}%${colors.reset} | ${state.completed}/${state.total} | ${colors.yellow}${state.current}${colors.reset} | ${elapsed}s elapsed    `);
}

function logNewLine() {
  console.log();
}

async function fileExists(filePath: string): Promise<boolean> {
  return existsSync(filePath);
}

// ============================================================================
// VIDEO GENERATION (fal.ai)
// ============================================================================

async function uploadToFalStorage(imageUrl: string, fal: any): Promise<string> {
  // If it's a file path, read and upload
  if (imageUrl.startsWith('/') || imageUrl.startsWith('./') || imageUrl.startsWith('..')) {
    log(`  Reading local file: ${imageUrl}`, 'dim');
    const fileBuffer = await readFile(imageUrl);
    const blob = new Blob([fileBuffer]);
    const uploadedUrl = await fal.storage.upload(blob);
    log(`  Uploaded to fal.ai: ${uploadedUrl}`, 'dim');
    return uploadedUrl;
  }

  // If it's already a URL, fetch and re-upload to ensure accessibility
  log(`  Fetching image: ${imageUrl}`, 'dim');
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  const uploadedUrl = await fal.storage.upload(blob);
  log(`  Uploaded to fal.ai: ${uploadedUrl}`, 'dim');
  return uploadedUrl;
}

async function generateVideo(
  movement: CameraMovementDefinition,
  referenceImageUrl: string,
  fal: any
): Promise<{ videoUrl: string }> {
  const prompt = movement.promptTemplate.replace(/\{subject\}/g, CONFIG.subject);
  const videoPrompt = `${prompt}, cinematic, professional cinematography, smooth camera movement`;

  log(`  Prompt: ${videoPrompt.substring(0, 80)}...`, 'dim');

  const result = await fal.subscribe('fal-ai/kling-video/v3/pro/image-to-video', {
    input: {
      prompt: videoPrompt,
      start_image_url: referenceImageUrl,
      duration: CONFIG.videoDuration,
      aspect_ratio: '16:9',
      generate_audio: false,
    } as any,
    logs: false,
    onQueueUpdate: (update: any) => {
      if (update.status === 'IN_PROGRESS') {
        process.stdout.write('.');
      }
    },
  });

  const videoUrl = result.data?.video?.url;
  if (!videoUrl) {
    throw new Error('No video URL in response');
  }

  return { videoUrl };
}

// ============================================================================
// VIDEO PROCESSING (ffmpeg)
// ============================================================================

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

async function trimVideo(inputPath: string, outputPath: string, trimSeconds: number): Promise<void> {
  const command = `ffmpeg -y -i "${inputPath}" -ss ${trimSeconds} -c:v libx264 -preset fast -crf 23 -c:a copy "${outputPath}" 2>/dev/null`;
  await execAsync(command, { timeout: 120000 });
}

async function convertToGif(inputPath: string, outputPath: string, fps: number, width: number): Promise<void> {
  // Generate palette for better GIF quality
  const paletteCmd = `ffmpeg -y -i "${inputPath}" -vf "fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=stats_mode=diff" -f image2 /tmp/palette.png 2>/dev/null`;
  await execAsync(paletteCmd, { timeout: 60000 });

  // Create GIF with palette
  const gifCmd = `ffmpeg -y -i "${inputPath}" -i /tmp/palette.png -lavfi "fps=${fps},scale=${width}:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${outputPath}" 2>/dev/null`;
  await execAsync(gifCmd, { timeout: 120000 });
}

async function extractFirstFrame(inputPath: string, outputPath: string): Promise<void> {
  const command = `ffmpeg -y -i "${inputPath}" -vframes 1 -q:v 2 "${outputPath}" 2>/dev/null`;
  await execAsync(command, { timeout: 30000 });
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processMovement(
  movement: CameraMovementDefinition,
  referenceImageUrl: string,
  outputDir: string,
  fal: any
): Promise<ManifestEntry> {
  const mp4Path = path.join(outputDir, `${movement.value}.mp4`);
  const gifPath = path.join(outputDir, `${movement.value}.gif`);
  const jpgPath = path.join(outputDir, `${movement.value}.jpg`);
  const tempPath = path.join(outputDir, `${movement.value}_temp.mp4`);

  try {
    // Step 1: Generate video
    log(`  [1/4] Generating video with Kling 3...`, 'blue');
    const { videoUrl } = await generateVideo(movement, referenceImageUrl, fal);
    logNewLine();

    // Step 2: Download video
    log(`  [2/4] Downloading video...`, 'blue');
    await downloadFile(videoUrl, tempPath);

    // Step 3: Trim and process video
    log(`  [3/4] Trimming ${CONFIG.trimSeconds}s from start...`, 'blue');
    await trimVideo(tempPath, mp4Path, CONFIG.trimSeconds);
    await unlink(tempPath).catch(() => {});

    // Step 4: Convert to GIF
    log(`  [4/4] Converting to GIF (${CONFIG.gifFps}fps, ${CONFIG.gifWidth}px)...`, 'blue');
    await convertToGif(mp4Path, gifPath, CONFIG.gifFps, CONFIG.gifWidth);

    // Extract first frame for thumbnail
    await extractFirstFrame(mp4Path, jpgPath);

    return {
      movement: movement.value,
      label: movement.label,
      category: movement.category,
      mp4: `/${CONFIG.outputDir}/${movement.value}.mp4`,
      gif: `/${CONFIG.outputDir}/${movement.value}.gif`,
      jpg: `/${CONFIG.outputDir}/${movement.value}.jpg`,
      generatedAt: new Date().toISOString(),
      status: 'success',
    };
  } catch (error: any) {
    // Cleanup temp file
    await unlink(tempPath).catch(() => {});

    return {
      movement: movement.value,
      label: movement.label,
      category: movement.category,
      mp4: '',
      gif: '',
      jpg: '',
      generatedAt: new Date().toISOString(),
      status: 'failed',
      error: error.message,
    };
  }
}

async function main() {
  console.log(`
${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════╗
║       CAMERA MOVEMENTS PREVIEW GENERATOR                    ║
║       Batch processing with fal.ai (Kling 3) + ffmpeg       ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

  // Parse arguments
  const args = process.argv.slice(2);
  const imageIndex = args.indexOf('--image');
  const skipExisting = args.includes('--skip-existing');
  const onlyIndex = args.indexOf('--only');

  if (imageIndex === -1 || !args[imageIndex + 1]) {
    console.error(`${colors.red}Error: --image argument is required${colors.reset}`);
    console.log(`
Usage:
  bun run scripts/generate-camera-movements.ts --image ./reference.jpg
  bun run scripts/generate-camera-movements.ts --image ./reference.jpg --skip-existing
  bun run scripts/generate-camera-movements.ts --image ./reference.jpg --only dolly_zoom,tilt_up
`);
    process.exit(1);
  }

  const referenceImagePath = args[imageIndex + 1];

  // Check if reference image exists
  if (!await fileExists(referenceImagePath)) {
    console.error(`${colors.red}Error: Reference image not found: ${referenceImagePath}${colors.reset}`);
    process.exit(1);
  }

  // Filter movements
  let movementsToProcess = CAMERA_MOVEMENTS.filter(m => m.value !== 'static');

  if (onlyIndex !== -1 && args[onlyIndex + 1]) {
    const onlyMovements = args[onlyIndex + 1].split(',');
    movementsToProcess = movementsToProcess.filter(m => onlyMovements.includes(m.value));
    log(`Filtering to ${movementsToProcess.length} specific movements: ${onlyMovements.join(', ')}`, 'yellow');
  }

  // Check for AI_FAL_KEY
  if (!process.env.AI_FAL_KEY) {
    console.error(`${colors.red}Error: AI_FAL_KEY environment variable is required${colors.reset}`);
    console.log(`Set it with: export AI_FAL_KEY=your_key`);
    process.exit(1);
  }

  // Initialize fal.ai
  const { fal } = await import('@fal-ai/client');
  fal.config({
    credentials: process.env.AI_FAL_KEY,
  });

  // Create output directory
  const outputDir = path.join(process.cwd(), CONFIG.outputDir);
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Load existing manifest if resuming
  const manifestPath = path.join(outputDir, 'manifest.json');
  let existingManifest: Manifest | null = null;
  if (skipExisting && existsSync(manifestPath)) {
    try {
      const data = await readFile(manifestPath, 'utf-8');
      existingManifest = JSON.parse(data);
      log(`Loaded existing manifest with ${existingManifest?.movements.length || 0} entries`, 'yellow');
    } catch {
      log('Could not load existing manifest, starting fresh', 'yellow');
    }
  }

  // Upload reference image to fal.ai
  log(`Uploading reference image to fal.ai storage...`, 'cyan');
  const uploadedImageUrl = await uploadToFalStorage(referenceImagePath, fal);
  log(`Reference image ready: ${uploadedImageUrl}`, 'green');
  logNewLine();

  // Process movements
  const results: ManifestEntry[] = existingManifest?.movements || [];
  const progress: ProgressState = {
    total: movementsToProcess.length,
    completed: 0,
    current: '',
    startTime: Date.now(),
  };

  log(`Starting batch generation of ${movementsToProcess.length} camera movements...`, 'bright');
  logNewLine();

  for (const movement of movementsToProcess) {
    progress.current = movement.label;
    logProgress(progress);
    logNewLine();

    // Skip if already processed successfully
    const existingEntry = results.find(r => r.movement === movement.value);
    if (skipExisting && existingEntry?.status === 'success') {
      log(`⏭️  Skipping ${movement.label} (already exists)`, 'yellow');
      progress.completed++;
      continue;
    }

    log(`🎬 Processing: ${movement.label} (${movement.category})`, 'magenta');

    const result = await processMovement(movement, uploadedImageUrl, outputDir, fal);

    // Update results
    const existingIndex = results.findIndex(r => r.movement === movement.value);
    if (existingIndex >= 0) {
      results[existingIndex] = result;
    } else {
      results.push(result);
    }

    if (result.status === 'success') {
      log(`✅ ${movement.label} completed`, 'green');
    } else {
      log(`❌ ${movement.label} failed: ${result.error}`, 'red');
    }

    progress.completed++;
    logNewLine();

    // Save manifest after each movement (for resume capability)
    const manifest: Manifest = {
      generatedAt: new Date().toISOString(),
      referenceImage: referenceImagePath,
      totalMovements: movementsToProcess.length,
      successCount: results.filter(r => r.status === 'success').length,
      failedCount: results.filter(r => r.status === 'failed').length,
      movements: results,
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  // Final summary
  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const totalTime = Math.round((Date.now() - progress.startTime) / 1000);

  console.log(`
${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════╗
║                    GENERATION COMPLETE                       ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

${colors.green}✅ Success: ${successCount}${colors.reset}
${colors.red}❌ Failed:  ${failedCount}${colors.reset}
⏱️  Total time: ${totalTime}s

📁 Output directory: ${outputDir}
📋 Manifest: ${manifestPath}
`);

  if (failedCount > 0) {
    console.log(`${colors.yellow}Failed movements:${colors.reset}`);
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`  - ${r.movement}: ${r.error}`);
    });
    console.log(`\n${colors.dim}Run with --skip-existing to retry failed movements${colors.reset}`);
  }
}

// Run
main().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
