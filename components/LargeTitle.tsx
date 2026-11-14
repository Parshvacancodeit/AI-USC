export default function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 px-5 pb-3 pt-[max(20px,env(safe-area-inset-top))] animate-fade-up">
      <div>
        <h1 className="text-[34px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-[15px] text-muted">{subtitle}</div>}
      </div>
      {right}
    </header>
  );
}
