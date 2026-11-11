import { useEffect, useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, LabelList
} from 'recharts';
import {
  TrendingUp, TrendingDown, BarChart2, PieChart as PieIcon,
  Award, AlertCircle, ArrowUpRight, ArrowDownRight, Target,
  Calendar, Zap
} from 'lucide-react';
import { expenseAPI } from '../services/api';
import { PageHeader, Spinner } from '../components/ui/index';
import { format, subMonths, eachDayOfInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { useTheme } from '../context/ThemeContext';

const CATEGORY_COLORS = {
  food: '#14b8a6', travel: '#3b82f6', rent: '#8b5cf6',
  utilities: '#f59e0b', entertainment: '#ec4899', health: '#10b981',
  shopping: '#f97316', other: '#64748b',
};
const CATEGORY_EMOJI = {
  food: '🍕', travel: '✈️', rent: '🏠', utilities: '⚡',
  entertainment: '🎮', health: '💊', shopping: '🛍️', other: '📦',
};
const CURRENCY_SYMBOL = { INR: '₹', USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', JPY: '¥' };

function fmtAmt(v, currency = 'INR') {
  const sym = CURRENCY_SYMBOL[currency] || currency + ' ';
  if (v >= 100000) return `${sym}${(v / 100000).toFixed(1)}L`;
  if (v >= 1000)   return `${sym}${(v / 1000).toFixed(1)}K`;
  return `${sym}${v.toFixed(0)}`;
}

// ── Tooltip components ────────────────────────────────────────────────────────
function AreaTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2.5 shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold text-muted-custom mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-6">
          <span className="text-xs" style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-bold text-sm text-primary-custom">
            {CURRENCY_SYMBOL[currency] || ''}{p.value?.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2.5 shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p className="text-xs text-muted-custom mb-1">{label}</p>
      <p className="font-mono font-bold text-teal-400">
        {CURRENCY_SYMBOL[currency] || ''}{payload[0]?.value?.toLocaleString('en-IN')}
      </p>
      {payload[1] && (
        <p className="text-xs text-muted-custom">{payload[1].value} transactions</p>
      )}
    </div>
  );
}

function PieTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-xl px-3 py-2.5 shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-0.5">
        <span>{CATEGORY_EMOJI[p.name]}</span>
        <span className="text-sm font-medium text-primary-custom capitalize">{p.name}</span>
      </div>
      <p className="font-mono font-bold text-sm" style={{ color: p.payload.fill }}>
        {CURRENCY_SYMBOL[currency] || ''}{p.value?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </p>
      <p className="text-xs text-muted-custom">{p.payload.pct}% of total</p>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, color, title, value, sub, trend }) {
  const palette = {
    teal:   { bg: 'rgba(20,184,166,0.1)',  text: '#14b8a6', border: 'rgba(20,184,166,0.2)' },
    blue:   { bg: 'rgba(59,130,246,0.1)',  text: '#3b82f6', border: 'rgba(59,130,246,0.2)' },
    green:  { bg: 'rgba(34,197,94,0.1)',   text: '#22c55e', border: 'rgba(34,197,94,0.2)' },
    red:    { bg: 'rgba(239,68,68,0.1)',   text: '#ef4444', border: 'rgba(239,68,68,0.2)' },
    yellow: { bg: 'rgba(245,158,11,0.1)',  text: '#f59e0b', border: 'rgba(245,158,11,0.2)' },
    purple: { bg: 'rgba(168,85,247,0.1)',  text: '#a855f7', border: 'rgba(168,85,247,0.2)' },
  };
  const c = palette[color] || palette.teal;
  return (
    <div className="card flex items-start gap-3" style={{ borderColor: c.border }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
        <Icon size={18} style={{ color: c.text }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-muted-custom text-xs font-medium uppercase tracking-wider leading-none">{title}</p>
        <p className="font-display font-bold text-xl text-primary-custom mt-1 leading-none">{value}</p>
        {sub && (
          <p className={`text-xs mt-1 flex items-center gap-1 ${
            trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-green-400' : 'text-muted-custom'
          }`}>
            {trend === 'up' && <ArrowUpRight size={11} />}
            {trend === 'down' && <ArrowDownRight size={11} />}
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Period presets ────────────────────────────────────────────────────────────
const PRESETS = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
];

export default function AnalyticsPage() {
  const { user }  = useSelector(s => s.auth);
  const { isDark } = useTheme?.() || { isDark: true };

  const currency = user?.currency || 'INR';
  const sym      = CURRENCY_SYMBOL[currency] || '';

  // ── Filter state ──────────────────────────────────────────────────────────
  const [preset,    setPreset]    = useState(3);           // preset months
  const [rangeMode, setRangeMode] = useState(false);       // custom date range
  const [fromDate,  setFromDate]  = useState('');
  const [toDate,    setToDate]    = useState('');

  const [loading, setLoading] = useState(true);
  const [data,    setData]    = useState({ trend: [], categories: [], balance: null, rawExpenses: [] });

  const axisColor = isDark ? '#475569' : '#94a3b8';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';

  // ── Derived filter bounds ─────────────────────────────────────────────────
  const { startDate, endDate, months } = useMemo(() => {
    if (rangeMode && fromDate && toDate) {
      return { startDate: fromDate, endDate: toDate, months: null };
    }
    const now = new Date();
    const start = subMonths(startOfMonth(now), preset - 1);
    return {
      startDate: format(start, 'yyyy-MM-dd'),
      endDate:   format(endOfMonth(now), 'yyyy-MM-dd'),
      months:    preset,
    };
  }, [preset, rangeMode, fromDate, toDate]);

  useEffect(() => { loadAnalytics(); }, [startDate, endDate]);

  const loadAnalytics = async () => {
    if (rangeMode && (!fromDate || !toDate)) return;
    setLoading(true);
    try {
      // Fetch all expenses in range (up to 500)
      const { data: expData } = await expenseAPI.list({
        startDate, endDate, limit: 500, page: 1
      });
      const rawExpenses = expData.data?.expenses || [];

      // ── Monthly trend buckets ────────────────────────────────────────────
      const bucketMap = {};
      rawExpenses.forEach(e => {
        const d   = new Date(e.expenseDate);
        const key = format(d, 'MMM yy');
        if (!bucketMap[key]) bucketMap[key] = { label: key, total: 0, count: 0 };
        bucketMap[key].total += e.amount || 0;
        bucketMap[key].count += 1;
      });

      // Generate all month labels in range so empty months still appear
      const allMonths = [];
      const s = new Date(startDate);
      const e = new Date(endDate);
      let cur = startOfMonth(s);
      while (cur <= e) {
        allMonths.push(format(cur, 'MMM yy'));
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      }

      const trend = allMonths.map(label => ({
        label,
        total: parseFloat((bucketMap[label]?.total || 0).toFixed(2)),
        count: bucketMap[label]?.count || 0,
      }));

      // ── Category breakdown ───────────────────────────────────────────────
      const catMap = {};
      rawExpenses.forEach(e => {
        const cat = e.category || 'other';
        catMap[cat] = (catMap[cat] || 0) + (e.amount || 0);
      });
      const catTotal = Object.values(catMap).reduce((a, b) => a + b, 0);
      const categories = Object.entries(catMap)
        .map(([name, value]) => ({
          name,
          value: parseFloat(value.toFixed(2)),
          pct:   catTotal > 0 ? ((value / catTotal) * 100).toFixed(1) : '0',
        }))
        .sort((a, b) => b.value - a.value);

      // ── Balance ──────────────────────────────────────────────────────────
      const { data: balData } = await expenseAPI.balanceSummary();

      setData({ trend, categories, balance: balData.data, rawExpenses });
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Computed stats ────────────────────────────────────────────────────────
  const totalSpent  = data.trend.reduce((s, d) => s + d.total, 0);
  const totalTx     = data.trend.reduce((s, d) => s + d.count, 0);
  const avgMonthly  = data.trend.filter(d => d.total > 0).length > 0
    ? totalSpent / data.trend.filter(d => d.total > 0).length : 0;

  const lastMonth = data.trend[data.trend.length - 1]?.total || 0;
  const prevMonth = data.trend[data.trend.length - 2]?.total || 0;
  const momChange = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth) * 100 : 0;

  const topCategory = data.categories[0];
  const income      = parseFloat(user?.monthlyIncome || 0);
  const savingsRate = income > 0 ? Math.max(0, ((income - avgMonthly) / income) * 100) : null;

  // ── Daily spend (for mini sparkline) ─────────────────────────────────────
  const dailyData = useMemo(() => {
    const map = {};
    data.rawExpenses.forEach(e => {
      const d = format(new Date(e.expenseDate), 'MMM d');
      map[d] = (map[d] || 0) + (e.amount || 0);
    });
    return Object.entries(map)
      .map(([label, amt]) => ({ label, amt: parseFloat(amt.toFixed(0)) }))
      .sort((a, b) => new Date(a.label) - new Date(b.label))
      .slice(-30); // last 30 data points
  }, [data.rawExpenses]);

  // Avg line for bar chart
  const avgSpend = totalTx > 0 ? Math.round(totalSpent / totalTx) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Header + period controls ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary-custom">Insights</h1>
          <p className="text-muted-custom text-sm mt-0.5">
            {rangeMode && fromDate && toDate
              ? `${format(new Date(fromDate), 'MMM d, yyyy')} – ${format(new Date(toDate), 'MMM d, yyyy')}`
              : `Last ${preset} month${preset > 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex flex-col gap-2 items-end">
          {/* Preset tabs */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            {PRESETS.map(p => (
              <button key={p.label}
                onClick={() => { setPreset(p.months); setRangeMode(false); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  !rangeMode && preset === p.months
                    ? 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
                    : 'text-muted-custom hover:text-secondary-custom'
                }`}>{p.label}</button>
            ))}
            <button
              onClick={() => setRangeMode(r => !r)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                rangeMode
                  ? 'bg-teal-500/15 text-teal-400 border border-teal-500/20'
                  : 'text-muted-custom hover:text-secondary-custom'
              }`}>
              <Calendar size={13} /> Range
            </button>
          </div>

          {/* Custom range picker */}
          {rangeMode && (
            <div className="flex items-center gap-2 animate-slide-up">
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="input-field text-sm py-2 px-3" />
              <span className="text-muted-custom text-sm">to</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                min={fromDate}
                className="input-field text-sm py-2 px-3" />
              <button
                onClick={loadAnalytics}
                disabled={!fromDate || !toDate}
                className="btn-primary text-sm px-4 py-2 disabled:opacity-40">
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={BarChart2} color="teal"
          title="Total spent"
          value={fmtAmt(totalSpent, currency)}
          sub={`${totalTx} transactions`}
        />
        <KpiCard
          icon={Target} color="blue"
          title="Monthly avg"
          value={fmtAmt(avgMonthly, currency)}
          sub="per active month"
        />
        <KpiCard
          icon={momChange >= 0 ? TrendingUp : TrendingDown}
          color={momChange > 10 ? 'red' : momChange < -10 ? 'green' : 'yellow'}
          title="vs prev month"
          value={`${momChange >= 0 ? '+' : ''}${momChange.toFixed(1)}%`}
          sub={`${sym}${lastMonth.toLocaleString('en-IN', { maximumFractionDigits: 0 })} this month`}
          trend={momChange > 5 ? 'up' : momChange < -5 ? 'down' : undefined}
        />
        {savingsRate !== null ? (
          <KpiCard
            icon={Award}
            color={savingsRate >= 30 ? 'green' : savingsRate >= 15 ? 'yellow' : 'red'}
            title="Savings rate"
            value={`${savingsRate.toFixed(0)}%`}
            sub={savingsRate >= 20 ? '👏 Great job!' : 'Could improve'}
          />
        ) : (
          <KpiCard
            icon={TrendingDown} color="red"
            title="You owe"
            value={fmtAmt(data.balance?.youOwe || 0, currency)}
            sub="outstanding"
          />
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Spinner size={32} />
          <p className="text-muted-custom text-sm">Crunching your numbers…</p>
        </div>
      ) : totalTx === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <AlertCircle size={36} className="text-muted-custom" />
          <p className="text-secondary-custom font-medium">No expenses in this period</p>
          <p className="text-muted-custom text-sm">Try selecting a different date range</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Monthly spending trend (area) ──────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(20,184,166,0.1)' }}>
                  <TrendingUp size={16} className="text-teal-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary-custom text-sm">Monthly Spending Trend</h3>
                  <p className="text-xs text-muted-custom">Total spend per calendar month</p>
                </div>
              </div>
              {momChange !== 0 && (
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  momChange > 0 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                }`}>
                  {momChange > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(momChange).toFixed(1)}% MoM
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradTeal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#14b8a6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => fmtAmt(v, currency)} width={60}
                />
                <Tooltip content={<AreaTooltip currency={currency} />}
                  cursor={{ stroke: '#14b8a6', strokeWidth: 1, strokeDasharray: '4 2' }} />
                <ReferenceLine y={avgMonthly} stroke="#475569" strokeDasharray="4 2"
                  label={{ value: 'avg', position: 'insideTopRight', fill: axisColor, fontSize: 11 }} />
                <Area type="monotone" dataKey="total" name="Total"
                  stroke="#14b8a6" strokeWidth={2.5} fill="url(#gradTeal)"
                  dot={{ fill: '#14b8a6', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#14b8a6', stroke: 'var(--bg-card)', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Spend per month bar + category breakdown ───────────────── */}
          <div className="grid lg:grid-cols-5 gap-5">

            {/* Bar chart — controlled width via barSize */}
            <div className="card lg:col-span-3">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
                  <BarChart2 size={16} className="text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary-custom text-sm">Monthly Breakdown</h3>
                  <p className="text-xs text-muted-custom">Spend amount · transaction count</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data.trend}
                  margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
                  barCategoryGap="35%"   /* controls space between groups */
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => fmtAmt(v, currency)} width={58}
                  />
                  <YAxis
                    yAxisId="right" orientation="right"
                    tick={{ fill: axisColor, fontSize: 11 }} axisLine={false} tickLine={false}
                    allowDecimals={false} width={30}
                  />
                  <Tooltip content={<BarTooltip currency={currency} />}
                    cursor={{ fill: 'rgba(20,184,166,0.04)' }} />
                  <ReferenceLine yAxisId="left" y={avgMonthly}
                    stroke="#475569" strokeDasharray="4 2" />
                  {/* barSize in px keeps bars medium width regardless of month count */}
                  <Bar yAxisId="left" dataKey="total" name="Spend"
                    fill="#14b8a6" radius={[5, 5, 0, 0]} fillOpacity={0.85}
                    barSize={28} maxBarSize={36}>
                    <LabelList dataKey="total" position="top" fontSize={10}
                      fill={axisColor}
                      formatter={v => v > 0 ? fmtAmt(v, currency) : ''} />
                  </Bar>
                  <Bar yAxisId="right" dataKey="count" name="# Expenses"
                    fill="#3b82f6" radius={[4, 4, 0, 0]} fillOpacity={0.5}
                    barSize={14} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-3 justify-end">
                <div className="flex items-center gap-1.5 text-xs text-muted-custom">
                  <div className="w-3 h-3 rounded-sm bg-teal-400 opacity-85" />
                  Spend amount
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-custom">
                  <div className="w-3 h-3 rounded-sm bg-blue-400 opacity-50" />
                  # Transactions
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-custom">
                  <div className="w-8 h-px bg-slate-500" style={{ borderTop: '2px dashed #475569' }} />
                  Avg
                </div>
              </div>
            </div>

            {/* Category pie + legend ────────────────────────────────────── */}
            <div className="card lg:col-span-2 flex flex-col">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)' }}>
                  <PieIcon size={16} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary-custom text-sm">By Category</h3>
                  <p className="text-xs text-muted-custom">{data.categories.length} categories</p>
                </div>
              </div>

              <div className="relative flex items-center justify-center mb-3">
                <ResponsiveContainer width={190} height={190}>
                  <PieChart>
                    <Pie
                      data={data.categories}
                      cx="50%" cy="50%"
                      innerRadius={54} outerRadius={85}
                      paddingAngle={2} dataKey="value" strokeWidth={0}
                    >
                      {data.categories.map((entry, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[entry.name] || '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip currency={currency} />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Centre label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-xs text-muted-custom leading-none">Total</p>
                  <p className="font-display font-bold text-base text-primary-custom mt-0.5">
                    {fmtAmt(totalSpent, currency)}
                  </p>
                </div>
              </div>

              <div className="space-y-2 flex-1">
                {data.categories.slice(0, 6).map(cat => (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{CATEGORY_EMOJI[cat.name]}</span>
                        <span className="text-xs text-secondary-custom capitalize">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-custom">{cat.pct}%</span>
                        <span className="font-mono text-xs font-semibold text-primary-custom w-16 text-right">
                          {fmtAmt(cat.value, currency)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                      <div className="h-full rounded-full"
                        style={{
                          width: `${(cat.value / (data.categories[0]?.value || 1)) * 100}%`,
                          background: CATEGORY_COLORS[cat.name] || '#64748b',
                        }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Daily spend (last 30 data points) ─────────────────────── */}
          {dailyData.length > 3 && (
            <div className="card">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
                  <Zap size={16} className="text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-primary-custom text-sm">Daily Spend Pattern</h3>
                  <p className="text-xs text-muted-custom">Each bar = one day with expenses</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart
                  data={dailyData}
                  margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false}
                    interval={Math.max(0, Math.floor(dailyData.length / 8) - 1)} />
                  <YAxis tick={{ fill: axisColor, fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => fmtAmt(v, currency)} width={52} />
                  <Tooltip
                    formatter={(v) => [`${sym}${v.toLocaleString('en-IN')}`, 'Spent']}
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                    itemStyle={{ color: '#f59e0b' }}
                  />
                  <Bar dataKey="amt" name="Daily spend"
                    fill="#f59e0b" radius={[4, 4, 0, 0]} fillOpacity={0.75}
                    barSize={12} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Balance strip ─────────────────────────────────────────── */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="card flex items-center gap-4" style={{ borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
                <TrendingUp size={22} className="text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-custom uppercase tracking-wider font-semibold mb-0.5">You Receive</p>
                <p className="font-display font-bold text-2xl text-green-400">
                  {fmtAmt(data.balance?.youReceive || 0, currency)}
                </p>
                <p className="text-xs text-muted-custom">outstanding balance</p>
              </div>
            </div>
            <div className="card flex items-center gap-4" style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <TrendingDown size={22} className="text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-custom uppercase tracking-wider font-semibold mb-0.5">You Owe</p>
                <p className="font-display font-bold text-2xl text-red-400">
                  {fmtAmt(data.balance?.youOwe || 0, currency)}
                </p>
                <p className="text-xs text-muted-custom">to friends</p>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
