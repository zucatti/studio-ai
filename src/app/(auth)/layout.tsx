import { Film, Sparkles } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-[#0f1f2e]">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#1a3550] to-[#162a41] relative overflow-hidden">
        {/* Background patterns */}
        <div className="absolute inset-0">
          <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg shadow-blue-500/30">
              <Film className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Studio IA</h1>
              <p className="text-blue-400 text-sm font-medium">Production Vidéo</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold text-white leading-tight mb-6">
            Créez des vidéos<br />
            <span className="text-blue-400">extraordinaires</span> avec l&apos;IA
          </h2>

          <p className="text-slate-400 text-lg max-w-md">
            Du brainstorming à la production, notre plateforme vous accompagne à chaque étape de votre workflow créatif.
          </p>

          {/* Features */}
          <div className="mt-12 space-y-4">
            {[
              'Brainstorming assisté par IA',
              'Éditeur de script professionnel',
              'Génération de storyboard automatique',
              'Production vidéo haute qualité',
            ].map((feature, index) => (
              <div key={index} className="flex items-center gap-3 text-slate-300">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-blue-400" />
                </div>
                {feature}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
