import type { LucideIcon } from 'lucide-react';

export type ModuleAction = {
  title: string;
  description: string;
};

export default function ModulePage({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  note,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  actions: ModuleAction[];
  note: string;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon className="size-5" /></div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action, index) => (
          <div key={action.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold text-blue-600">{String(index + 1).padStart(2, '0')}</div>
            <h2 className="mt-2 text-base font-bold">{action.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{action.description}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <b>V2 implementation note:</b> {note}
      </section>
    </div>
  );
}
