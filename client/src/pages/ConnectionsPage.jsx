import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { UserPlus, UserCheck, UserX, Search, Trash2, Clock, Users, Check, X } from 'lucide-react';
import {
  fetchConnections, fetchReceivedRequests, fetchSentRequests,
  sendConnectionRequest, acceptConnection, rejectConnection, removeConnection
} from '../store/slices/connectionsSlice';
import { PageHeader, EmptyState, Spinner } from '../components/ui/index';
import Modal from '../components/ui/Modal';
import { useForm } from 'react-hook-form';
import Avatar from '../components/ui/Avatar';
import { format } from 'date-fns';

const TABS = ['Connections', 'Requests', 'Sent'];

export default function ConnectionsPage() {
  const dispatch = useDispatch();
  const { items, receivedRequests, sentRequests, loading } = useSelector(s => s.connections);
  const [tab, setTab] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    dispatch(fetchConnections());
    dispatch(fetchReceivedRequests());
    dispatch(fetchSentRequests());
  }, [dispatch]);

  const onSendRequest = async (data) => {
    const result = await dispatch(sendConnectionRequest(data));
    if (sendConnectionRequest.fulfilled.match(result)) { setShowAdd(false); reset(); dispatch(fetchSentRequests()); }
  };

  const filteredConnections = items.filter(c => {
    const name = (c.displayName || c.username || '').toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Connections"
        subtitle={`${items.length} connected`}
        action={
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
            <UserPlus size={16} /> Add Connection
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 border border-white/8 rounded-xl p-1 w-fit">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === i ? 'bg-brand-500/15 text-brand-400 border border-brand-500/20' : 'text-surface-400 hover:text-surface-200'
            }`}>
            {t}
            {i === 1 && receivedRequests.length > 0 && (
              <span className="ml-1.5 bg-brand-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{receivedRequests.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab === 0 && (
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500" />
          <input type="text" placeholder="Search connections…" value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : (
        <>
          {/* Connections tab */}
          {tab === 0 && (
            filteredConnections.length === 0 ? (
              <EmptyState icon={Users} title={search ? 'No results' : 'No connections yet'} description="Connect with friends to split expenses"
                action={!search && <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2"><UserPlus size={16} /> Add Connection</button>} />
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredConnections.map((conn) => (
                  <div key={conn._id || conn.connectionId} className="card hover:border-white/15 transition-all">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0 ring-2 ring-white/10"
                        style={{ backgroundColor: conn.avatarColor || '#64748b' }}>
                        {conn.displayName?.slice(0, 1).toUpperCase() || conn.username?.slice(0, 1).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-surface-100 truncate">{conn.displayName || conn.username}</p>
                        <p className="text-surface-500 text-xs truncate">@{conn.username}</p>
                        {conn.connectedAt && <p className="text-surface-600 text-xs mt-0.5">Since {format(new Date(conn.connectedAt), 'MMM yyyy')}</p>}
                      </div>
                    </div>
                    <button onClick={() => {
                      if (confirm(`Remove connection with ${conn.displayName || conn.username}?`)) {
                        dispatch(removeConnection(conn.connectionId || conn._id));
                      }
                    }} className="btn-danger text-xs w-full flex items-center justify-center gap-1.5 py-2">
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Received requests */}
          {tab === 1 && (
            receivedRequests.length === 0 ? (
              <EmptyState icon={UserCheck} title="No pending requests" description="You have no incoming connection requests" />
            ) : (
              <div className="space-y-3">
                {receivedRequests.map(req => (
                  <div key={req._id} className="card flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: req.requester?.avatarColor || '#64748b' }}>
                      {req.requester?.displayName?.slice(0, 1).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-surface-100">{req.requester?.displayName || req.requester?.username}</p>
                      <p className="text-surface-500 text-xs">@{req.requester?.username}</p>
                      {req.message && <p className="text-surface-400 text-xs mt-1 italic">"{req.message}"</p>}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => dispatch(acceptConnection(req._id)).then(() => dispatch(fetchConnections()))}
                        className="bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all">
                        <Check size={13} /> Accept
                      </button>
                      <button onClick={() => dispatch(rejectConnection(req._id))}
                        className="btn-danger text-xs flex items-center gap-1.5 px-3 py-2">
                        <X size={13} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Sent requests */}
          {tab === 2 && (
            sentRequests.length === 0 ? (
              <EmptyState icon={Clock} title="No sent requests" description="Send a connection request to get started" />
            ) : (
              <div className="space-y-3">
                {sentRequests.map(req => (
                  <div key={req._id} className="card flex items-center gap-4">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: req.recipient?.avatarColor || '#64748b' }}>
                      {req.recipient?.displayName?.slice(0, 1).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-surface-100">{req.recipient?.displayName || req.recipient?.username}</p>
                      <p className="text-surface-500 text-xs">@{req.recipient?.username}</p>
                    </div>
                    <span className="badge badge-yellow text-xs flex items-center gap-1"><Clock size={11} /> Pending</span>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Send Request Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); reset(); }} title="Add Connection">
        <form onSubmit={handleSubmit(onSendRequest)} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input type="text" placeholder="Enter their username" className={`input-field ${errors.username ? 'border-red-500/50' : ''}`}
              {...register('username', { required: 'Username is required' })} />
            {errors.username && <p className="text-red-400 text-xs mt-1">{errors.username.message}</p>}
          </div>
          <div>
            <label className="label">Message (optional)</label>
            <textarea rows={2} placeholder="Hey, let's split expenses together!" className="input-field resize-none"
              {...register('message', { maxLength: { value: 200, message: 'Max 200 characters' } })} />
          </div>
          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
            <UserPlus size={16} /> Send Request
          </button>
        </form>
      </Modal>
    </div>
  );
}
