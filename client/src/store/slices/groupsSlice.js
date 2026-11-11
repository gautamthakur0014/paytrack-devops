import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { groupAPI } from '../../services/api';
import { idb } from '../../db/idb';
import toast from 'react-hot-toast';

export const fetchGroups = createAsyncThunk('groups/fetch', async (_, { rejectWithValue }) => {
  try {
    const { data } = await groupAPI.list();
    await idb.groups.putMany(data.data.groups || []);
    return data.data.groups || [];
  } catch (err) {
    const cached = await idb.groups.getAll();
    if (cached.length > 0) return cached;
    return rejectWithValue(err.response?.data?.message || 'Failed to fetch groups');
  }
});

export const createGroup = createAsyncThunk('groups/create', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await groupAPI.create(payload);
    await idb.groups.put(data.data.group);
    toast.success('Group created!');
    return data.data.group;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message || 'Failed to create group');
  }
});

export const deleteGroup = createAsyncThunk('groups/delete', async (id, { rejectWithValue }) => {
  try {
    await groupAPI.delete(id);
    await idb.groups.delete(id);
    toast.success('Group deleted');
    return id;
  } catch (err) {
    return rejectWithValue(err.response?.data?.message);
  }
});

const groupsSlice = createSlice({
  name: 'groups',
  initialState: { items: [], loading: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGroups.pending, (s) => { s.loading = true; })
      .addCase(fetchGroups.fulfilled, (s, a) => { s.loading = false; s.items = a.payload; })
      .addCase(fetchGroups.rejected, (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(createGroup.fulfilled, (s, a) => { s.items.unshift(a.payload); })
      .addCase(deleteGroup.fulfilled, (s, a) => { s.items = s.items.filter(g => g._id !== a.payload); });
  },
});

export default groupsSlice.reducer;
