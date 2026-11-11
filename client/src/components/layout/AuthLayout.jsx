import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex bg-surface-950 bg-mesh">
      {/* Left decorative panel */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-surface-900/60 border-r border-white/8 p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow">
            <span className="text-white font-display font-bold">SL</span>
          </div>
          <span className="font-display font-bold text-surface-50 text-xl tracking-tight">PayTrack</span>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="font-display text-4xl font-bold text-surface-50 leading-tight">
              Split expenses.<br />
              <span className="text-gradient">Zero friction.</span>
            </h1>
            <p className="mt-4 text-surface-400 text-lg leading-relaxed">
              Track shared costs, settle debts, and stay organized — with real-time sync across all your devices.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Expense Types', value: '3 split modes' },
              { label: 'Offline Support', value: 'offline first' },
              { label: 'Push Alerts', value: 'Web Push' },
              { label: 'Analytics', value: 'Full insights' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-800/50 border border-white/8 rounded-xl p-4">
                <p className="text-xs text-surface-500 font-medium">{label}</p>
                <p className="text-surface-200 font-semibold mt-1">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-surface-600 text-sm">© 2026 PayTrack. All rights reserved.</p>
      </div>

      {/* Right auth form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
