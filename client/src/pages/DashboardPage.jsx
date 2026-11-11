import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  Receipt, Users, UserCheck, TrendingUp, TrendingDown,
  ArrowRight, Plus, Wallet, DollarSign, PiggyBank, Edit3, Check, X
} from 'lucide-react';
import { fetchExpenses, fetchBalanceSummary } from '../store/slices/expensesSlice';
import { fetchGroups } from '../store/slices/groupsSlice';
import { fetchConnections } from '../store/slices/connectionsSlice';
import { fetchNotifications } from '../store/slices/notificationsSlice';
import { saveMonthlyIncome } from '../store/slices/authSlice';
import { StatCard, SkeletonCard, PageHeader } from '../components/ui/index';
import { format, startOfMonth } from 'date-fns';

const CATEGORY_EMOJI = {
  food: '🍕', travel: '✈️', rent: '🏠', utilities: '⚡',
  entertainment: '🎮', health: '💊', shopping: '🛍️', other: '📦'
};

function InlineIncomeEditor({ value, loading, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(value ? String(value) : '');
    setEditing(true);
  };

  const handleSave = () => {
    const num = parseFloat(draft);
    if (!isNaN(num) && num >= 0) {
      onSave(num);
      setEditing(false);
    }
  };

  if (loading) {
    return <div className="w-4 h-4 border-2 border-teal-400/40 border-t-teal-400 rounded-full animate-spin mt-1" />;
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 mt-1">
        <span className="text-muted-custom text-sm">$</span>
        <input
          type="number" min="0" step="1" value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          className="input-field py-1 px-2 text-sm w-32"
          autoFocus
        />
        <button onClick={handleSave} className="p-1 rounded text-green-400 hover:text-green-300 transition-colors">
          <Check size={14} />
        </button>
        <button onClick={() => setEditing(false)} className="p-1 rounded text-muted-custom hover:text-red-400 transition-colors">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={startEdit}
      className="flex items-center gap-1 mt-1 text-muted-custom hover:text-teal-400 text-xs transition-colors group">
      <Edit3 size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
      {value > 0
        ? `$${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        : 'Set monthly income →'}
    </button>
  );
}

/**
 * Calculate how much of an expense the logged-in user is personally responsible for.
 *
 * Rules:
 *  - If user is the owner of an individual expense → full amount
 *  - If user is the owner of a group expense      → owner typically paid for others,
 *    so we do NOT count the group total (that would double-count with members).
 *    The owner's own share is: amount - sum(members.amount).
 *    But often the owner pays the full bill upfront and recovers from others, so
 *    owner's actual out-of-pocket = amount (but they get back recoveredAmount).
 *    For budget purposes: owner's net spend = totalAmount - recoveredAmount.
 *  - If user is a MEMBER (not owner)              → only their member.amount
 */
function getUserShare(expense, userId) {
  const isOwner =
    expense.ownerId === userId ||
    (typeof expense.ownerId === 'object' && expense.ownerId?._id === userId) ||
    expense.ownerId?.toString() === userId;

  if (isOwner) {
    if (!expense.members?.length) {
      // Pure personal expense
      return expense.amount || 0;
    }
    // Group expense owner: net out-of-pocket = total paid - amount recovered from members
    const recovered = expense.recoveredAmount || 0;
    return Math.max(0, (expense.totalAmount || expense.amount || 0) - recovered);
  }

  // User is a member — find their entry
  const myEntry = expense.members?.find(m => {
    const mid = m.userId?._id || m.userId;
    return mid === userId || mid?.toString() === userId;
  });

  return myEntry?.amount || 0;
}

export default function DashboardPage() {
  const dispatch = useDispatch();
  const { user, incomeLoading } = useSelector(s => s.auth);
  const { items: expenses, balance, loading: expLoading } = useSelector(s => s.expenses);
  const { items: groups } = useSelector(s => s.groups);
  const { items: connections } = useSelector(s => s.connections);
  const { unreadCount } = useSelector(s => s.notifications);

  useEffect(() => {
    dispatch(fetchExpenses({ limit: 50 }));
    dispatch(fetchBalanceSummary());
    dispatch(fetchGroups());
    dispatch(fetchConnections());
    dispatch(fetchNotifications({ limit: 5 }));
  }, [dispatch]);

  // ── Month-to-date personal spend (user's share only) ──────────────────────
  const monthStart = startOfMonth(new Date());
  const monthlySpend = expenses
    .filter(e => new Date(e.expenseDate) >= monthStart)
    .reduce((sum, e) => sum + getUserShare(e, user?._id), 0);

  const monthlyIncome = parseFloat(user?.monthlyIncome || 0);
  const remainingBal = monthlyIncome > 0 ? monthlyIncome - monthlySpend : null;
  const spendPct = monthlyIncome > 0 ? Math.min(100, (monthlySpend / monthlyIncome) * 100) : 0;

  const recentExpenses = expenses.slice(0, 5);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`Hello, ${user?.displayName || user?.username} 👋`}
        subtitle="Here's your financial snapshot"
        action={
          <Link to="/expenses" className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Expense
          </Link>
        }
      />

      {/* ── Monthly overview banner ──────────────────────────────────────── */}
      <div className="card bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-transparent border-teal-500/20">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">

          {/* Income */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <DollarSign size={14} className="text-teal-400" />
              <p className="text-xs font-semibold text-muted-custom uppercase tracking-wider">Monthly Income</p>
            </div>
            <p className="font-display text-2xl font-bold text-primary-custom">
              {monthlyIncome > 0
                ? `$${monthlyIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                : '—'}
            </p>
            <InlineIncomeEditor
              value={user?.monthlyIncome}
              loading={incomeLoading}
              onSave={v => dispatch(saveMonthlyIncome(v))}
            />
          </div>

          <div className="w-px h-14 hidden sm:block" style={{ background: 'var(--border)' }} />

          {/* Spent this month (user's share only) */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <TrendingDown size={14} className="text-red-400" />
              <p className="text-xs font-semibold text-muted-custom uppercase tracking-wider">My Spend This Month</p>
            </div>
            <p className="font-display text-2xl font-bold text-primary-custom">
              ${monthlySpend.toFixed(2)}
            </p>
            <p className="text-xs text-muted-custom mt-1">{format(new Date(), 'MMMM yyyy')} · your share only</p>
          </div>

          <div className="w-px h-14 hidden sm:block" style={{ background: 'var(--border)' }} />

          {/* Remaining */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <PiggyBank size={14} className={
                remainingBal !== null
                  ? remainingBal >= 0 ? 'text-green-400' : 'text-red-400'
                  : 'text-muted-custom'
              } />
              <p className="text-xs font-semibold text-muted-custom uppercase tracking-wider">Remaining Balance</p>
            </div>
            {remainingBal !== null ? (
              <>
                <p className={`font-display text-2xl font-bold ${remainingBal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {remainingBal < 0 ? '-' : ''}${Math.abs(remainingBal).toFixed(2)}
                </p>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      spendPct > 90 ? 'bg-red-500' : spendPct > 70 ? 'bg-yellow-500' : 'bg-teal-500'
                    }`}
                    style={{ width: `${spendPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-custom mt-0.5">{spendPct.toFixed(0)}% of income used</p>
              </>
            ) : (
              <p className="text-sm text-muted-custom mt-1">Set income above to track</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {expLoading ? (
          Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
        ) : (<>
          <StatCard label="You owe" value={`$${(balance?.youOwe || 0).toFixed(2)}`} icon={TrendingDown} color="red" />
          <StatCard label="You receive" value={`$${(balance?.youReceive || 0).toFixed(2)}`} icon={TrendingUp} color="green" />
          <StatCard label="Groups" value={groups.length} icon={Users} color="blue" sub="active groups" />
          <StatCard label="Connections" value={connections.length} icon={UserCheck} color="brand" sub="friends" />
        </>)}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Recent expenses */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Recent Expenses</h2>
            <Link to="/expenses" className="text-teal-400 hover:text-teal-300 text-sm flex items-center gap-1 transition-colors">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          {expLoading ? (
            <div className="space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
          ) : recentExpenses.length === 0 ? (
            <div className="text-center py-10">
              <Receipt size={32} className="text-muted-custom mx-auto mb-3" />
              <p className="text-muted-custom text-sm">No expenses yet</p>
              <Link to="/expenses" className="btn-primary inline-flex items-center gap-2 mt-4 text-sm">
                <Plus size={14} /> Add first expense
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentExpenses.map(exp => {
                const myShare = getUserShare(exp, user?._id);
                return (
                  <div key={exp._id} className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                    style={{ background: 'var(--bg-hover)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-input)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                      style={{ background: 'var(--bg-input)' }}>
                      {CATEGORY_EMOJI[exp.category] || '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-primary-custom font-medium text-sm truncate">{exp.description}</p>
                      <p className="text-muted-custom text-xs">
                        {format(new Date(exp.expenseDate), 'MMM d, yyyy')} · {exp.type.replace('_', ' ')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-mono font-semibold text-primary-custom text-sm">
                        {exp.currency} {exp.amount?.toFixed(2)}
                      </p>
                      {myShare !== exp.amount && (
                        <p className="text-xs text-teal-400 font-mono">
                          your share: {exp.currency} {myShare.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="card bg-gradient-to-br from-teal-500/10 to-teal-600/5 border-teal-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={16} className="text-teal-400" />
              <h3 className="text-sm font-semibold text-primary-custom">Net Balance</h3>
            </div>
            <p className={`font-display text-3xl font-bold ${
              (balance?.youReceive - balance?.youOwe) >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              ${Math.abs((balance?.youReceive || 0) - (balance?.youOwe || 0)).toFixed(2)}
            </p>
            <p className="text-muted-custom text-xs mt-1">
              {(balance?.youReceive - balance?.youOwe) >= 0 ? '✅ You are owed money' : '⚠️ You owe money overall'}
            </p>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary-custom">Your Groups</h3>
              <Link to="/groups" className="text-teal-400 text-xs hover:text-teal-300">See all</Link>
            </div>
            {groups.length === 0 ? (
              <p className="text-muted-custom text-sm text-center py-3">No groups yet</p>
            ) : (
              <div className="space-y-2">
                {groups.slice(0, 3).map(g => (
                  <div key={g._id} className="flex items-center gap-3 p-2 rounded-lg transition-colors"
                    style={{ background: 'var(--bg-hover)' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: g.avatarColor || '#14b8a6' }}>
                      {g.name?.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-secondary-custom text-sm font-medium truncate">{g.name}</p>
                      <p className="text-muted-custom text-xs">{g.members?.length || 0} members</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {unreadCount > 0 && (
            <Link to="/notifications"
              className="card border-teal-500/20 bg-teal-500/5 flex items-center gap-3 hover:bg-teal-500/10 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-teal-400 font-bold">{unreadCount}</span>
              </div>
              <div>
                <p className="text-secondary-custom text-sm font-medium">Unread notifications</p>
                <p className="text-muted-custom text-xs">Tap to view</p>
              </div>
              <ArrowRight size={16} className="ml-auto text-teal-400" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
