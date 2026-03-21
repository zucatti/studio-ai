import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

export interface GalleryImage {
  id: string;
  url: string;
  type: 'storyboard' | 'first_frame' | 'last_frame' | 'rush';
  shotNumber: number;
  sceneNumber: number | null;
  description: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  aspectRatio?: string;
}

export interface GalleryProject {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  imageCount: number;
}

interface ProjectRow {
  id: string;
  name: string;
  thumbnail_url: string | null;
}

interface ShotRow {
  id: string;
  shot_number: number;
  description: string;
  storyboard_image_url: string | null;
  first_frame_url: string | null;
  last_frame_url: string | null;
  created_at: string;
  project_id: string;
  scene_id: string | null;
  scenes: { scene_number: number }[] | { scene_number: number } | null;
}

export async function GET() {
  try {
    const session = await auth0.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.sub;
    const supabase = createServerSupabaseClient();

    // Fetch all projects for this user
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, name, thumbnail_url')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (projectsError) {
      console.error('Error fetching projects:', projectsError);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    const typedProjects = (projects || []) as ProjectRow[];
    const projectIds = typedProjects.map(p => p.id);

    if (projectIds.length === 0) {
      return NextResponse.json({
        images: [],
        projects: [],
        totalCount: 0
      });
    }

    // Fetch shots with scene info
    const { data: shots, error: shotsError } = await supabase
      .from('shots')
      .select(`
        id,
        shot_number,
        description,
        storyboard_image_url,
        first_frame_url,
        last_frame_url,
        created_at,
        project_id,
        scene_id,
        scenes (
          scene_number
        )
      `)
      .in('project_id', projectIds)
      .or('storyboard_image_url.neq.null,first_frame_url.neq.null,last_frame_url.neq.null')
      .order('created_at', { ascending: false });

    if (shotsError) {
      console.error('Error fetching shots:', shotsError);
      return NextResponse.json({ error: 'Failed to fetch shots' }, { status: 500 });
    }

    const typedShots = (shots || []) as ShotRow[];

    // Create project name lookup
    const projectMap = new Map(typedProjects.map(p => [p.id, p]));

    // Transform shots to gallery images
    const images: GalleryImage[] = [];
    const projectImageCounts = new Map<string, number>();

    // Track seen URLs to avoid duplicates
    const seenUrls = new Set<string>();

    // Helper to check if URL is a video (not an image)
    const isVideoUrl = (url: string): boolean => {
      const lower = url.toLowerCase();
      return (
        lower.includes('/videos/') ||
        lower.endsWith('.mp4') ||
        lower.endsWith('.webm') ||
        lower.endsWith('.mov') ||
        lower.endsWith('.avi')
      );
    };

    // Helper to check if URL is valid for gallery (image only)
    const isValidImageUrl = (url: string | null): url is string => {
      return !!url && !isVideoUrl(url);
    };

    for (const shot of typedShots) {
      const project = projectMap.get(shot.project_id);
      if (!project) continue;

      const sceneData = Array.isArray(shot.scenes) ? shot.scenes[0] : shot.scenes;
      const sceneNumber = sceneData?.scene_number ?? null;

      // Add storyboard image (primary) - skip video URLs
      if (isValidImageUrl(shot.storyboard_image_url) && !seenUrls.has(shot.storyboard_image_url)) {
        seenUrls.add(shot.storyboard_image_url);
        images.push({
          id: `${shot.id}-storyboard`,
          url: shot.storyboard_image_url,
          type: 'storyboard',
          shotNumber: shot.shot_number,
          sceneNumber,
          description: shot.description,
          projectId: shot.project_id,
          projectName: project.name,
          createdAt: shot.created_at,
        });
        projectImageCounts.set(shot.project_id, (projectImageCounts.get(shot.project_id) || 0) + 1);
      }

      // Add first frame only if different from storyboard - skip video URLs
      if (isValidImageUrl(shot.first_frame_url) && !seenUrls.has(shot.first_frame_url)) {
        seenUrls.add(shot.first_frame_url);
        images.push({
          id: `${shot.id}-first`,
          url: shot.first_frame_url,
          type: 'first_frame',
          shotNumber: shot.shot_number,
          sceneNumber,
          description: shot.description,
          projectId: shot.project_id,
          projectName: project.name,
          createdAt: shot.created_at,
        });
        projectImageCounts.set(shot.project_id, (projectImageCounts.get(shot.project_id) || 0) + 1);
      }

      // Add last frame only if different from others - skip video URLs
      if (isValidImageUrl(shot.last_frame_url) && !seenUrls.has(shot.last_frame_url)) {
        seenUrls.add(shot.last_frame_url);
        images.push({
          id: `${shot.id}-last`,
          url: shot.last_frame_url,
          type: 'last_frame',
          shotNumber: shot.shot_number,
          sceneNumber,
          description: shot.description,
          projectId: shot.project_id,
          projectName: project.name,
          createdAt: shot.created_at,
        });
        projectImageCounts.set(shot.project_id, (projectImageCounts.get(shot.project_id) || 0) + 1);
      }
    }

    // Fetch rush images
    const { data: rushImages, error: rushError } = await supabase
      .from('rush_images')
      .select('id, url, prompt, aspect_ratio, project_id, created_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false });

    if (!rushError && rushImages) {
      for (const rush of rushImages) {
        const project = projectMap.get(rush.project_id);
        if (!project) continue;

        // Skip video URLs and duplicates
        if (!isValidImageUrl(rush.url)) continue;
        if (seenUrls.has(rush.url)) continue;
        seenUrls.add(rush.url);

        images.push({
          id: `rush-${rush.id}`,
          url: rush.url,
          type: 'rush',
          shotNumber: 0,
          sceneNumber: null,
          description: rush.prompt || '',
          projectId: rush.project_id,
          projectName: project.name,
          createdAt: rush.created_at,
          aspectRatio: rush.aspect_ratio || undefined,
        });
        projectImageCounts.set(rush.project_id, (projectImageCounts.get(rush.project_id) || 0) + 1);
      }
    }


    // Sort all images by created_at desc
    images.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Build projects list with image counts
    const galleryProjects: GalleryProject[] = typedProjects
      .filter(p => projectImageCounts.has(p.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        thumbnailUrl: p.thumbnail_url,
        imageCount: projectImageCounts.get(p.id) || 0,
      }))
      .sort((a, b) => b.imageCount - a.imageCount);

    return NextResponse.json({
      images,
      projects: galleryProjects,
      totalCount: images.length,
    });
  } catch (error) {
    console.error('Gallery API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
