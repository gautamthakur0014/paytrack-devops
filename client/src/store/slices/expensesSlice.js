import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { expenseAPI, syncAPI } from '../../services/api';
import { idb } from '../../db/idb';
import toast from 'react-hot-toast';

function makeTempId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function registerBackgroundSync() {
  try {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register('sync-expenses');
  } catch { /* not supported */ }
}

// Shared promise lock — prevents concurrent syncs
let _syncPromise = null;

// ── Default to current month ───────────────────────────────────────────────────
const now = new Date();
const DEFAULT_FILTERS = {
  page: 1,
  limit: 15,
  year:  String(now.getFullYear()),
  month: String(now.getMonth() + 1),
};

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const fetchExpenses = createAsyncThunk('expenses/fetch', async (params, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.list(params);
    await idb.expenses.putMany(data.data.expenses);
    return data.data;
  } catch {
    const cached = await idb.expenses.getAll();
    if (cached.length > 0) return { expenses: cached, pagination: { total: cached.length }, fromCache: true };
    return rejectWithValue('Failed to fetch expenses');
  }
});

export const createExpense = createAsyncThunk('expenses/create', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.create(payload);
    await idb.expenses.put(data.data.expense);
    toast.success('Expense added!');
    return { expense: data.data.expense, tempId: null };
  } catch (err) {
    if (!navigator.onLine) {
      const localId = makeTempId();
      const tempExpense = {
        _id: localId, localId,
        description: payload.description,
        amount: parseFloat(payload.amount) || 0,
        totalAmount: parseFloat(payload.amount) || 0,
        recoveredAmount: 0,
        currency: payload.currency || 'USD',
        category: payload.category || 'other',
        type: payload.type || 'individual',
        expenseDate: payload.expenseDate || new Date().toISOString(),
        groupId: payload.groupId || null,
        members: [],
        notes: payload.notes || '',
        isDeleted: false,
        _isOffline: true,
        createdAt: new Date().toISOString(),
      };
      await idb.expenses.put(tempExpense);
      await idb.syncQueue.add({ op: 'create', localId, payload: { ...payload, localId } });
      await registerBackgroundSync();
      toast('Saved offline — will sync automatically when back online', { icon: '📶' });
      return { expense: tempExpense, tempId: localId };
    }
    return rejectWithValue(err.response?.data?.message || 'Failed to create expense');
  }
});

export const updateExpense = createAsyncThunk('expenses/update', async ({ id, data: payload }, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.update(id, payload);
    await idb.expenses.put(data.data.expense);
    toast.success('Expense updated!');
    return data.data.expense;
  } catch (err) {
    if (!navigator.onLine) {
      const localId = makeTempId();
      await idb.syncQueue.add({ op: 'update', localId, payload: { _id: id, ...payload, localId } });
      await registerBackgroundSync();
      const current = await idb.expenses.get(id).catch(() => null);
      if (current) {
        const updated = { ...current, ...payload, _isOffline: true };
        await idb.expenses.put(updated);
        toast('Update saved offline', { icon: '📶' });
        return updated;
      }
    }
    return rejectWithValue(err.response?.data?.message || 'Failed to update expense');
  }
});

export const deleteExpense = createAsyncThunk('expenses/delete', async (id, { rejectWithValue }) => {
  try {
    await expenseAPI.delete(id);
    await idb.expenses.delete(id);
    toast.success('Expense deleted');
    return id;
  } catch (err) {
    if (!navigator.onLine) {
      if (id.startsWith('offline_')) {
        await idb.expenses.delete(id);
        const queue = await idb.syncQueue.getAll();
        for (const item of queue) {
          if (item.payload?.localId === id) await idb.syncQueue.delete(item.id);
        }
      } else {
        const localId = makeTempId();
        await idb.syncQueue.add({ op: 'delete', localId, payload: { _id: id, localId } });
        await idb.expenses.delete(id);
        await registerBackgroundSync();
        toast('Deletion queued', { icon: '📶' });
      }
      return id;
    }
    return rejectWithValue(err.response?.data?.message || 'Failed to delete expense');
  }
});

