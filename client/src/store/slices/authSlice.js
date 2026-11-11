import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authAPI, userAPI } from '../../services/api';
import { idb } from '../../db/idb';
import toast from 'react-hot-toast';

function cacheUser(user) {
  if (user) {
    localStorage.setItem('cached_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('cached_user');
  }
}

function getCachedUser() {
  try {
    const raw = localStorage.getItem('cached_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Thunks ───────────────────────────────────────────────────────────────────

export const loginUser = createAsyncThunk('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await authAPI.login(credentials);
    localStorage.setItem('access_token', data.data.accessToken);
    cacheUser(data.data.user);
    return data.data.user;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Login failed');
  }
});

export const registerUser = createAsyncThunk('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await authAPI.register(payload);
    localStorage.setItem('access_token', data.data.accessToken);
    cacheUser(data.data.user);
    return data.data.user;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Registration failed');
  }
});

export const fetchMe = createAsyncThunk('auth/me', async (_, { rejectWithValue }) => {
  try {
    const { data } = await authAPI.me();
    cacheUser(data.data.user);
    return data.data.user;
  } catch (err) {
    // Network error while offline — restore from cache
    if (!navigator.onLine) {
      const cached = getCachedUser();
      if (cached) return cached;
    }
    return rejectWithValue(err.response?.data?.message || 'Session expired');
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  try { await authAPI.logout(); } catch (_) {}
  localStorage.removeItem('access_token');
  cacheUser(null);
  try {
    await idb.expenses.clear();
    await idb.groups?.clear();
    await idb.connections?.clear();
    await idb.notifications?.clear();
    await idb.cache?.clear();
  } catch (_) {}
});

/**
 * saveMonthlyIncome — PATCHes the user profile with the new income value.
 * Updates local cache optimistically so the UI is instant even before the
 * response comes back. On network failure, stores in localStorage cache only
 * and the value will be saved next time the user updates their profile.
 */
export const saveMonthlyIncome = createAsyncThunk('auth/saveIncome', async (income, { getState, rejectWithValue }) => {
  const value = parseFloat(income);
  if (isNaN(value) || value < 0) return rejectWithValue('Invalid income value');

  try {
    const { data } = await userAPI.updateProfile({ monthlyIncome: value });
    const updatedUser = data.data?.user;
    cacheUser(updatedUser);
    return updatedUser;
  } catch (err) {
    if (!navigator.onLine) {
      // Optimistically update the cached user so it persists across refreshes
      const current = getState().auth.user;
      const updated = { ...current, monthlyIncome: value };
      cacheUser(updated);
      toast('Income saved locally — will sync when online', { icon: '📶' });
      return updated;
    }
    return rejectWithValue(err.response?.data?.message || 'Failed to save income');
  }
});

// ─── Slice ────────────────────────────────────────────────────────────────────
const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    loading: false,
    initialized: false,
    error: null,
    incomeLoading: false,
  },
  reducers: {
    clearError: (state) => { state.error = null; },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
      cacheUser(state.user);
    },
    restoreOffline: (state, action) => {
      state.user = action.payload;
      state.initialized = true;
      state.loading = false;
    },
  },
  extraReducers: (builder) => {
    const pending = (state) => { state.loading = true; state.error = null; };
    const rejected = (state, action) => { state.loading = false; state.error = action.payload; };

    builder
      .addCase(loginUser.pending, pending)
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.initialized = true;
        toast.success(`Welcome back, ${action.payload.displayName || action.payload.username}!`);
      })
      .addCase(loginUser.rejected, (state, action) => {
        rejected(state, action);
        toast.error(action.payload);
      })
      .addCase(registerUser.pending, pending)
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.initialized = true;
        toast.success('Account created successfully!');
      })
      .addCase(registerUser.rejected, (state, action) => {
        rejected(state, action);
        toast.error(action.payload);
      })
      .addCase(fetchMe.pending, (state) => { state.loading = true; })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload;
        state.initialized = true;
      })
      .addCase(fetchMe.rejected, (state) => {
        state.loading = false;
        state.initialized = true;
        state.user = null;
        localStorage.removeItem('access_token');
        cacheUser(null);
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.initialized = true;
        toast.success('Logged out successfully');
      })

      // ── saveMonthlyIncome ──────────────────────────────────────────────────
      .addCase(saveMonthlyIncome.pending, (state) => { state.incomeLoading = true; })
      .addCase(saveMonthlyIncome.fulfilled, (state, action) => {
        state.incomeLoading = false;
        state.user = action.payload;
      })
      .addCase(saveMonthlyIncome.rejected, (state, action) => {
        state.incomeLoading = false;
        toast.error(action.payload || 'Failed to save income');
      });
  },
});

export const { clearError, updateUser, restoreOffline } = authSlice.actions;
export default authSlice.reducer;
