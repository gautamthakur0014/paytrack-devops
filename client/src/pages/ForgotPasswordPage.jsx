import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Mail, ArrowLeft, KeyRound, Lock } from 'lucide-react';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

const STEPS = { EMAIL: 'email', OTP: 'otp', RESET: 'reset', DONE: 'done' };

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.EMAIL);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');
  const [resetToken, setResetToken] = useState('');
  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm();

  const handleEmail = async ({ email }) => {
    setLoading(true);
    try {
      const { data } = await authAPI.forgotPassword(email);
      setUserId(data.userId);
      toast.success('OTP sent to your email');
      setStep(STEPS.OTP);
      reset();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const handleOtp = async ({ otp }) => {
    setLoading(true);
    try {
      const { data } = await authAPI.verifyOtp({ userId, otp });
      setResetToken(data.resetToken);
      setStep(STEPS.RESET);
      reset();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid OTP');
    } finally { setLoading(false); }
  };

  const handleReset = async ({ newPassword }) => {
    setLoading(true);
    try {
      await authAPI.resetPassword({ userId, resetToken, newPassword });
      toast.success('Password reset successfully!');
      setStep(STEPS.DONE);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-7 animate-fade-in">
      <div>
        <Link to="/login" className="inline-flex items-center gap-1.5 text-surface-400 hover:text-surface-200 text-sm mb-6 transition-colors">
          <ArrowLeft size={15} /> Back to sign in
        </Link>
        <h2 className="font-display text-3xl font-bold text-surface-50">
          {step === STEPS.EMAIL && 'Reset password'}
          {step === STEPS.OTP && 'Enter OTP'}
          {step === STEPS.RESET && 'New password'}
          {step === STEPS.DONE && 'All done!'}
        </h2>
        <p className="text-surface-400 mt-2">
          {step === STEPS.EMAIL && 'Enter your email to receive a one-time code'}
          {step === STEPS.OTP && 'Enter the 6-digit code sent to your email'}
          {step === STEPS.RESET && 'Choose a strong new password'}
          {step === STEPS.DONE && 'Your password has been reset successfully'}
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {[STEPS.EMAIL, STEPS.OTP, STEPS.RESET].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === s ? 'bg-brand-500 text-white' :
              [STEPS.OTP, STEPS.RESET, STEPS.DONE].indexOf(step) > i ? 'bg-brand-500/30 text-brand-400' :
              'bg-surface-800 text-surface-500'
            }`}>{i + 1}</div>
            {i < 2 && <div className={`flex-1 h-0.5 w-8 ${[STEPS.OTP, STEPS.RESET, STEPS.DONE].indexOf(step) > i ? 'bg-brand-500/50' : 'bg-surface-700'}`} />}
          </div>
        ))}
      </div>

      {step === STEPS.EMAIL && (
        <form onSubmit={handleSubmit(handleEmail)} className="space-y-4">
          <div>
            <label className="label">Email address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input type="email" placeholder="you@example.com" className={`input-field pl-10 ${errors.email ? 'border-red-500/50' : ''}`}
                {...register('email', { required: 'Email required', pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' } })} />
            </div>
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Mail size={16} /><span>Send OTP</span></>}
          </button>
        </form>
      )}

      {step === STEPS.OTP && (
        <form onSubmit={handleSubmit(handleOtp)} className="space-y-4">
          <div>
            <label className="label">6-digit OTP</label>
            <div className="relative">
              <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input type="text" placeholder="123456" maxLength={6} className={`input-field pl-10 font-mono tracking-widest text-lg ${errors.otp ? 'border-red-500/50' : ''}`}
                {...register('otp', { required: 'OTP required', minLength: { value: 6, message: '6 digits required' }, maxLength: { value: 6, message: '6 digits only' } })} />
            </div>
            {errors.otp && <p className="text-red-400 text-xs mt-1">{errors.otp.message}</p>}
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Verify OTP'}
          </button>
          <button type="button" onClick={() => { setStep(STEPS.EMAIL); reset(); }} className="btn-ghost w-full text-sm">
            Resend OTP
          </button>
        </form>
      )}

      {step === STEPS.RESET && (
        <form onSubmit={handleSubmit(handleReset)} className="space-y-4">
          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" />
              <input type="password" placeholder="Min 8 characters" className={`input-field pl-10 ${errors.newPassword ? 'border-red-500/50' : ''}`}
                {...register('newPassword', { required: 'Required', minLength: { value: 8, message: 'Min 8 characters' } })} />
            </div>
            {errors.newPassword && <p className="text-red-400 text-xs mt-1">{errors.newPassword.message}</p>}
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" placeholder="Repeat password" className={`input-field ${errors.confirm ? 'border-red-500/50' : ''}`}
              {...register('confirm', { required: 'Required', validate: v => v === watch('newPassword') || 'Passwords do not match' })} />
            {errors.confirm && <p className="text-red-400 text-xs mt-1">{errors.confirm.message}</p>}
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Reset Password'}
          </button>
        </form>
      )}

      {step === STEPS.DONE && (
        <div className="text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-green-500/15 border border-green-500/20 flex items-center justify-center mx-auto">
            <span className="text-3xl">🎉</span>
          </div>
          <button onClick={() => navigate('/login')} className="btn-primary w-full">Back to Sign In</button>
        </div>
      )}
    </div>
  );
}
