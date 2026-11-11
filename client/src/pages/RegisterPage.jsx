import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { registerUser } from '../store/slices/authSlice';

export default function RegisterPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading } = useSelector(s => s.auth);
  const [showPass, setShowPass] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm();
  const password = watch('password');

  const onSubmit = async (data) => {
    const { confirmPassword, ...payload } = data;
    const result = await dispatch(registerUser(payload));
    if (registerUser.fulfilled.match(result)) navigate('/dashboard');
  };

  return (
    <div className="space-y-7 animate-fade-in">
      <div>
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow">
            <span className="text-white font-display font-bold text-sm">SL</span>
          </div>
          <span className="font-display font-bold text-surface-50 text-lg">PayTrack</span>
        </div>
        <h2 className="font-display text-3xl font-bold text-surface-50">Create account</h2>
        <p className="text-surface-400 mt-2">Start splitting expenses for free</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Username</label>
            <input type="text" placeholder="johndoe" className={`input-field ${errors.username ? 'border-red-500/50' : ''}`}
              {...register('username', {
                required: 'Required',
                minLength: { value: 3, message: 'Min 3 chars' },
                maxLength: { value: 20, message: 'Max 20 chars' },
                pattern: { value: /^[a-zA-Z0-9_]+$/, message: 'Letters, numbers, _ only' }
              })} />
            {errors.username && <p className="text-red-400 text-xs mt-1">{errors.username.message}</p>}
          </div>
          <div>
            <label className="label">Display Name</label>
            <input type="text" placeholder="John Doe" className={`input-field ${errors.displayName ? 'border-red-500/50' : ''}`}
              {...register('displayName', { maxLength: { value: 40, message: 'Too long' } })} />
            {errors.displayName && <p className="text-red-400 text-xs mt-1">{errors.displayName.message}</p>}
          </div>
        </div>

        <div>
          <label className="label">Email</label>
          <input type="email" placeholder="you@example.com" className={`input-field ${errors.email ? 'border-red-500/50' : ''}`}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' }
            })} />
          {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label">Password</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} placeholder="Min 8 characters"
              className={`input-field pr-11 ${errors.password ? 'border-red-500/50' : ''}`}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Minimum 8 characters' }
              })} />
            <button type="button" onClick={() => setShowPass(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300">
              {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
        </div>

        <div>
          <label className="label">Confirm Password</label>
          <input type="password" placeholder="Repeat password"
            className={`input-field ${errors.confirmPassword ? 'border-red-500/50' : ''}`}
            {...register('confirmPassword', {
              required: 'Please confirm password',
              validate: v => v === password || 'Passwords do not match'
            })} />
          {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword.message}</p>}
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <><UserPlus size={17} /><span>Create Account</span></>
          )}
        </button>
      </form>

      <p className="text-center text-surface-400 text-sm">
        Already have an account?{' '}
        <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
