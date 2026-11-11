import { useEffect, useState, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Plus, Search, Filter, Trash2, Edit2, Bell, CheckCircle,
  ChevronLeft, ChevronRight, Receipt, Lock, TrendingDown,
  CloudOff, X, Calendar
} from 'lucide-react';
import {
  fetchExpenses, deleteExpense, markMemberPaid,
  notifyMembers, setFilters, setPage, clearFilters
} from '../store/slices/expensesSlice';
import { fetchGroups } from '../store/slices/groupsSlice';
import { PageHeader, EmptyState, Spinner } from '../components/ui/index';
import Modal from '../components/ui/Modal';
import ExpenseForm from '../components/expenses/ExpenseForm';
import ExpenseDetail from '../components/expenses/ExpenseDetail';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const CATEGORY_EMOJI = {
  food: '🍕', travel: '✈️', rent: '🏠', utilities: '⚡',
  entertainment: '🎮', health: '💊', shopping: '🛍️', other: '📦'
};

const CATEGORIES = ['food', 'travel', 'rent', 'utilities', 'entertainment', 'health', 'shopping', 'other'];
const TYPES = [
  { value: 'individual',   label: 'Personal' },
  { value: 'equal_group',  label: 'Equal Split' },
  { value: 'custom_group', label: 'Custom Split' },
];

// ── Date helpers ──────────────────────────────────────────────────────────────
const thisYear  = new Date().getFullYear();
const thisMonth = new Date().getMonth() + 1;

function monthLabel(year, month) {
  return format(new Date(year, month - 1), 'MMMM yyyy');
}

/**
 * Returns how much of this expense the logged-in user personally owes/paid.
 * - Owner, no members  → full amount
 * - Owner, has members → totalAmount − recoveredAmount (net out-of-pocket)
 * - Member (not owner) → their member.amount entry
 */
function getUserShare(expense, userId) {
  const isOwner =
    expense.ownerId === userId ||
    (typeof expense.ownerId === 'object' && expense.ownerId?._id === userId) ||
    expense.ownerId?.toString() === userId;

  if (isOwner) {
    if (!expense.members?.length) return expense.amount || 0;
    return Math.max(0, (expense.totalAmount || expense.amount || 0) - (expense.recoveredAmount || 0));
  }
  const myEntry = expense.members?.find(m => {
    const mid = m.userId?._id || m.userId;
    return mid === userId || mid?.toString() === userId;
  });
  return myEntry?.amount || 0;
}

// ── Filter mode options ───────────────────────────────────────────────────────
// 'month' = single month picker  |  'range' = from-date to-date
const FILTER_MODES = ['month', 'range'];

