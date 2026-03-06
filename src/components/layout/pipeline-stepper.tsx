'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { PipelineStep } from '@/types/database';
import {
  Lightbulb,
  FileText,
  LayoutGrid,
  Library,
  Frame,
  Video,
  Check,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const PIPELINE_STEPS: { step: PipelineStep; label: string; description: string }[] = [
  { step: 'brainstorming', label: 'Brainstorming', description: 'Idées et concepts initiaux' },
  { step: 'script', label: 'Script', description: 'Écriture du scénario' },
  { step: 'storyboard', label: 'Storyboard', description: 'Visualisation des plans' },
  { step: 'library', label: 'Bibliothèque', description: 'Personnages et décors' },
  { step: 'preprod', label: 'Préprod', description: 'Préparation des frames' },
  { step: 'production', label: 'Production', description: 'Génération vidéo' },
];

const stepIcons: Record<PipelineStep, React.ComponentType<{ className?: string }>> = {
  brainstorming: Lightbulb,
  script: FileText,
  storyboard: LayoutGrid,
  library: Library,
  preprod: Frame,
  production: Video,
};

interface PipelineStepperProps {
  projectId: string;
  currentStep?: PipelineStep;
}

export function PipelineStepper({ projectId, currentStep }: PipelineStepperProps) {
  const pathname = usePathname();

  const getCurrentStepFromPath = (): PipelineStep => {
    for (const { step } of PIPELINE_STEPS) {
      if (pathname.includes(`/${step}`)) {
        return step;
      }
    }
    return 'brainstorming';
  };

  const activeStep = currentStep || getCurrentStepFromPath();
  const activeStepIndex = PIPELINE_STEPS.findIndex((s) => s.step === activeStep);

  return (
    <TooltipProvider>
      <nav className="flex items-center gap-2 p-2 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/5">
        {PIPELINE_STEPS.map(({ step, label, description }, index) => {
          const Icon = stepIcons[step];
          const isActive = step === activeStep;
          const isCompleted = index < activeStepIndex;

          return (
            <div key={step} className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/project/${projectId}/${step}`}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300',
                      isActive
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                        : isCompleted
                        ? 'text-blue-400 hover:bg-blue-500/10'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    )}
                  >
                    <span className="relative">
                      {isCompleted && !isActive ? (
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20">
                          <Check className="w-3 h-3 text-blue-400" />
                        </div>
                      ) : (
                        <Icon className={cn(
                          'w-5 h-5',
                          isActive && 'drop-shadow-[0_0_8px_rgba(68,212,169,0.5)]'
                        )} />
                      )}
                    </span>
                    <span className="hidden lg:inline">{label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-[#1e3a52] border-white/10 text-white"
                >
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-slate-400">{description}</p>
                </TooltipContent>
              </Tooltip>

              {index < PIPELINE_STEPS.length - 1 && (
                <div className="flex items-center mx-1">
                  <div
                    className={cn(
                      'w-8 h-0.5 rounded-full transition-colors duration-300',
                      index < activeStepIndex
                        ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                        : 'bg-white/10'
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