export const fetchBalanceSummary = createAsyncThunk('expenses/balance', async (_, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.balanceSummary();
    return data.data;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const markMemberPaid = createAsyncThunk('expenses/markPaid', async ({ expenseId, memberId }, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.markPaid(expenseId, memberId);
    await idb.expenses.put(data.data.expense);
    toast.success('Marked as paid!');
    return data.data.expense;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const notifyMembers = createAsyncThunk('expenses/notify', async (id, { rejectWithValue }) => {
  try {
    const { data } = await expenseAPI.notifyMembers(id);
    toast.success(data.message);
    return id;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const syncOfflineQueue = createAsyncThunk('expenses/syncQueue', async (_, { dispatch }) => {
  if (_syncPromise) {
    console.log('[Sync] Coalescing into in-flight sync');
    return _syncPromise;
  }
  _syncPromise = _doSync(dispatch).finally(() => { _syncPromise = null; });
  return _syncPromise;
});

async function _doSync(dispatch) {
  const queue = await idb.syncQueue.getAll();
  if (!queue.length) {
    dispatch(fetchExpenses(DEFAULT_FILTERS));
    dispatch(fetchBalanceSummary());
    return { synced: 0 };
  }

  const operations = queue.map(item => ({ op: item.op, data: item.payload }));
  const { data } = await syncAPI.push({ operations });
  const results  = data.data?.results || [];
  const errors   = data.data?.errors  || [];

  if (errors.length > 0) {
    const firstError = errors[0]?.error;
    if (firstError) toast.error(`Sync issue: ${firstError.slice(0, 60)}`, { duration: 5000 });
  }

  let synced = 0;
  for (const item of queue) {
    const result = results.find(r => r.localId === item.payload?.localId);
    if (result && !['not_found'].includes(result.op)) {
      await idb.syncQueue.delete(item.id);
      if (item.op === 'create' && item.payload?.localId) {
        await idb.expenses.delete(item.payload.localId).catch(() => {});
      }
      synced++;
    }
  }

  if (synced > 0) toast.success(`Synced ${synced} change${synced > 1 ? 's' : ''} ✅`);

  dispatch(fetchExpenses(DEFAULT_FILTERS));
  dispatch(fetchBalanceSummary());
  return { synced };
}

// ─── Slice ────────────────────────────────────────────────────────────────────
const expensesSlice = createSlice({
  name: 'expenses',
  initialState: {
    items: [],
    pagination: null,
    balance: null,
    loading: false,
    error: null,
    // ── Default to current month ───────────────────────────────────────────
    filters: { ...DEFAULT_FILTERS },
    syncPending: 0,
  },
  reducers: {
    /**
     * setFilters — updates any filter fields EXCEPT page.
     * Always resets page to 1 when filters change (new search = start from page 1).
     */
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload, page: 1 };
    },

    /**
     * setPage — ONLY changes the page number.
     * This is separate from setFilters so that page changes do NOT
     * reset back to page 1 (which was the pagination bug).
     */
    setPage: (state, action) => {
      state.filters = { ...state.filters, page: action.payload };
    },

    clearFilters: (state) => {
      state.filters = { ...DEFAULT_FILTERS };
    },

    setSyncPending: (state, action) => { state.syncPending = action.payload; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchExpenses.pending,   (s) => { s.loading = true; s.error = null; })
      .addCase(fetchExpenses.fulfilled, (s, a) => {
        s.loading = false;
        s.items = a.payload.expenses;
        s.pagination = a.payload.pagination;
      })
      .addCase(fetchExpenses.rejected,  (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(createExpense.fulfilled, (s, a) => {
        const { expense, tempId } = a.payload;
        if (!expense) return;
        if (tempId) s.items = s.items.filter(e => e._id !== tempId);
        s.items.unshift(expense);
        if (tempId) s.syncPending += 1;
      })
      .addCase(updateExpense.fulfilled, (s, a) => {
        const idx = s.items.findIndex(e => e._id === a.payload._id);
        if (idx !== -1) s.items[idx] = a.payload; else s.items.unshift(a.payload);
      })
      .addCase(deleteExpense.fulfilled,       (s, a) => { s.items = s.items.filter(e => e._id !== a.payload); })
      .addCase(fetchBalanceSummary.fulfilled, (s, a) => { s.balance = a.payload; })
      .addCase(markMemberPaid.fulfilled, (s, a) => {
        const idx = s.items.findIndex(e => e._id === a.payload._id);
        if (idx !== -1) s.items[idx] = a.payload;
      })
      .addCase(syncOfflineQueue.fulfilled, (s, a) => {
        s.syncPending = Math.max(0, s.syncPending - (a.payload?.synced || 0));
      });
  },
});

export const { setFilters, setPage, clearFilters, setSyncPending } = expensesSlice.actions;
export default expensesSlice.reducer;
