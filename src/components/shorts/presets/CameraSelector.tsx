'use client';

import { cn } from '@/lib/utils';
import type { CameraTypeCinematic, ApertureStyle } from '@/types/cinematic';

interface CameraSelectorProps {
  value: {
    type: CameraTypeCinematic;
    depth_of_field?: ApertureStyle;
  };
  onChange: (value: CameraSelectorProps['value']) => void;
}

// Depth of field options
const DEPTH_OF_FIELD_OPTIONS: {
  value: ApertureStyle | undefined;
  label: string;
  description: string;
  visual: string; // CSS blur representation
}[] = [
  {
    value: undefined,
    label: 'Auto',
    description: 'Non spécifié',
    visual: '',
  },
  {
    value: 'shallow_dof',
    label: 'Faible',
    description: 'Arrière-plan flou, intime',
    visual: 'blur-lg',
  },
  {
    value: 'medium_dof',
    label: 'Moyenne',
    description: 'Équilibré',
    visual: 'blur-sm',
  },
  {
    value: 'deep_dof',
    label: 'Grande',
    description: 'Tout net, paysage',
    visual: '',
  },
];

// SVG Icons for each camera type
const TripodIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    {/* Camera body */}
    <rect x="16" y="8" width="16" height="10" rx="2" />
    <circle cx="20" cy="13" r="3" /> {/* Lens */}
    {/* Tripod legs */}
    <line x1="24" y1="18" x2="24" y2="24" />
    <line x1="24" y1="24" x2="12" y2="40" />
    <line x1="24" y1="24" x2="24" y2="40" />
    <line x1="24" y1="24" x2="36" y2="40" />
  </svg>
);

const HandheldIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    {/* Hand */}
    <path d="M28 32 C28 28, 32 26, 34 28 L36 30" />
    <path d="M26 30 C24 26, 20 26, 18 30 L16 36 C14 40, 18 42, 22 40 L30 36" />
    {/* Camera */}
    <rect x="12" y="16" width="20" height="12" rx="2" />
    <circle cx="18" cy="22" r="4" /> {/* Lens */}
    <rect x="28" y="18" width="6" height="4" rx="1" /> {/* Viewfinder */}
  </svg>
);

const SteadicamIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    {/* Camera on top */}
    <rect x="14" y="6" width="14" height="8" rx="1" />
    <circle cx="18" cy="10" r="2" />
    {/* Arm/gimbal structure */}
    <line x1="21" y1="14" x2="21" y2="20" />
    <rect x="18" y="20" width="6" height="4" rx="1" /> {/* Joint */}
    <line x1="21" y1="24" x2="21" y2="32" />
    {/* Counterweight */}
    <rect x="16" y="32" width="10" height="6" rx="1" />
    {/* Vest attachment */}
    <path d="M26 28 L32 26 L32 38 L26 36" />
  </svg>
);

const GimbalIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    {/* Camera */}
    <rect x="14" y="10" width="14" height="8" rx="1" />
    <circle cx="18" cy="14" r="2" />
    {/* Gimbal rings */}
    <ellipse cx="21" cy="14" rx="14" ry="4" strokeDasharray="4 2" />
    <ellipse cx="21" cy="14" rx="10" ry="8" strokeDasharray="4 2" />
    {/* Handle */}
    <line x1="21" y1="22" x2="21" y2="28" />
    <rect x="17" y="28" width="8" height="12" rx="2" />
  </svg>
);

const DollyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    {/* Rails */}
    <line x1="4" y1="38" x2="44" y2="38" />
    <line x1="4" y1="42" x2="44" y2="42" />
    {/* Wheels */}
    <circle cx="16" cy="36" r="3" />
    <circle cx="32" cy="36" r="3" />
    {/* Platform */}
    <rect x="10" y="28" width="28" height="6" rx="1" />
    {/* Camera */}
    <rect x="18" y="14" width="16" height="10" rx="2" />
    <circle cx="23" cy="19" r="3" />
    {/* Stand */}
    <line x1="26" y1="24" x2="26" y2="28" />
    {/* Arrow showing movement */}
    <path d="M6 20 L14 20 M12 17 L14 20 L12 23" strokeWidth="1.5" />
  </svg>
);

const CraneIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    {/* Base/pivot */}
    <rect x="32" y="36" width="10" height="6" rx="1" />
    <circle cx="37" cy="34" r="3" />
    {/* Arm */}
    <line x1="37" y1="34" x2="10" y2="14" strokeWidth="3" />
    {/* Camera at end */}
    <rect x="4" y="10" width="12" height="8" rx="1" />
    <circle cx="8" cy="14" r="2" />
    {/* Counterweight */}
    <rect x="38" y="28" width="6" height="6" rx="1" />
    {/* Up/down arrow */}
    <path d="M20 8 L20 24 M17 11 L20 8 L23 11 M17 21 L20 24 L23 21" strokeWidth="1.5" />
  </svg>
);

const DroneIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    {/* Body */}
    <rect x="18" y="20" width="12" height="8" rx="2" />
    {/* Camera underneath */}
    <circle cx="24" cy="30" r="3" />
    {/* Arms */}
    <line x1="18" y1="22" x2="8" y2="16" />
    <line x1="30" y1="22" x2="40" y2="16" />
    <line x1="18" y1="26" x2="8" y2="32" />
    <line x1="30" y1="26" x2="40" y2="32" />
    {/* Propellers */}
    <ellipse cx="8" cy="16" rx="5" ry="2" />
    <ellipse cx="40" cy="16" rx="5" ry="2" />
    <ellipse cx="8" cy="32" rx="5" ry="2" />
    <ellipse cx="40" cy="32" rx="5" ry="2" />
  </svg>
);

