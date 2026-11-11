import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { User, Lock, Bell, Trash2, Save, Eye, EyeOff, Shield } from 'lucide-react';
import { userAPI } from '../services/api';
import { updateUser, logoutUser } from '../store/slices/authSlice';
import { PageHeader } from '../components/ui/index';
import Avatar from '../components/ui/Avatar';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const TABS = [
  { icon: User, label: 'Profile' },
  { icon: Lock, label: 'Security' },
];

export default function ProfilePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  const { register: regProfile, handleSubmit: handleProfile, formState: { errors: profileErrors } } = useForm({
    defaultValues: { displayName: user?.displayName || '', email: user?.email || '' }
  });
  const { register: regPass, handleSubmit: handlePass, watch, reset: resetPass, formState: { errors: passErrors } } = useForm();

  const onUpdateProfile = async (data) => {
    setLoading(true);
    try {
      const { data: res } = await userAPI.updateProfile(data);
      dispatch(updateUser(res.data?.user || data));
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    } finally { setLoading(false); }
  };

  const onChangePassword = async (data) => {
    setLoading(true);
    try {
      await userAPI.changePassword({ oldPassword: data.oldPassword, newPassword: data.newPassword });
      toast.success('Password changed successfully!');
      resetPass();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setLoading(false); }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.prompt('Type "DELETE" to confirm account deletion:');
    if (confirmed !== 'DELETE') return;
    try {
      await userAPI.deleteAccount();
      await dispatch(logoutUser());
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl">
      <PageHeader title="Profile" subtitle="Manage your account settings" />

      {/* User hero */}
      <div className="card flex items-center gap-5">
        <Avatar user={user} size="xl" />
        <div>
          <h2 className="font-display text-xl font-bold text-surface-50">{user?.displayName || user?.username}</h2>
          <p className="text-surface-400 text-sm">@{user?.username}</p>
          <p className="text-surface-500 text-sm">{user?.email}</p>
          {user?.role === 'admin' && <span className="badge badge-brand text-xs mt-1.5">Admin</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 border border-white/8 rounded-xl p-1 w-fit">
        {TABS.map(({ icon: Icon, label }, i) => (
          <button key={label} onClick={() => setTab(i)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === i ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20' : 'text-surface-400 hover:text-surface-200'
            }`}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {tab === 0 && (
        <div className="card">
          <h3 className="section-title mb-5">Personal Information</h3>
          <form onSubmit={handleProfile(onUpdateProfile)} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Display Name</label>
                <input type="text" className={`input-field ${profileErrors.displayName ? 'border-red-500/50' : ''}`}
                  {...regProfile('displayName', { maxLength: { value: 40, message: 'Too long' } })} />
                {profileErrors.displayName && <p className="text-red-400 text-xs mt-1">{profileErrors.displayName.message}</p>}
              </div>
              <div>
                <label className="label">Username</label>
                <input type="text" value={user?.username || ''} disabled className="input-field opacity-50 cursor-not-allowed" />
                <p className="text-surface-600 text-xs mt-1">Username cannot be changed</p>
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className={`input-field ${profileErrors.email ? 'border-red-500/50' : ''}`}
                {...regProfile('email', { pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' } })} />
              {profileErrors.email && <p className="text-red-400 text-xs mt-1">{profileErrors.email.message}</p>}
            </div>
            <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={15} />}
              Save Changes
            </button>
          </form>
        </div>
      )}

      {/* Security tab */}
      {tab === 1 && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="section-title mb-5 flex items-center gap-2"><Lock size={18} /> Change Password</h3>
            <form onSubmit={handlePass(onChangePassword)} className="space-y-4">
              <div>
                <label className="label">Current Password</label>
                <div className="relative">
                  <input type={showOldPass ? 'text' : 'password'} className={`input-field pr-11 ${passErrors.oldPassword ? 'border-red-500/50' : ''}`}
                    {...regPass('oldPassword', { required: 'Current password required' })} />
                  <button type="button" onClick={() => setShowOldPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                    {showOldPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passErrors.oldPassword && <p className="text-red-400 text-xs mt-1">{passErrors.oldPassword.message}</p>}
              </div>
              <div>
                <label className="label">New Password</label>
                <div className="relative">
                  <input type={showNewPass ? 'text' : 'password'} className={`input-field pr-11 ${passErrors.newPassword ? 'border-red-500/50' : ''}`}
                    {...regPass('newPassword', { required: 'New password required', minLength: { value: 8, message: 'Min 8 characters' } })} />
                  <button type="button" onClick={() => setShowNewPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
                    {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passErrors.newPassword && <p className="text-red-400 text-xs mt-1">{passErrors.newPassword.message}</p>}
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input type="password" className={`input-field ${passErrors.confirmPassword ? 'border-red-500/50' : ''}`}
                  {...regPass('confirmPassword', { required: 'Please confirm', validate: v => v === watch('newPassword') || 'Passwords do not match' })} />
                {passErrors.confirmPassword && <p className="text-red-400 text-xs mt-1">{passErrors.confirmPassword.message}</p>}
              </div>
              <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Shield size={15} />}
                Update Password
              </button>
            </form>
          </div>

          {/* Danger zone */}
          <div className="card border-red-500/20 bg-red-500/3">
            <h3 className="font-display font-semibold text-red-400 mb-2 flex items-center gap-2"><Trash2 size={16} /> Danger Zone</h3>
            <p className="text-surface-400 text-sm mb-4">Permanently delete your account and all associated data. This cannot be undone.</p>
            <button onClick={handleDeleteAccount} className="btn-danger flex items-center gap-2">
              <Trash2 size={15} /> Delete Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
