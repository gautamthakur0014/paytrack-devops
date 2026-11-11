export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-surface-950 bg-mesh flex items-center justify-center z-50">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow mx-auto animate-pulse-slow">
          <span className="text-white font-display font-bold text-lg">SL</span>
        </div>
        <div className="flex items-center gap-1.5 justify-center">
          {[0,1,2].map(i => (
            <div key={i} className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
