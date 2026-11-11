import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Search, UserPlus, UserCheck, Loader2, User } from 'lucide-react';
import { userAPI } from '../services/api';
import { sendConnectionRequest } from '../store/slices/connectionsSlice';
import { PageHeader } from '../components/ui/index';
import Avatar from '../components/ui/Avatar';
import { debounce } from 'lodash';

export default function SearchPage() {
  const dispatch = useDispatch();
  const { items: connections, sentRequests } = useSelector(s => s.connections);

  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sending, setSending] = useState({}); // { [userId]: true }
  const [sent, setSent] = useState(new Set()); // userIds we've just sent a request to

  // IDs we're already connected to
  const connectedIds = new Set(connections.map(c => c._id || c.connectionId).filter(Boolean));
  const pendingIds   = new Set(sentRequests.map(r => r.recipient?._id || r.recipientId).filter(Boolean));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doSearch = useCallback(debounce(async (q) => {
    if (!q || q.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const { data } = await userAPI.searchUsers(q.trim());
      setResults(data.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, 400), []);

  const handleChange = (e) => {
    setQuery(e.target.value);
    doSearch(e.target.value);
  };

  const handleSendRequest = async (user) => {
    setSending(p => ({ ...p, [user._id]: true }));
    try {
      const result = await dispatch(sendConnectionRequest({ username: user.username }));
      if (sendConnectionRequest.fulfilled.match(result)) {
        setSent(prev => new Set([...prev, user._id]));
      }
    } finally {
      setSending(p => ({ ...p, [user._id]: false }));
    }
  };

  const getStatus = (user) => {
    if (connectedIds.has(user._id))   return 'connected';
    if (sent.has(user._id))           return 'sent';
    if (pendingIds.has(user._id))     return 'pending';
    return 'none';
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <PageHeader
        title="Search Users"
        subtitle="Find people by username and connect with them"
      />

      {/* Search input */}
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-custom" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search by username or display name…"
          className="input-field pl-12 py-3.5 text-base"
          autoFocus
        />
        {loading && (
          <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-teal-400 animate-spin" />
        )}
      </div>

      {/* Results */}
      {!searched && !query && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <Search size={28} className="text-muted-custom" />
          </div>
          <p className="text-secondary-custom font-medium">Find anyone on PayTrack</p>
          <p className="text-muted-custom text-sm mt-1">Type a username or name to search</p>
        </div>
      )}

      {searched && !loading && results.length === 0 && (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <User size={24} className="text-muted-custom" />
          </div>
          <p className="text-secondary-custom font-medium">No users found</p>
          <p className="text-muted-custom text-sm mt-1">Try a different username or name</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-custom font-medium uppercase tracking-wider px-1">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </p>
          {results.map(user => {
            const status = getStatus(user);
            const isSending = sending[user._id];

            return (
              <div key={user._id} className="card flex items-center gap-4">
                <Avatar user={user} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-primary-custom truncate">
                    {user.displayName || user.username}
                  </p>
                  <p className="text-sm text-muted-custom">@{user.username}</p>
                </div>

                {status === 'connected' && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-green-400 bg-green-500/10 border border-green-500/20">
                    <UserCheck size={14} /> Connected
                  </div>
                )}
                {(status === 'sent' || status === 'pending') && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium text-muted-custom"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                    <Loader2 size={14} className="opacity-50" /> Request sent
                  </div>
                )}
                {status === 'none' && (
                  <button
                    onClick={() => handleSendRequest(user)}
                    disabled={isSending}
                    className="btn-primary flex items-center gap-1.5 text-sm py-2 px-3 disabled:opacity-60"
                  >
                    {isSending
                      ? <Loader2 size={14} className="animate-spin" />
                      : <UserPlus size={14} />}
                    {isSending ? 'Sending…' : 'Connect'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
