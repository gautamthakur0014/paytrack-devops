import { format } from 'date-fns';
import { CheckCircle, Bell, Users } from 'lucide-react';

const CATEGORY_EMOJI = { food: '🍕', travel: '✈️', rent: '🏠', utilities: '⚡', entertainment: '🎮', health: '💊', shopping: '🛍️', other: '📦' };
const STATUS_STYLES  = { paid: 'badge-green', notified: 'badge-yellow', added: 'badge-blue' };
const STATUS_LABEL   = { paid: '✓ Paid', notified: 'Notified', added: 'Pending' };

export default function ExpenseDetail({ expense, currentUserId, onMarkPaid, onNotifyMember }) {
  if (!expense) return null;

  const isOwner = (() => {
    const oid = expense.ownerId?._id || expense.ownerId;
    return oid === currentUserId || oid?.toString() === currentUserId;
  })();

  const group = expense.groupId;
  const pendingCount = expense.members?.filter(m => m.status !== 'paid').length || 0;
  const paidCount    = expense.members?.filter(m => m.status === 'paid').length  || 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
          style={{ background: 'var(--bg-input)' }}>
          {CATEGORY_EMOJI[expense.category] || '📦'}
        </div>
        <div className="flex-1">
          <h3 className="font-display text-xl font-semibold text-primary-custom">{expense.description}</h3>
          <p className="text-muted-custom text-sm mt-0.5">{format(new Date(expense.expenseDate), 'EEEE, MMMM d, yyyy')}</p>

          {/* Group chip */}
          {group && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-teal-500/20 bg-teal-500/8 text-teal-400"
              style={{ background: 'rgba(20,184,166,0.08)' }}>
              <Users size={11} />
              {group.name || 'Group expense'}
            </div>
          )}

          {!isOwner && (
            <span className="inline-block mt-1 badge badge-yellow text-xs">You are a member</span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-mono font-bold text-2xl text-primary-custom">
            {expense.currency} {expense.amount?.toFixed(2)}
          </p>
          <span className={`badge ${
            expense.type === 'individual' ? 'badge-blue' :
            expense.type === 'equal_group' ? 'badge-brand' : 'badge-yellow'
          }`}>
            {expense.type.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Recovery progress (owner view) */}
      {expense.members?.length > 0 && isOwner && (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-muted-custom">Recovery progress</span>
            <span className="text-secondary-custom font-mono">
              {expense.currency} {expense.recoveredAmount?.toFixed(2)} / {expense.totalAmount?.toFixed(2)}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, ((expense.recoveredAmount || 0) / (expense.totalAmount || 1)) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-muted-custom">
              {expense.isFullySettled ? '✅ Fully settled' : `${expense.currency} ${((expense.totalAmount || 0) - (expense.recoveredAmount || 0)).toFixed(2)} pending`}
            </p>
            <p className="text-xs text-muted-custom">{paidCount}/{expense.members.length} paid</p>
          </div>
        </div>
      )}

      {/* Members table */}
      {expense.members?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-secondary-custom">
              Members ({expense.members.length})
            </h4>
            {!isOwner && (
              <span className="text-muted-custom text-xs">You can mark your own payment</span>
            )}
            {isOwner && pendingCount > 0 && (
              <span className="text-xs text-yellow-500">{pendingCount} pending</span>
            )}
          </div>

          <div className="space-y-2">
            {expense.members.map((member, idx) => {
              const memberId = member.userId?._id || member.userId;
              const isMe     = memberId === currentUserId || memberId?.toString() === currentUserId;
              const canMarkPaid  = (isOwner || isMe) && member.status !== 'paid' && onMarkPaid;
              const canNotify    = isOwner && member.status !== 'paid' && onNotifyMember;

              return (
                <div key={member._id || idx}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    isMe
                      ? 'bg-teal-500/5 border-teal-500/20'
                      : ''
                  }`}
                  style={!isMe ? { background: 'var(--bg-input)', border: '1px solid var(--border)' } : {}}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: member.avatarColor || member.userId?.avatarColor || '#64748b' }}
                  >
                    {(member.displayName || member.userId?.displayName || member.username || '?').slice(0, 1)}
                  </div>

                  {/* Name + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-secondary-custom text-sm font-medium truncate">
                        {member.displayName || member.userId?.displayName || member.username || 'Unknown'}
                      </p>
                      {isMe && <span className="text-xs text-teal-400">(you)</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`badge text-xs ${STATUS_STYLES[member.status] || 'badge-blue'}`}>
                        {STATUS_LABEL[member.status] || member.status}
                      </span>
                      {member.paidAt && (
                        <span className="text-muted-custom text-xs">{format(new Date(member.paidAt), 'MMM d')}</span>
                      )}
                      {member.notifiedAt && member.status !== 'paid' && (
                        <span className="text-muted-custom text-xs flex items-center gap-1">
                          <Bell size={10} /> Notified {format(new Date(member.notifiedAt), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount + actions */}
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                    <p className="font-mono font-semibold text-primary-custom text-sm">
                      {expense.currency} {member.amount?.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-1">
                      {canNotify && (
                        <button
                          onClick={() => onNotifyMember?.(expense._id, member._id)}
                          className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-teal-500/10"
                          title="Send payment reminder"
                        >
                          <Bell size={11} /> Remind
                        </button>
                      )}
                      {canMarkPaid && (
                        <button
                          onClick={() => onMarkPaid(expense._id, member._id)}
                          className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-green-500/10"
                        >
                          <CheckCircle size={11} /> Mark paid
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      {expense.notes && (
        <div className="rounded-xl p-4" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <p className="text-xs text-muted-custom mb-1 font-medium uppercase tracking-wider">Notes</p>
          <p className="text-secondary-custom text-sm">{expense.notes}</p>
        </div>
      )}

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 text-xs text-muted-custom">
        <div>
          <span className="text-muted-custom opacity-60">Created</span><br />
          <span className="text-secondary-custom">{format(new Date(expense.createdAt || Date.now()), 'PPp')}</span>
        </div>
        {expense._isOffline && (
          <div>
            <span className="text-yellow-500 font-medium">⚡ Saved offline</span><br />
            <span className="text-muted-custom">Will sync when online</span>
          </div>
        )}
        {expense.localId && !expense._isOffline && (
          <div>
            <span className="opacity-60">Sync ID</span><br />
            <span className="font-mono opacity-50 truncate">{expense.localId.slice(0, 12)}…</span>
          </div>
        )}
      </div>
    </div>
  );
}
