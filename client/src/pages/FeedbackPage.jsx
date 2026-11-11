import { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  MessageSquare, Star, Send, CheckCircle, Bug,
  Lightbulb, ThumbsUp, Heart, Sparkles, ChevronRight
} from 'lucide-react';
import { PageHeader } from '../components/ui/index';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { value: 'bug', label: 'Bug Report', icon: Bug, color: 'red', desc: 'Something is broken or not working' },
  { value: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'yellow', desc: 'Suggest something new' },
  { value: 'ui', label: 'UI / Design', icon: Sparkles, color: 'purple', desc: 'Feedback on look and feel' },
  { value: 'general', label: 'General', icon: ThumbsUp, color: 'teal', desc: 'Anything else on your mind' },
];

const RATINGS = [
  { value: 1, emoji: '😤', label: 'Terrible' },
  { value: 2, emoji: '😕', label: 'Poor' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '🤩', label: 'Amazing' },
];

const QUICK_PROMPTS = [
  'I love the expense tracking feature!',
  'The offline mode works great.',
  'The dashboard is very informative.',
  'Group expense splitting is seamless.',
];

function StarRating({ value, onChange }) {
  const [hovered, setHovered] = useState(null);
  const active = hovered ?? value;

  return (
    <div className="flex items-center gap-1">
      {RATINGS.map(r => (
        <button
          key={r.value}
          type="button"
          onClick={() => onChange(r.value)}
          onMouseEnter={() => setHovered(r.value)}
          onMouseLeave={() => setHovered(null)}
          className="group flex flex-col items-center gap-1 p-2 rounded-xl transition-all"
          style={{ background: active >= r.value ? 'rgba(20,184,166,0.1)' : 'transparent' }}
        >
          <span className="text-2xl transition-transform duration-150 group-hover:scale-125 select-none">
            {r.emoji}
          </span>
          {active === r.value && (
            <span className="text-[10px] font-semibold text-teal-400">{r.label}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const { user } = useSelector(s => s.auth);
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleQuickPrompt = (text) => {
    setMessage(prev => prev ? `${prev} ${text}` : text);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) { toast.error('Please enter your feedback'); return; }
    if (rating === 0) { toast.error('Please rate your experience'); return; }

    setLoading(true);
    // Simulate submission (integrate with your API endpoint)
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
    toast.success('Thanks for your feedback! 🙏');
  };

  const handleReset = () => {
    setSubmitted(false);
    setRating(0);
    setCategory('general');
    setMessage('');
  };

  if (submitted) {
    return (
      <div className="animate-fade-in max-w-lg mx-auto">
        <PageHeader title="Feedback" subtitle="Help us improve PayTrack" />
        <div className="card text-center py-12 border-teal-500/20 bg-teal-500/5">
          <div className="w-20 h-20 rounded-full bg-teal-500/15 flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={40} className="text-teal-400" />
          </div>
          <h2 className="font-display text-2xl font-bold text-primary-custom mb-2">Thank you!</h2>
          <p className="text-secondary-custom text-sm mb-1">Your feedback has been received.</p>
          <p className="text-muted-custom text-sm mb-8">We read every submission and use it to make PayTrack better.</p>
          <button onClick={handleReset} className="btn-primary flex items-center gap-2 mx-auto">
            <MessageSquare size={15} /> Submit More Feedback
          </button>
        </div>
      </div>
    );
  }

  const selectedCat = CATEGORIES.find(c => c.value === category);

  return (
    <div className="animate-fade-in max-w-2xl">
      <PageHeader
        title="Feedback"
        subtitle="Help us improve PayTrack"
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── Rating ────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Heart size={16} className="text-red-400" />
            <h3 className="font-semibold text-primary-custom">How's your experience?</h3>
          </div>
          <StarRating value={rating} onChange={setRating} />
          {rating === 0 && (
            <p className="text-muted-custom text-xs mt-2">Tap an emoji to rate</p>
          )}
        </div>

        {/* ── Category ──────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare size={16} className="text-teal-400" />
            <h3 className="font-semibold text-primary-custom">What's this about?</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isSelected = category === cat.value;
              const colorMap = {
                red: { border: 'border-red-500/30', bg: 'bg-red-500/10', text: 'text-red-400' },
                yellow: { border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
                purple: { border: 'border-purple-500/30', bg: 'bg-purple-500/10', text: 'text-purple-400' },
                teal: { border: 'border-teal-500/30', bg: 'bg-teal-500/10', text: 'text-teal-400' },
              };
              const c = colorMap[cat.color];
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? `${c.border} ${c.bg}`
                      : 'border-transparent hover:border-[color:var(--border)]'
                  }`}
                  style={!isSelected ? { background: 'var(--bg-input)' } : {}}
                >
                  <div className={`w-8 h-8 rounded-lg ${isSelected ? c.bg : 'bg-transparent'} flex items-center justify-center flex-shrink-0 mt-0.5`}
                    style={!isSelected ? { background: 'var(--bg-hover)' } : {}}>
                    <Icon size={15} className={isSelected ? c.text : 'text-muted-custom'} />
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isSelected ? 'text-primary-custom' : 'text-secondary-custom'}`}>
                      {cat.label}
                    </p>
                    <p className="text-xs text-muted-custom mt-0.5 leading-snug">{cat.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Message ───────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            {selectedCat && <selectedCat.icon size={16} className="text-teal-400" />}
            <h3 className="font-semibold text-primary-custom">Your message</h3>
          </div>

          {/* Quick prompts */}
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => handleQuickPrompt(p)}
                className="text-xs px-3 py-1.5 rounded-full transition-colors text-secondary-custom"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(20,184,166,0.4)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                {p}
              </button>
            ))}
          </div>

          <textarea
            rows={5}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={
              category === 'bug' ? 'Describe the bug: what happened, what you expected, and steps to reproduce…' :
              category === 'feature' ? "Describe the feature you'd like to see and why it would be useful…" :
              category === 'ui' ? 'Tell us what you think about the design, layout, or usability…' :
              'Share your thoughts, suggestions, or anything else on your mind…'
            }
            className="input-field resize-none text-sm leading-relaxed"
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-custom">
              Submitting as <span className="text-teal-400 font-medium">@{user?.username}</span>
            </p>
            <p className={`text-xs font-mono ${message.length > 500 ? 'text-red-400' : 'text-muted-custom'}`}>
              {message.length}/600
            </p>
          </div>
        </div>

        {/* ── Submit ────────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={loading || !message.trim() || rating === 0 || message.length > 600}
          className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Send size={16} /> Send Feedback
            </>
          )}
        </button>

        {/* Previous feedback note */}
        <div className="card border-dashed flex items-start gap-3 py-3.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--bg-input)' }}>
            <Sparkles size={14} className="text-muted-custom" />
          </div>
          <div>
            <p className="text-sm text-secondary-custom font-medium">Your feedback matters</p>
            <p className="text-xs text-muted-custom mt-0.5">
              We review all submissions personally. Feature requests are tracked and bugs are fixed in upcoming releases.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
