import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchMe } from './store/slices/authSlice';

import AppLayout from './components/layout/AppLayout';
import AuthLayout from './components/layout/AuthLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ExpensesPage from './pages/ExpensesPage';
import GroupsPage from './pages/GroupsPage';
import ConnectionsPage from './pages/ConnectionsPage';
import NotificationsPage from './pages/NotificationsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ProfilePage from './pages/ProfilePage';
import FeedbackPage from './pages/FeedbackPage';
import SearchPage from './pages/SearchPage';
import LoadingScreen from './components/ui/LoadingScreen';

const ProtectedRoute = ({ children }) => {
  const { user, initialized } = useSelector(s => s.auth);
  if (!initialized) return <LoadingScreen />;
  return user ? children : <Navigate to="/login" replace />;
};

const GuestRoute = ({ children }) => {
  const { user, initialized } = useSelector(s => s.auth);
  if (!initialized) return <LoadingScreen />;
  return !user ? children : <Navigate to="/dashboard" replace />;
};

export default function App() {
  const dispatch = useDispatch();
  const { initialized } = useSelector(s => s.auth);

  useEffect(() => {
    const token      = localStorage.getItem('access_token');
    const cachedUser = localStorage.getItem('cached_user');
    if (token)           dispatch(fetchMe());
    else if (cachedUser) dispatch({ type: 'auth/restoreOffline', payload: JSON.parse(cachedUser) });
    else                 dispatch({ type: 'auth/me/rejected' });
  }, [dispatch]);

  if (!initialized) return <LoadingScreen />;

  return (
    <Routes>
      <Route element={<GuestRoute><AuthLayout /></GuestRoute>}>
        <Route path="/login"          element={<LoginPage />} />
        <Route path="/register"       element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard"     element={<DashboardPage />} />
        <Route path="/expenses"      element={<ExpensesPage />} />
        <Route path="/groups"        element={<GroupsPage />} />
        <Route path="/connections"   element={<ConnectionsPage />} />
        <Route path="/search"        element={<SearchPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/analytics"     element={<AnalyticsPage />} />
        <Route path="/profile"       element={<ProfilePage />} />
        <Route path="/feedback"      element={<FeedbackPage />} />
      </Route>

      <Route path="/"  element={<Navigate to="/dashboard" replace />} />
      <Route path="*"  element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
