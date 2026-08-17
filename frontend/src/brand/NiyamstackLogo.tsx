type LogoProps = {
  variant?: "lockup" | "mark" | "icon";
  className?: string;
};

export function NiyamstackLogo({ variant = "mark", className = "" }: LogoProps) {
  if (variant === "lockup") {
    return (
      <div className={`flex items-center gap-5 ${className}`}>
        <img src="/brand/logo-icon.png" alt="" className="h-20 w-20 shrink-0 rounded-2xl shadow-lg shadow-brand/40 xl:h-24 xl:w-24" />
        <div>
          <p className="text-4xl font-extrabold tracking-tight text-white xl:text-5xl">Niyamstack</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="h-px flex-1 bg-sky-300/70" />
            <p className="text-xs font-semibold tracking-[0.35em] text-sky-200">TECHNOLOGIES</p>
            <span className="h-px flex-1 bg-sky-300/70" />
          </div>
        </div>
      </div>
    );
  }
  if (variant === "icon") {
    return <img src="/brand/logo-icon.png" alt="Niyamstack" className={`h-10 w-10 rounded-xl object-contain ${className}`} />;
  }
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img src="/brand/logo-icon.png" alt="" className="h-12 w-12 rounded-xl object-contain shadow-sm" />
      <div className="leading-tight">
        <p className="text-xl font-extrabold tracking-tight text-navy">Niyamstack</p>
        <p className="mt-0.5 text-[10px] font-semibold tracking-[0.28em] text-slate-500">TECHNOLOGIES</p>
      </div>
    </div>
  );
}
