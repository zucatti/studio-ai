import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { createServerSupabaseClient } from '@/lib/supabase';

export interface GalleryImage {
  id: string;
  url: string;
  type: 'storyboard' | 'first_frame' | 'last_frame';
  shotNumber: number;
  sceneNumber: number | null;
  description: string;
  projectId: string;
  projectName: string;
  createdAt: string;
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

    for (const shot of typedShots) {
      const project = projectMap.get(shot.project_id);
      if (!project) continue;

      const sceneData = Array.isArray(shot.scenes) ? shot.scenes[0] : shot.scenes;
      const sceneNumber = sceneData?.scene_number ?? null;

      if (shot.storyboard_image_url) {
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

      if (shot.first_frame_url) {
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

      if (shot.last_frame_url) {
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
