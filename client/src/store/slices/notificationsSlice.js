import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { notificationAPI } from '../../services/api';
import { idb } from '../../db/idb';

export const fetchNotifications = createAsyncThunk('notifications/fetch', async (params, { rejectWithValue }) => {
  try {
    const { data } = await notificationAPI.list(params);
    const notifs = data.data.notifications || [];
    await idb.notifications.putMany(notifs);
    return { notifications: notifs, unreadCount: data.data.unreadCount || 0 };
  } catch {
    const cached = await idb.notifications.getAll();
    return { notifications: cached, unreadCount: cached.filter(n => !n.read).length };
  }
});

export const markNotificationRead = createAsyncThunk('notifications/markRead', async (id, { rejectWithValue }) => {
  try { await notificationAPI.markRead(id); return id; }
  catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const markAllRead = createAsyncThunk('notifications/markAllRead', async (_, { rejectWithValue }) => {
  try { await notificationAPI.markAllRead(); return true; }
  catch (err) { return rejectWithValue(err.response?.data?.message); }
});

export const deleteNotification = createAsyncThunk('notifications/delete', async (id, { rejectWithValue }) => {
  try {
    await notificationAPI.delete(id);
    await idb.notifications.delete(id);
    return id;
  } catch (err) { return rejectWithValue(err.response?.data?.message); }
});

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    items: [],
    unreadCount: 0,
    loading: false,
    // Set of notification _ids that have already been shown in the popup toast.
    // Stored as an array (Redux state must be serializable) but used as a Set.
    // On first load we seed this with ALL current notification IDs so that
    // old notifications never trigger a popup when the user first opens the app.
    toastShownIds: [],
    // Whether the initial seed has happened yet
    initialLoadDone: false,
  },
  reducers: {
    addNotification: (state, action) => {
      if (state.items.some(x => x._id === action.payload._id)) return;
      state.items.unshift(action.payload);
      if (!action.payload.read) state.unreadCount += 1;
      // Do NOT pre-seed into toastShownIds — this is a genuinely new notification
    },
    markToastShown: (state, action) => {
      // action.payload = notification _id string
      if (!state.toastShownIds.includes(action.payload)) {
        state.toastShownIds.push(action.payload);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (s) => { s.loading = true; })
      .addCase(fetchNotifications.fulfilled, (s, a) => {
        s.loading = false;
        const incoming = a.payload.notifications;

        if (!s.initialLoadDone) {
          // ── FIRST LOAD: seed toastShownIds with everything that exists right now.
          // This means old notifications (even unread ones) never pop up on login.
          s.toastShownIds = incoming.map(n => n._id);
          s.initialLoadDone = true;
        } else {
          // ── SUBSEQUENT POLLS: any ID not in toastShownIds is genuinely new.
          // We do NOT pre-seed them — the toast component will show and then
          // call markToastShown() to add them.
        }

        s.items = incoming;
        s.unreadCount = a.payload.unreadCount;
      })
      .addCase(markNotificationRead.fulfilled, (s, a) => {
        const n = s.items.find(x => x._id === a.payload);
        if (n && !n.read) { n.read = true; s.unreadCount = Math.max(0, s.unreadCount - 1); }
        // Once read it should never re-appear as a toast
        if (!s.toastShownIds.includes(a.payload)) s.toastShownIds.push(a.payload);
      })
      .addCase(markAllRead.fulfilled, (s) => {
        s.items.forEach(n => { n.read = true; });
        s.unreadCount = 0;
        // All read = all shown
        s.toastShownIds = [...new Set([...s.toastShownIds, ...s.items.map(n => n._id)])];
      })
      .addCase(deleteNotification.fulfilled, (s, a) => {
        const n = s.items.find(x => x._id === a.payload);
        if (n && !n.read) s.unreadCount = Math.max(0, s.unreadCount - 1);
        s.items = s.items.filter(x => x._id !== a.payload);
      });
  },
});

export const { addNotification, markToastShown } = notificationsSlice.actions;
export default notificationsSlice.reducer;
