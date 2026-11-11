import axios from 'axios';
import toast from 'react-hot-toast';

const BASE_URL = import.meta.env.VITE_API_URL;
console.log("BASE_URL : ");
console.log(BASE_URL);


const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  failedQueue = [];
};

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        const newToken = data.data.accessToken;
        localStorage.setItem('access_token', newToken);
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        localStorage.removeItem('access_token');
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  refresh: () => api.post('/auth/refresh'),
  me: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  verifyOtp: (data) => api.post('/auth/verify-otp', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const userAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.patch('/users/profile', data),
  changePassword: (data) => api.patch('/users/change-password', data),
  searchUsers: (q) => api.get('/users/search', { params: { q } }),
  deleteAccount: () => api.delete('/users/account'),
};

// ── Connections ───────────────────────────────────────────────────────────────
export const connectionAPI = {
  send: (data) => api.post('/connections/request', data),
  accept: (id) => api.post(`/connections/${id}/accept`),
  reject: (id) => api.post(`/connections/${id}/reject`),
  remove: (id) => api.delete(`/connections/${id}`),
  list: (params) => api.get('/connections', { params }),
  sentRequests: () => api.get('/connections/sent'),
  receivedRequests: () => api.get('/connections/received'),
  getProfile: (userId) => api.get(`/connections/profile/${userId}`),
};

// ── Expenses ──────────────────────────────────────────────────────────────────
export const expenseAPI = {
  list: (params) => api.get('/expenses', { params }),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.patch(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  notifyMembers: (id) => api.post(`/expenses/${id}/notify`),
  markPaid: (id, memberId) => api.patch(`/expenses/${id}/members/${memberId}/paid`),
  balanceSummary: () => api.get('/expenses/balance'),
  monthlyTotal: (params) => api.get('/expenses/monthly-total', { params }),
  changeType: (id) => api.patch(`/expenses/${id}/type`),
};

// ── Groups ────────────────────────────────────────────────────────────────────
export const groupAPI = {
  list: () => api.get('/groups'),
  create: (data) => api.post('/groups', data),
  get: (id) => api.get(`/groups/${id}`),
  update: (id, data) => api.patch(`/groups/${id}`, data),
  delete: (id) => api.delete(`/groups/${id}`),
  addMember: (id, data) => api.post(`/groups/${id}/members`, data),
  removeMember: (id, userId) => api.delete(`/groups/${id}/members/${userId}`),
  leave: (id) => api.post(`/groups/${id}/leave`),
  eligibleMembers: (id) => api.get(`/groups/${id}/eligible-members`),
};

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationAPI = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
  subscribe: (subscription) => api.post('/notifications/subscribe', { subscription }),
  unsubscribe: (endpoint) => api.delete('/notifications/subscribe', { data: { endpoint } }),
  getVapidKey: () => api.get('/notifications/vapid-public-key'),
};

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsAPI = {
  overview: (params) => api.get('/analytics/overview', { params }),
  categoryBreakdown: (params) => api.get('/analytics/categories', { params }),
  monthlyTrend: (params) => api.get('/analytics/monthly-trend', { params }),
  memberDebts: () => api.get('/analytics/member-debts'),
};

// ── Sync ──────────────────────────────────────────────────────────────────────
export const syncAPI = {
  push: (data) => api.post('/sync/push', data),
  pull: (since) => api.get('/sync/pull', { params: { since } }),
};

export default api;
