import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { connectionAPI } from '../../services/api';
import { idb } from '../../db/idb';
import toast from 'react-hot-toast';

export const fetchConnections = createAsyncThunk('connections/fetch', async (params, { rejectWithValue }) => {
  try {
    const { data } = await connectionAPI.list(params);
    await idb.connections.putMany((data.data.connections || []).map(c => ({ ...c, _id: c._id || c.connectionId })));
    return data.data;
  } catch (err) {
    const cached = await idb.connections.getAll();
    if (cached.length > 0) return { connections: cached, total: cached.length };
    return rejectWithValue(err.response?.data?.message);
  }
});

export const fetchReceivedRequests = createAsyncThunk('connections/received', async (_, { rejectWithValue }) => {
  try {
    const { data } = await connectionAPI.receivedRequests();
    return data.data.requests || [];
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const fetchSentRequests = createAsyncThunk('connections/sent', async (_, { rejectWithValue }) => {
  try {
    const { data } = await connectionAPI.sentRequests();
    return data.data.requests || [];
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const sendConnectionRequest = createAsyncThunk('connections/send', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await connectionAPI.send(payload);
    toast.success('Connection request sent!');
    return data.data.connection;
  } catch (err) {
    const msg = err.response?.data?.message || 'Failed to send request';
    toast.error(msg);
    return rejectWithValue(msg);
  }
});

export const acceptConnection = createAsyncThunk('connections/accept', async (id, { rejectWithValue }) => {
  try {
    const { data } = await connectionAPI.accept(id);
    toast.success('Connection accepted!');
    return { id, connection: data.data.connection };
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const rejectConnection = createAsyncThunk('connections/reject', async (id, { rejectWithValue }) => {
  try {
    await connectionAPI.reject(id);
    toast.success('Request rejected');
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

export const removeConnection = createAsyncThunk('connections/remove', async (id, { rejectWithValue }) => {
  try {
    await connectionAPI.remove(id);
    toast.success('Connection removed');
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const connectionsSlice = createSlice({
  name: 'connections',
  initialState: {
    items: [],
    receivedRequests: [],
    sentRequests: [],
    loading: false,
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchConnections.pending, (s) => { s.loading = true; })
      .addCase(fetchConnections.fulfilled, (s, a) => { s.loading = false; s.items = a.payload.connections || []; })
      .addCase(fetchConnections.rejected, (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(fetchReceivedRequests.fulfilled, (s, a) => { s.receivedRequests = a.payload; })
      .addCase(fetchSentRequests.fulfilled, (s, a) => { s.sentRequests = a.payload; })
      .addCase(acceptConnection.fulfilled, (s, a) => {
        s.receivedRequests = s.receivedRequests.filter(r => r._id !== a.payload.id);
      })
      .addCase(rejectConnection.fulfilled, (s, a) => {
        s.receivedRequests = s.receivedRequests.filter(r => r._id !== a.payload);
      })
      .addCase(removeConnection.fulfilled, (s, a) => {
        s.items = s.items.filter(c => c.connectionId !== a.payload && c._id !== a.payload);
      });
  },
});

export default connectionsSlice.reducer;
