import { Loader2 } from 'lucide-react';

export function Spinner({ size = 20, className = '' }) {
  return <Loader2 size={size} className={`animate-spin text-teal-400 ${className}`} />;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
        <Icon size={28} className="text-muted-custom" />
      </div>
      <h3 className="font-display font-semibold text-primary-custom text-lg">{title}</h3>
      {description && <p className="text-muted-custom text-sm mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <div className="skeleton h-4 w-1/3 rounded" />
      <div className="skeleton h-3 w-2/3 rounded" />
      <div className="skeleton h-3 w-1/2 rounded" />
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary-custom">{title}</h1>
        {subtitle && <p className="text-muted-custom text-sm mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, color = 'brand', trend }) {
  const colors = {
    brand: { bg: 'rgba(20,184,166,0.12)', text: '#14b8a6' },
    green: { bg: 'rgba(34,197,94,0.12)', text: '#22c55e' },
    red: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
    blue: { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
    yellow: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
  };
  const c = colors[color] || colors.brand;
  return (
    <div className="card flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: c.bg }}>
        <Icon size={20} style={{ color: c.text }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-muted-custom text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="font-display font-bold text-primary-custom text-2xl mt-0.5 truncate">{value}</p>
        {sub && <p className="text-muted-custom text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
