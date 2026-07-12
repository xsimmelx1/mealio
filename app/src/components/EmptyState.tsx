import type { ReactNode } from 'react';

export default function EmptyState({
  icon = '🍽️',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card mt-6 flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="text-4xl" aria-hidden>
        {icon}
      </span>
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {description && <p className="max-w-xs text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
