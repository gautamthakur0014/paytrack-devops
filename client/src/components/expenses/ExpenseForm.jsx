import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm, useFieldArray } from 'react-hook-form';
import { Minus, UserPlus, Users, WifiOff } from 'lucide-react';
import { createExpense, updateExpense } from '../../store/slices/expensesSlice';
import { v4 as uuidv4 } from 'uuid';

const CATEGORIES = ['food', 'travel', 'rent', 'utilities', 'entertainment', 'health', 'shopping', 'other'];
const TYPES = [
  { value: 'individual',   label: 'Personal',     desc: 'Just for you' },
  { value: 'equal_group',  label: 'Equal Split',  desc: 'Divide equally' },
  { value: 'custom_group', label: 'Custom Split',  desc: 'Set amounts' },
];

function generateId() {
  try { return uuidv4(); } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
}

export default function ExpenseForm({ expense, onSuccess }) {
  const dispatch = useDispatch();
  const isOnline = navigator.onLine;

  const { items: connections } = useSelector(s => s.connections);
  const { items: groups }      = useSelector(s => s.groups);
  const { user: currentUser }  = useSelector(s => s.auth);  // ← logged-in user
  const currentUserId = currentUser?._id;

  const isEdit = !!expense;
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, watch, control, setValue, formState: { errors } } = useForm({
    defaultValues: {
      description: expense?.description || '',
      amount:      expense?.amount      || '',
      currency:    expense?.currency    || 'USD',
      category:    expense?.category    || 'other',
      type:        expense?.type        || 'individual',
      groupId:     expense?.groupId?._id || expense?.groupId || '',
      expenseDate: expense?.expenseDate
        ? new Date(expense.expenseDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      notes:   expense?.notes || '',
      members: expense?.members?.map(m => ({
        userId:      m.userId?._id || m.userId || '',
        amount:      m.amount  || 0,
        status:      m.status  || 'added',
        displayName: m.displayName || m.userId?.displayName || '',
      })) || [],
    },
  });

  const { fields: memberFields, append, remove, replace } = useFieldArray({ control, name: 'members' });

  const expType         = watch('type');
  const selectedGroupId = watch('groupId');
  const amount          = parseFloat(watch('amount')) || 0;
  const watchedMembers  = watch('members');
  const memberCount     = memberFields.length + 1; // +1 for owner
  const equalShare      = memberCount > 1 ? (amount / memberCount).toFixed(2) : amount.toFixed(2);

  // IDs currently in the members list
  const addedUserIds = useMemo(
    () => new Set(watchedMembers.map(m => m.userId).filter(Boolean)),
    [watchedMembers]
  );

  // Connections not yet added (and never the logged-in user themselves)
  const availableConnections = useMemo(
    () => connections.filter(c => {
      const id = c._id || c.connectionId;
      return id && !addedUserIds.has(id) && id !== currentUserId;
    }),
    [connections, addedUserIds, currentUserId]
  );

  // The group object currently selected
  const selectedGroup = useMemo(
    () => groups.find(g => g._id === selectedGroupId),
    [groups, selectedGroupId]
  );

  // Clear members when switching to individual
  useEffect(() => {
    if (expType === 'individual') replace([]);
  }, [expType, replace]);

  /**
   * When a group is selected, auto-populate its members EXCLUDING the
   * logged-in user (who is always the payer/owner — they must not be in
   * the members array because:
   *   1. They can't be "connected" to themselves → validation would fail
   *   2. They're already counted as the +1 in equal split math
   */
  useEffect(() => {
    if (!selectedGroupId || expType === 'individual' || !selectedGroup) return;

    const grpMembers = (selectedGroup.members || [])
      .map(m => {
        // After .populate() userId is an object; in IDB it may be a plain string
        const uid         = m.userId?._id?.toString() || m.userId?.toString?.() || '';
        const displayName = m.userId?.displayName || m.userId?.username || m.displayName || '';
        return { uid, displayName };
      })
      .filter(({ uid }) => {
        // Exclude: empty IDs, the logged-in user, already-added members
        if (!uid) return false;
        if (uid === currentUserId) return false;          // ← key fix
        if (addedUserIds.has(uid)) return false;
        return true;
      })
      .map(({ uid, displayName }) => ({
        userId:      uid,
        displayName,
        amount:      0,
        status:      'added',
        _fromGroup:  true,
      }));

    if (grpMembers.length > 0) replace(grpMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId, currentUserId]);

  // Recalculate equal shares live
  useEffect(() => {
    if (expType !== 'equal_group' || !amount) return;
    const share = parseFloat((amount / memberCount).toFixed(2));
    memberFields.forEach((_, idx) => setValue(`members.${idx}.amount`, share));
  }, [amount, memberCount, expType]);

  const addSingleMember = () => {
    if (availableConnections.length === 0) return;
    const first = availableConnections[0];
    append({
      userId:      first._id || first.connectionId || '',
      displayName: first.displayName || first.username || '',
      amount:      parseFloat(equalShare),
      status:      'added',
    });
  };

  const onSubmit = async (formData) => {
    setLoading(true);
    try {
      const seen = new Set();
      const deduped = (formData.members || []).filter(m => {
        if (!m.userId || seen.has(m.userId)) return false;
        // Safety: never include the logged-in user in the members array sent to API
        if (m.userId === currentUserId) return false;
        seen.add(m.userId);
        return true;
      });

      const payload = {
        ...formData,
        amount:  parseFloat(formData.amount),
        groupId: formData.groupId || null,
        localId: isEdit ? expense.localId : generateId(),
        members: formData.type === 'individual' ? [] : deduped.map(m => ({
          userId: m.userId,
          amount: formData.type === 'equal_group'
            ? parseFloat((parseFloat(formData.amount) / (deduped.length + 1)).toFixed(2))
            : parseFloat(m.amount) || 0,
        })),
      };

      if (isEdit) {
        await dispatch(updateExpense({ id: expense._id, data: payload }));
      } else {
        await dispatch(createExpense(payload));
      }
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Type selector */}
      <div>
        <label className="label">Expense Type</label>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map(t => (
            <label key={t.value} className={`cursor-pointer p-3 rounded-xl border text-center transition-all ${
              watch('type') === t.value
                ? 'border-teal-500/50 bg-teal-500/10 text-teal-300'
                : 'text-muted-custom hover:opacity-80'
            }`} style={watch('type') !== t.value ? { border: '1px solid var(--border)' } : {}}>
              <input type="radio" value={t.value} {...register('type')} className="sr-only" />
              <p className="text-sm font-medium">{t.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{t.desc}</p>
            </label>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="label">Description *</label>
        <input type="text" placeholder="e.g. Dinner at restaurant"
          className={`input-field ${errors.description ? 'border-red-500/50' : ''}`}
          {...register('description', { required: 'Description is required', maxLength: { value: 200, message: 'Too long' } })}
        />
        {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
      </div>

      {/* Amount + Currency */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label">Amount *</label>
          <input type="number" step="0.01" min="0.01" placeholder="0.00"
            className={`input-field font-mono ${errors.amount ? 'border-red-500/50' : ''}`}
            {...register('amount', { required: 'Amount required', min: { value: 0.01, message: 'Must be positive' } })}
          />
          {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="label">Currency</label>
          <select className="input-field" {...register('currency')}>
            {['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Category + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Category</label>
          <select className="input-field" {...register('category')}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input-field" {...register('expenseDate')} />
        </div>
      </div>

      {/* ── Group expense section ───────────────────────────────────────── */}
      {expType !== 'individual' && (
        <>
          {/* Offline guard */}
          {!isOnline && connections.length === 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
              <WifiOff size={14} className="mt-0.5 flex-shrink-0" />
              <span>You're offline. Add connections first when back online to use group expense splitting.</span>
            </div>
          )}

          {/* Group selector */}
          {groups.length > 0 && (
            <div>
              <label className="label flex items-center gap-1.5">
                <Users size={13} /> Group (optional)
              </label>
              <select className="input-field" {...register('groupId')}>
                <option value="">No group — add members manually</option>
                {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
              </select>

              {/* Selected group chip */}
              {selectedGroup && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border border-teal-500/20"
                  style={{ background: 'rgba(20,184,166,0.06)' }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: selectedGroup.avatarColor || '#14b8a6' }}>
                    {selectedGroup.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-teal-400">{selectedGroup.name}</span>
                  <span className="text-xs text-muted-custom ml-auto">
                    {selectedGroup.members?.length || 0} members · auto-populated below
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Members list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">
                Members
                {memberFields.length > 0 && (
                  <span className="ml-2 text-muted-custom font-normal text-xs">({memberFields.length} added)</span>
                )}
              </label>
              {expType === 'equal_group' && amount > 0 && (
                <span className="text-xs text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  ${equalShare} each ({memberCount} people)
                </span>
              )}
            </div>

            <div className="space-y-2">
              {memberFields.map((field, idx) => {
                const currentVal  = watchedMembers[idx]?.userId;
                const displayName = watchedMembers[idx]?.displayName;
                const fromGroup   = watchedMembers[idx]?._fromGroup;

                // Check if this member is the current user (shouldn't happen after filtering, but guard anyway)
                const isCurrentUser = currentVal === currentUserId;

                // For dropdown: show current selection + un-picked connections (not the current user)
                const rowOptions = connections.filter(c => {
                  const id = c._id || c.connectionId;
                  return id !== currentUserId && (id === currentVal || !addedUserIds.has(id));
                });

                if (isCurrentUser) return null; // should never render, but safety net

                return (
                  <div key={field.id} className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>

                    {/* Avatar initial */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 bg-teal-600">
                      {(displayName || '?').slice(0, 1).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      {fromGroup ? (
                        // Group member pre-populated — show name as static text
                        <p className="text-sm text-primary-custom font-medium truncate">
                          {displayName || currentVal}
                          <span className="ml-2 text-xs text-teal-400 font-normal">from group</span>
                        </p>
                      ) : (
                        <select
                          className="input-field text-sm py-1.5"
                          {...register(`members.${idx}.userId`, { required: 'Select a member' })}
                        >
                          <option value="">Select connection</option>
                          {rowOptions.map(c => (
                            <option key={c._id || c.connectionId} value={c._id || c.connectionId}>
                              {c.displayName || c.username}
                            </option>
                          ))}
                        </select>
                      )}
                      {errors.members?.[idx]?.userId && (
                        <p className="text-red-400 text-xs mt-1">{errors.members[idx].userId.message}</p>
                      )}
                    </div>

                    {expType === 'custom_group' && (
                      <input type="number" step="0.01" min="0" placeholder="Amount"
                        className="input-field w-28 text-sm font-mono py-1.5"
                        {...register(`members.${idx}.amount`, { min: 0 })}
                      />
                    )}
                    {expType === 'equal_group' && (
                      <span className="text-sm font-mono text-muted-custom w-20 text-right flex-shrink-0">
                        ${equalShare}
                      </span>
                    )}

                    <button type="button" onClick={() => remove(idx)}
                      className="text-muted-custom hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg flex-shrink-0 transition-colors">
                      <Minus size={15} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Add member button / empty states */}
            {!isOnline && connections.length === 0 ? (
              <div className="mt-2 flex items-center gap-2 justify-center py-3 rounded-xl border border-dashed border-yellow-500/30 text-yellow-500 text-sm">
                <WifiOff size={14} /> Go online to add connections
              </div>
            ) : availableConnections.length > 0 ? (
              <button type="button" onClick={addSingleMember}
                className="mt-2 btn-ghost text-sm flex items-center gap-2 w-full justify-center border border-dashed border-teal-500/20 hover:border-teal-500/40 py-2.5">
                <UserPlus size={15} />
                Add member
                <span className="text-muted-custom text-xs">({availableConnections.length} available)</span>
              </button>
            ) : connections.length === 0 ? (
              <p className="mt-2 text-center text-muted-custom text-sm py-3 rounded-xl border border-dashed"
                style={{ borderColor: 'var(--border)' }}>
                Add connections first to split expenses
              </p>
            ) : (
              <p className="mt-2 text-center text-muted-custom text-sm py-3 rounded-xl border border-dashed"
                style={{ borderColor: 'var(--border)' }}>
                All connections already added
              </p>
            )}
          </div>
        </>
      )}

      {/* Notes */}
      <div>
        <label className="label">Notes (optional)</label>
        <textarea rows={2} placeholder="Any additional notes…" className="input-field resize-none"
          {...register('notes', { maxLength: { value: 500, message: 'Max 500 chars' } })}
        />
      </div>

      <button type="submit" disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2">
        {loading
          ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : (isEdit ? 'Update Expense' : 'Add Expense')}
      </button>
    </form>
  );
}
