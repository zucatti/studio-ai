'use client';

import { MentionText, type MentionEntity } from './mention-text';
import { useProjectEntitiesContext } from '@/contexts/project-entities-context';

interface ProjectMentionTextProps {
  text: string;
  className?: string;
  showTooltip?: boolean;
  onClick?: (reference: string, entity?: MentionEntity) => void;
}

/**
 * MentionText component that automatically uses project entities from context
 *
 * Wrap your project pages with ProjectEntitiesProvider to use this component:
 *
 * ```tsx
 * <ProjectEntitiesProvider projectId={projectId}>
 *   <ProjectMentionText text="@Morgana walks in" />
 * </ProjectEntitiesProvider>
 * ```
 */
export function ProjectMentionText({
  text,
  className,
  showTooltip = true,
  onClick,
}: ProjectMentionTextProps) {
  const { entities } = useProjectEntitiesContext();

  return (
    <MentionText
      text={text}
      entities={entities}
      className={className}
      showTooltip={showTooltip}
      onClick={onClick}
    />
  );
}
