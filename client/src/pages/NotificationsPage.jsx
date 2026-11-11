import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Bell, Check, Trash2, CheckCheck } from 'lucide-react';
import { fetchNotifications, markNotificationRead, markAllRead, deleteNotification } from '../store/slices/notificationsSlice';
import { PageHeader, EmptyState, Spinner } from '../components/ui/index';
import { format, formatDistanceToNow } from 'date-fns';

const TYPE_ICON = {
  connection_request: '👋',
  connection_accepted: '🤝',
  expense_added: '💰',
  payment_received: '✅',
  payment_request: '🔔',
  group_invite: '👥',
  general: '📬',
};

export default function NotificationsPage() {
  const dispatch = useDispatch();
  const { items, unreadCount, loading } = useSelector(s => s.notifications);

  useEffect(() => {
    dispatch(fetchNotifications({ limit: 50 }));
  }, [dispatch]);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        action={
          unreadCount > 0 && (
            <button onClick={() => dispatch(markAllRead())} className="btn-secondary flex items-center gap-2 text-sm">
              <CheckCheck size={15} /> Mark all read
            </button>
          )
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="You're all caught up! Notifications will appear here." />
      ) : (
        <div className="space-y-2">
          {items.map(notif => (
            <div key={notif._id}
              className={`card flex items-start gap-4 transition-all ${!notif.read ? 'border-brand-500/20 bg-brand-500/3' : 'hover:border-white/12'}`}
              onClick={() => !notif.read && dispatch(markNotificationRead(notif._id))}>
              {!notif.read && <div className="w-2 h-2 bg-brand-500 rounded-full mt-2 flex-shrink-0" />}
              <div className="w-10 h-10 rounded-xl bg-surface-800 flex items-center justify-center text-xl flex-shrink-0">
                {TYPE_ICON[notif.type] || '📬'}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${notif.read ? 'text-surface-300' : 'text-surface-100'}`}>{notif.title}</p>
                <p className="text-surface-500 text-xs mt-0.5">{notif.body}</p>
                <p className="text-surface-600 text-xs mt-1">
                  {formatDistanceToNow(new Date(notif.createdAt || Date.now()), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!notif.read && (
                  <button onClick={(e) => { e.stopPropagation(); dispatch(markNotificationRead(notif._id)); }}
                    className="text-surface-500 hover:text-green-400 p-1.5 hover:bg-green-500/10 rounded-lg transition-colors" title="Mark read">
                    <Check size={15} />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); dispatch(deleteNotification(notif._id)); }}
                  className="text-surface-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
