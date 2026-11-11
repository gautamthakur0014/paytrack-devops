import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { X, Bell, UserPlus, UserCheck, DollarSign, CheckCircle, Users } from 'lucide-react';
import { markNotificationRead, markToastShown } from '../../store/slices/notificationsSlice';
import { formatDistanceToNow } from 'date-fns';

const TYPE_CONFIG = {
  connection_request:  { icon: UserPlus,    color: 'blue',   label: 'Connection Request' },
  connection_accepted: { icon: UserCheck,   color: 'green',  label: 'Connected!' },
  expense_added:       { icon: DollarSign,  color: 'teal',   label: 'Added to Expense' },
  payment_received:    { icon: CheckCircle, color: 'green',  label: 'Payment' },
  payment_request:     { icon: DollarSign,  color: 'yellow', label: 'Payment Request' },
  group_invite:        { icon: Users,       color: 'purple', label: 'Group Invite' },
  general:             { icon: Bell,        color: 'teal',   label: 'Notification' },
};

const COLOR_STYLES = {
  blue:   { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  green:  { bg: 'rgba(34,197,94,0.12)',   text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  teal:   { bg: 'rgba(20,184,166,0.12)',  text: '#2dd4bf', border: 'rgba(20,184,166,0.25)' },
  yellow: { bg: 'rgba(234,179,8,0.12)',   text: '#facc15', border: 'rgba(234,179,8,0.25)' },
  purple: { bg: 'rgba(168,85,247,0.12)',  text: '#c084fc', border: 'rgba(168,85,247,0.25)' },
};

const AUTO_DISMISS_MS = 6000;

export default function NotificationToastContainer() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, toastShownIds, initialLoadDone } = useSelector(s => s.notifications);

  // visible: the notification currently being shown, null when hidden
  const [visible, setVisible] = useState(null);
  // progress bar width (100 → 0 over AUTO_DISMISS_MS)
  const [progress, setProgress] = useState(100);

  // Pick the next notification to show: unread + NOT already shown + initial load done
  const next = initialLoadDone
    ? items.find(n => !n.read && !toastShownIds.includes(n._id))
    : null;

  // When a new notification arrives, show it
  useEffect(() => {
    if (!next || visible?._id === next._id) return;
    setVisible(next);
    setProgress(100);
    // Immediately mark as "shown" in Redux so subsequent renders don't re-trigger
    dispatch(markToastShown(next._id));
  }, [next?._id]);

  // Auto-dismiss timer + progress bar
  useEffect(() => {
    if (!visible) return;

    const startTime = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(tick);
        setVisible(null);
      }
    }, 50);

    return () => clearInterval(tick);
  }, [visible?._id]);

  if (!visible) return null;

  const cfg    = TYPE_CONFIG[visible.type] || TYPE_CONFIG.general;
  const colors = COLOR_STYLES[cfg.color]   || COLOR_STYLES.teal;
  const Icon   = cfg.icon;

  const dismiss = () => {
    setVisible(null);
    // Don't mark as read — just hide the popup. User can still read it in /notifications.
  };

  const handleView = () => {
    dispatch(markNotificationRead(visible._id));
    setVisible(null);
    navigate(visible.data?.url || '/notifications');
  };

  return (
    <div
      className="fixed top-4 right-4 z-[9999] w-80 animate-slide-up pointer-events-auto"
      role="alert"
      aria-live="polite"
    >
      <div
        className="rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          border: `1px solid ${colors.border}`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px ${colors.border}`,
        }}
      >
        {/* Progress bar — shrinks left to right over 6s */}
        <div className="h-1" style={{ background: 'var(--bg-input)' }}>
          <div
            className="h-full transition-none"
            style={{
              width: `${progress}%`,
              background: colors.text,
              opacity: 0.8,
            }}
          />
        </div>

        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: colors.bg }}>
              <Icon size={18} style={{ color: colors.text }} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.text }}>
                    {cfg.label}
                  </p>
                  <p className="text-sm font-medium text-primary-custom mt-0.5 leading-snug line-clamp-2">
                    {visible.title}
                  </p>
                </div>
                <button
                  onClick={dismiss}
                  className="p-1 rounded-lg text-muted-custom hover:text-secondary-custom transition-colors flex-shrink-0 mt-0.5"
                  style={{ background: 'var(--bg-input)' }}
                  aria-label="Dismiss"
                >
                  <X size={13} />
                </button>
              </div>

              <p className="text-xs text-muted-custom mt-1 leading-relaxed line-clamp-2">
                {visible.body}
              </p>

              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted-custom">
                  {formatDistanceToNow(new Date(visible.createdAt || Date.now()), { addSuffix: true })}
                </span>
                <button
                  onClick={handleView}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: colors.bg, color: colors.text }}
                >
                  View →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