export default function ExpensesPage() {
  const dispatch = useDispatch();
  const { items, pagination, loading, filters } = useSelector(s => s.expenses);
  const { user } = useSelector(s => s.auth);

  const [showForm,     setShowForm]     = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [search,       setSearch]       = useState('');
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [filterMode,   setFilterMode]   = useState('month'); // 'month' | 'range'
  const [status,   setStatus]   = useState('you owe');

  // Local range state (not dispatched until both dates are set)
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo,   setRangeTo]   = useState('');

  // Fetch when filters change
  useEffect(() => {
    dispatch(fetchExpenses(filters));
    dispatch(fetchGroups());
  }, [dispatch, filters]);

  // ── Summary ───────────────────────────────────────────────────────────────
  const { pageTotal, hasShared } = useMemo(() => {
    let total = 0, shared = false;
    items.forEach(e => {
      total += getUserShare(e, user?._id);
      if (e.members?.length > 0) shared = true;
    });
    return { pageTotal: total, hasShared: shared };
  }, [items, user?._id]);

  const isFiltered = !!(filters.category || filters.type || filters.month || filters.startDate);

  const periodLabel = useMemo(() => {
    if (filters.startDate && filters.endDate) {
      return `${format(new Date(filters.startDate), 'MMM d, yyyy')} – ${format(new Date(filters.endDate), 'MMM d, yyyy')}`;
    }
    if (filters.year && filters.month) return monthLabel(filters.year, filters.month);
    return 'all time';
  }, [filters]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSearch = (e) => {
    setSearch(e.target.value);
    if (e.target.value.length === 0 || e.target.value.length >= 2) {
      dispatch(setFilters({ search: e.target.value || undefined }));
    }
  };

  // !! KEY FIX: use setPage not setFilters for pagination !!
  const handlePage = (p) => {
    dispatch(setPage(p));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return;
    dispatch(deleteExpense(id));
  };

  const handleMarkPaid = (expId, membId) => {
    dispatch(markMemberPaid({ expenseId: expId, memberId: membId }));
    setDetailTarget(null);
  };

  const handleMonthChange = (e) => {
    if (!e.target.value) return;
    const [y, m] = e.target.value.split('-');
    dispatch(setFilters({ year: y, month: m, startDate: undefined, endDate: undefined }));
  };

  const handleRangeApply = () => {
    if (!rangeFrom || !rangeTo) return;
    dispatch(setFilters({
      startDate: rangeFrom,
      endDate:   rangeTo,
      year:      undefined,
      month:     undefined,
    }));
  };

  const handleClearFilters = () => {
    dispatch(clearFilters()); // resets to current month
    setSearch('');
    setRangeFrom('');
    setRangeTo('');
    setFilterMode('month');
  };

  const currentMonthValue = filters.year && filters.month
    ? `${filters.year}-${String(filters.month).padStart(2, '0')}`
    : `${thisYear}-${String(thisMonth).padStart(2, '0')}`;

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Expenses"
        subtitle={`${pagination?.total || 0} expense${pagination?.total !== 1 ? 's' : ''} · ${periodLabel}`}
        action={
          <button onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Expense
          </button>
        }
      />

      {/* ── Summary bar ──────────────────────────────────────────────────── */}
      <div className="card flex items-center justify-between gap-4 py-3.5"
        style={{ background: 'linear-gradient(to right, rgba(20,184,166,0.08), transparent)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 flex items-center justify-center flex-shrink-0">
            <TrendingDown size={16} className="text-teal-400" />
          </div>
          <div>
            <p className="text-xs text-muted-custom font-medium uppercase tracking-wider">
              My total · {periodLabel}
              {hasShared && <span className="text-teal-400 normal-case ml-1">(your share)</span>}
            </p>
            <p className="font-display font-bold text-2xl text-primary-custom">
              ₹{pageTotal.toFixed(2)}
            </p>
          </div>
        </div>
        {pagination?.total && pagination.total > items.length && (
          <p className="text-xs text-muted-custom hidden sm:block text-right">
            Showing {items.length} of {pagination.total}<br />
            <span className="text-teal-400">page {filters.page} of {pagination.totalPages}</span>
          </p>
        )}
      </div>

      {/* ── Search + filter toggle ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-custom" />
          <input type="text" placeholder="Search expenses…" value={search}
            onChange={handleSearch} className="input-field pl-10" />
        </div>
        <button onClick={() => setFilterOpen(f => !f)}
          className={`btn-secondary flex items-center gap-2 ${filterOpen ? 'border-teal-500/40 text-teal-400' : ''}`}>
          <Filter size={15} /> Filters
          {isFiltered && <span className="w-1.5 h-1.5 bg-teal-500 rounded-full" />}
        </button>
      </div>

      {/* ── Filter panel ─────────────────────────────────────────────────── */}
      {filterOpen && (
        <div className="card animate-slide-down space-y-4">
          {/* Row 1: category + type */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label text-xs">Category</label>
              <select className="input-field text-sm" value={filters.category || ''}
                onChange={e => dispatch(setFilters({ category: e.target.value || undefined }))}>
                <option value="">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_EMOJI[c]} {c}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs">Type</label>
              <select className="input-field text-sm" value={filters.type || ''}
                onChange={e => dispatch(setFilters({ type: e.target.value || undefined }))}>
                <option value="">All types</option>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Date mode toggle */}
            <div className="col-span-2 sm:col-span-2 flex flex-col justify-end">
              <label className="label text-xs flex items-center gap-1.5">
                <Calendar size={12} /> Date filter
              </label>
              <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                {FILTER_MODES.map(mode => (
                  <button key={mode} type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
                      filterMode === mode
                        ? 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
                        : 'text-muted-custom hover:text-secondary-custom'
                    }`}>
                    {mode === 'month' ? 'By Month' : 'Date Range'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: date filter */}
          {filterMode === 'month' ? (
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="label text-xs">Month</label>
                <input type="month" className="input-field text-sm"
                  value={currentMonthValue}
                  onChange={handleMonthChange}
                />
              </div>
              <button className="btn-ghost text-sm px-4 py-2.5 flex-shrink-0" onClick={handleClearFilters}>
                <X size={14} className="inline mr-1" />Clear
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="flex-1">
                <label className="label text-xs">From</label>
                <input type="date" className="input-field text-sm"
                  value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="label text-xs">To</label>
                <input type="date" className="input-field text-sm"
                  value={rangeTo} onChange={e => setRangeTo(e.target.value)} />
              </div>
              <button
                onClick={handleRangeApply}
                disabled={!rangeFrom || !rangeTo}
                className="btn-primary text-sm px-4 py-2.5 flex-shrink-0 disabled:opacity-40">
                Apply range
              </button>
              <button className="btn-ghost text-sm px-3 py-2.5 flex-shrink-0" onClick={handleClearFilters}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Active filter chips */}
          {isFiltered && (
            <div className="flex flex-wrap gap-2 pt-1">
              {filters.category && (
                <span className="badge badge-brand text-xs flex items-center gap-1">
                  {CATEGORY_EMOJI[filters.category]} {filters.category}
                  <button onClick={() => dispatch(setFilters({ category: undefined }))}><X size={10} /></button>
                </span>
              )}
              {filters.type && (
                <span className="badge badge-blue text-xs flex items-center gap-1">
                  {TYPES.find(t => t.value === filters.type)?.label}
                  <button onClick={() => dispatch(setFilters({ type: undefined }))}><X size={10} /></button>
                </span>
              )}
              {filters.startDate && (
                <span className="badge badge-yellow text-xs flex items-center gap-1">
                  📅 {format(new Date(filters.startDate), 'MMM d')} – {format(new Date(filters.endDate), 'MMM d, yyyy')}
                  <button onClick={() => { dispatch(setFilters({ startDate: undefined, endDate: undefined })); setRangeFrom(''); setRangeTo(''); }}><X size={10} /></button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Expenses list ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No expenses found"
          description={isFiltered ? "No expenses match your filters" : "Add your first expense to get started"}
          action={
            <div className="flex gap-2">
              {isFiltered && (
                <button onClick={handleClearFilters} className="btn-secondary flex items-center gap-2">
                  <X size={14} /> Clear filters
                </button>
              )}
              <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
                <Plus size={16} /> Add Expense
              </button>
            </div>
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map(exp => {
            const isOwner =
              exp.ownerId === user?._id ||
              (typeof exp.ownerId === 'object' && exp.ownerId?._id === user?._id) ||
              exp.ownerId?.toString() === user?._id;

            const myMemberEntry = !isOwner
              ? exp.members?.find(m => {
                  const mid = m.userId?._id || m.userId;
                  return mid === user?._id || mid?.toString() === user?._id;
                })
              : null;

            const myShare    = getUserShare(exp, user?._id);
            const sharesDiff = exp.members?.length > 0 && Math.abs(myShare - (exp.amount || 0)) > 0.01;

            return (
              <div key={exp._id}
                className={`card hover:border-teal-500/20 transition-all group cursor-pointer  ${
                  !isOwner ? 'border-teal-500/10' : ''
                } ${exp._isOffline ? 'border-yellow-500/30' : ''}`}
                onClick={() => setDetailTarget(exp)}>
{/* ${myMemberEntry?.status === 'paid'
  ? 'bg-brand-600'
  : myMemberEntry?.status === undefined
  ? ' '
  : 'bg-yellow-500'} */}
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: 'var(--bg-input)' }}>
                    {CATEGORY_EMOJI[exp.category] || '📦'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-primary-custom font-medium truncate">{exp.description}</p>
                          {!isOwner && <span className="badge badge-yellow text-xs flex-shrink-0">shared</span>}
                          {exp._isOffline && (
                            <span className="badge text-xs flex-shrink-0 bg-yellow-500/10 text-yellow-500 border-yellow-500/20 flex items-center gap-1">
                              <CloudOff size={10} /> offline
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-muted-custom text-xs">
                            {format(new Date(exp.expenseDate), 'MMM d, yyyy')}
                          </span>
                          <span className={`badge text-xs ${
                            exp.type === 'individual' ? 'badge-blue' :
                            exp.type === 'equal_group' ? 'badge-brand' : 'badge-yellow'
                          }`}>{exp.type.replace('_', ' ')}</span>
                          {exp.groupId && <span className="badge badge-green text-xs">group</span>}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="font-mono font-bold text-primary-custom">
                          {exp.currency} {exp.amount?.toFixed(2)}
                        </p>
                        {sharesDiff && (
                          <p className="text-xs font-mono text-teal-400 mt-0.5">
                            my share: {exp.currency} {myShare.toFixed(2)}
                          </p>
                        )}
                        {myMemberEntry && (
                          <p className="text-xs mt-0.5">
                            <span className={myMemberEntry.status === 'paid' ? 'text-green-400 font-bold ' : 'text-yellow-500'}>
                              {exp.currency} {myMemberEntry.amount?.toFixed(2)} 
                              {myMemberEntry.status === 'paid' ? ' ✓ PAID': ': to be Paid'}
                            </span>
                          </p>
                        )}
                        {isOwner && exp.members?.length > 0 && (
                          <p className="text-xs text-muted-custom mt-0.5">
                            {(exp.recoveredAmount || 0).toFixed(2)} / {(exp.totalAmount || 0).toFixed(2)} recovered
                          </p>
                        )}
                      </div>
                    </div>

                    {exp.members?.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex -space-x-1.5">
                          {exp.members.slice(0, 4).map((m, i) => (
                            <div key={i}
                              className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ backgroundColor: m.avatarColor || m.userId?.avatarColor || '#64748b', borderColor: 'var(--bg-card)' }}>
                              {(m.displayName || m.userId?.displayName || '?').slice(0, 1)}
                            </div>
                          ))}
                        </div>
                        <span className="text-muted-custom text-xs">
                          {exp.members.length} member{exp.members.length !== 1 ? 's' : ''}
                        </span>
                        <span className={`text-xs ${exp.isFullySettled ? 'text-green-400' : 'text-yellow-500'}`}>
                          {exp.isFullySettled ? '✓ Settled' : `${exp.members.filter(m => m.status !== 'paid').length} pending`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hover actions */}
                <div
                  className="mt-3 pt-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ borderTop: '1px solid var(--border-subtle)' }}
                  onClick={e => e.stopPropagation()}>
                  {isOwner ? (
                    <>
                      <button onClick={() => { setEditTarget(exp); setShowForm(true); }}
                        className="btn-ghost text-xs flex items-center gap-1.5 py-1.5">
                        <Edit2 size={13} /> Edit
                      </button>
                      {exp.members?.some(m => m.status !== 'paid') && !exp._isOffline && (
                        <button onClick={() => dispatch(notifyMembers(exp._id))}
                          className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 text-teal-400 hover:text-teal-300">
                          <Bell size={13} /> Notify
                        </button>
                      )}
                      <button onClick={() => handleDelete(exp._id)}
                        className="btn-danger text-xs flex items-center gap-1.5 py-1.5 ml-auto">
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  ) : (
                    <>
                      {myMemberEntry && myMemberEntry.status !== 'paid' && (
                        <button onClick={() => handleMarkPaid(exp._id, myMemberEntry._id)}
                          className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 text-green-400 hover:text-green-300">
                          <CheckCircle size={13} /> Mark as Paid
                        </button>
                      )}
                      {myMemberEntry?.status === 'paid' && (
                        <span className="text-xs text-green-400 flex items-center gap-1.5 py-1.5 px-2">
                          <CheckCircle size={13} /> Paid
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-xs text-muted-custom">
                        <Lock size={11} /> View only
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination ────────────────────────────────────────────────────── */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={filters.page <= 1}
            onClick={() => handlePage(filters.page - 1)}
            className="btn-secondary p-2 disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>

          {/* Page number pills */}
          <div className="flex items-center gap-1">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === pagination.totalPages || Math.abs(p - filters.page) <= 1)
              .reduce((acc, p, i, arr) => {
                if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '…' ? (
                  <span key={`ellipsis-${i}`} className="text-muted-custom text-sm px-1">…</span>
                ) : (
                  <button key={p} onClick={() => handlePage(p)}
                    className={`w-9 h-9 rounded-xl text-sm font-medium transition-all ${
                      p === filters.page
                        ? 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
                        : 'text-muted-custom hover:text-secondary-custom'
                    }`}
                    style={p !== filters.page ? { background: 'var(--bg-input)' } : {}}>
                    {p}
                  </button>
                )
              )}
          </div>

          <button
            disabled={!pagination.hasMore}
            onClick={() => handlePage(filters.page + 1)}
            className="btn-secondary p-2 disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditTarget(null); }}
        title={editTarget ? 'Edit Expense' : 'New Expense'} size="lg">
        <ExpenseForm
          expense={editTarget}
          onSuccess={() => {
            setShowForm(false);
            setEditTarget(null);
            dispatch(fetchExpenses(filters));
          }}
        />
      </Modal>

      <Modal open={!!detailTarget} onClose={() => setDetailTarget(null)} title="Expense Details" size="lg">
        {detailTarget && (
          <ExpenseDetail
            expense={detailTarget}
            currentUserId={user?._id}
            onMarkPaid={handleMarkPaid}
            onNotifyMember={(expId) => dispatch(notifyMembers(expId))}
          />
        )}
      </Modal>
    </div>
  );
}
