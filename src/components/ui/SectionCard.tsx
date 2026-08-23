import { ReactNode } from 'react';

export function SectionCard({
  title,
  badge,
  action,
  children,
}: {
  title: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="section-title">{title}</h2>
          {badge}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}