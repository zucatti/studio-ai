import type { ProjectType, AspectRatio } from '@/types/database';

export interface ProjectTypeConfig {
  value: ProjectType;
  label: string;
  description: string;
  defaultRatio: AspectRatio;
  simplified: boolean;
}

export const PROJECT_TYPES: ProjectTypeConfig[] = [
  {
    value: 'movie',
    label: 'Film',
    description: 'Long-métrage avec pipeline complet',
    defaultRatio: '16:9',
    simplified: false,
  },
  {
    value: 'short',
    label: 'Court-métrage',
    description: 'Court-métrage ou vidéo narrative',
    defaultRatio: '16:9',
    simplified: false,
  },
  {
    value: 'music_video',
    label: 'Clip musical',
    description: 'Clip vidéo ou contenu vertical',
    defaultRatio: '9:16',
    simplified: false,
  },
  {
    value: 'shorts_project',
    label: 'Shorts',
    description: 'Collection de vidéos courtes (YouTube Shorts, TikTok)',
    defaultRatio: '9:16',
    simplified: true,
  },
  {
    value: 'portfolio',
    label: 'Portfolio',
    description: 'Collection d\'images pour portfolio',
    defaultRatio: '4:5',
    simplified: true,
  },
  {
    value: 'photo_series',
    label: 'Série photo',
    description: 'Série photo thématique',
    defaultRatio: '16:9',
    simplified: true,
  },
  {
    value: 'book',
    label: 'Livre',
    description: 'Roman, nouvelle ou livre non-fiction',
    defaultRatio: '2:3',
    simplified: true,
  },
];

export function getProjectTypeConfig(type: ProjectType): ProjectTypeConfig {
  return PROJECT_TYPES.find((t) => t.value === type) ?? PROJECT_TYPES[1]; // Default to 'short'
}

export function isSimplifiedProject(type: ProjectType): boolean {
  const config = getProjectTypeConfig(type);
  return config.simplified;
}

export type NavigationItem = {
  name: string;
  href: string;
  icon: string;
};

// Full pipeline navigation for movie/short/music_video
const FULL_PIPELINE_NAVIGATION: NavigationItem[] = [
  { name: 'Brainstorming', href: '/brainstorming', icon: 'Lightbulb' },
  { name: 'Script', href: '/script', icon: 'Clapperboard' },
  { name: 'Storyboard', href: '/storyboard', icon: 'ImageIcon' },
  { name: 'Preprod', href: '/preprod', icon: 'Frame' },
  { name: 'Production', href: '/production', icon: 'PlayCircle' },
];

// Simplified navigation for portfolio/photo_series
const SIMPLIFIED_NAVIGATION: NavigationItem[] = [
  { name: 'Quick Shot', href: '/quick-shot', icon: 'Zap' },
  { name: 'Gallery', href: '/gallery', icon: 'Grid3X3' },
  { name: 'Rushes', href: '/rushes', icon: 'Archive' },
];

// Shorts project navigation
const SHORTS_NAVIGATION: NavigationItem[] = [
  { name: 'Mes Shorts', href: '/shorts', icon: 'Play' },
  { name: 'Bible', href: '/bible', icon: 'BookOpen' },
];

// Music video (Clip) navigation - audio-first workflow
const MUSIC_VIDEO_NAVIGATION: NavigationItem[] = [
  { name: 'Clip', href: '/clip', icon: 'Music' },
  { name: 'Bible', href: '/bible', icon: 'BookOpen' },
  { name: 'Storyboard', href: '/storyboard', icon: 'ImageIcon' },
  { name: 'Production', href: '/production', icon: 'PlayCircle' },
];

// Book/Writing project navigation
const BOOK_NAVIGATION: NavigationItem[] = [
  { name: 'Mes Livres', href: '/books', icon: 'BookText' },
  { name: 'Bible', href: '/bible', icon: 'BookOpen' },
];

export function getNavigationForType(type: ProjectType): NavigationItem[] {
  if (type === 'shorts_project') return SHORTS_NAVIGATION;
  if (type === 'music_video') return MUSIC_VIDEO_NAVIGATION;
  if (type === 'book') return BOOK_NAVIGATION;
  return isSimplifiedProject(type) ? SIMPLIFIED_NAVIGATION : FULL_PIPELINE_NAVIGATION;
}

// Get the default landing page for a project type
export function getDefaultPageForType(type: ProjectType): string {
  if (type === 'shorts_project') return '/shorts';
  if (type === 'music_video') return '/clip';
  if (type === 'book') return '/books';
  return isSimplifiedProject(type) ? '/quick-shot' : '/brainstorming';
}

// Get aspect ratios available for a project type
export function getAspectRatiosForType(type: ProjectType): AspectRatio[] {
  if (type === 'shorts_project') {
    // Shorts can be vertical, square, or horizontal
    return ['9:16', '1:1', '16:9'];
  }
  const config = getProjectTypeConfig(type);
  if (config.simplified) {
    // Portfolio/photo projects can use portrait and landscape formats
    return ['4:5', '2:3', '16:9', '1:1', '9:16'];
  }
  // Video projects use standard video formats
  return ['16:9', '9:16', '1:1', '21:9'];
}