// Camera types with icons and animations
const CAMERA_TYPES: {
  value: CameraTypeCinematic;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  animation: string;
}[] = [
  {
    value: 'tripod',
    label: 'Trépied',
    description: 'Statique, stable',
    icon: TripodIcon,
    animation: '',
  },
  {
    value: 'handheld',
    label: 'Handheld',
    description: 'Organique, docu',
    icon: HandheldIcon,
    animation: 'animate-camera-handheld',
  },
  {
    value: 'steadicam',
    label: 'Steadicam',
    description: 'Fluide, cinéma',
    icon: SteadicamIcon,
    animation: 'animate-camera-steadicam',
  },
  {
    value: 'gimbal',
    label: 'Gimbal',
    description: 'Tracking smooth',
    icon: GimbalIcon,
    animation: 'animate-camera-gimbal',
  },
  {
    value: 'dolly',
    label: 'Dolly',
    description: 'Travelling',
    icon: DollyIcon,
    animation: 'animate-camera-dolly',
  },
  {
    value: 'crane',
    label: 'Crane',
    description: 'Plongée/contre',
    icon: CraneIcon,
    animation: 'animate-camera-crane',
  },
  {
    value: 'drone',
    label: 'Drone',
    description: 'Vue aérienne',
    icon: DroneIcon,
    animation: 'animate-camera-drone',
  },
];

export function CameraSelector({ value, onChange }: CameraSelectorProps) {
  return (
    <div className="space-y-3">
      {/* Inject keyframes */}
      <style jsx global>{`
        @keyframes camera-handheld {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(1px, 0.5px) rotate(0.5deg); }
          50% { transform: translate(-0.5px, 1px) rotate(-0.3deg); }
          75% { transform: translate(0.5px, -0.5px) rotate(0.3deg); }
        }
        @keyframes camera-steadicam {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(2px); }
        }
        @keyframes camera-gimbal {
          0%, 100% { transform: translateX(-2px); }
          50% { transform: translateX(2px); }
        }
        @keyframes camera-dolly {
          0%, 100% { transform: translateX(-3px); }
          50% { transform: translateX(3px); }
        }
        @keyframes camera-crane {
          0%, 100% { transform: translateY(2px); }
          50% { transform: translateY(-2px); }
        }
        @keyframes camera-drone {
          0%, 100% { transform: translate(0, 1px) rotate(-0.5deg); }
          33% { transform: translate(1px, -1px) rotate(0.5deg); }
          66% { transform: translate(-1px, 0) rotate(0deg); }
        }
        .animate-camera-handheld { animation: camera-handheld 0.15s ease-in-out infinite; }
        .animate-camera-steadicam { animation: camera-steadicam 2s ease-in-out infinite; }
        .animate-camera-gimbal { animation: camera-gimbal 1.5s ease-in-out infinite; }
        .animate-camera-dolly { animation: camera-dolly 2s ease-in-out infinite; }
        .animate-camera-crane { animation: camera-crane 2s ease-in-out infinite; }
        .animate-camera-drone { animation: camera-drone 3s ease-in-out infinite; }
      `}</style>

      {/* Camera Type Cards */}
      <div className="grid grid-cols-7 gap-1.5">
        {CAMERA_TYPES.map((cam) => {
          const Icon = cam.icon;
          const isSelected = value.type === cam.value;

          return (
            <button
              key={cam.value}
              onClick={() => onChange({ ...value, type: cam.value })}
              className={cn(
                'group flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-center',
                isSelected
                  ? 'bg-blue-500/20 border-blue-500/50'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              )}
            >
              {/* Icon with animation */}
              <div
                className={cn(
                  'w-8 h-8 transition-transform',
                  isSelected && cam.animation,
                  !isSelected && cam.animation && 'group-hover:' + cam.animation.replace('animate-', '[animation:') + '_0.15s_ease-in-out_infinite]'
                )}
              >
                <Icon
                  className={cn(
                    'w-full h-full',
                    isSelected ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-300'
                  )}
                />
              </div>

              {/* Label */}
              <div
                className={cn(
                  'text-[10px] font-medium',
                  isSelected ? 'text-blue-300' : 'text-slate-300'
                )}
              >
                {cam.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Depth of Field */}
      <div className="pt-3 border-t border-white/10">
        <div className="text-xs text-slate-400 mb-2">Profondeur de champ</div>
        <div className="grid grid-cols-4 gap-1.5">
          {DEPTH_OF_FIELD_OPTIONS.map((dof) => {
            const isSelected = value.depth_of_field === dof.value;

            return (
              <button
                key={dof.value || 'auto'}
                onClick={() => onChange({ ...value, depth_of_field: dof.value })}
                className={cn(
                  'group flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all text-center',
                  isSelected
                    ? 'bg-blue-500/20 border-blue-500/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                )}
              >
                {/* Visual representation */}
                <div className="relative w-10 h-6 rounded overflow-hidden bg-gradient-to-r from-slate-600 to-slate-700">
                  {/* Subject (always sharp) */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-400" />
                  {/* Background (blurred based on DoF) */}
                  <div className={cn(
                    'absolute inset-0 bg-gradient-to-br from-slate-500/50 to-slate-600/50',
                    dof.visual
                  )} />
                  {/* Foreground blur for shallow */}
                  {dof.value === 'shallow_dof' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-500/30 blur-sm" />
                  )}
                </div>

                {/* Label */}
                <div className={cn(
                  'text-[10px] font-medium',
                  isSelected ? 'text-blue-300' : 'text-slate-300'
                )}>
                  {dof.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
