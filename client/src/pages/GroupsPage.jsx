import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Plus, Users, Trash2, Settings, UserPlus, Search, X, Check, LogOut } from 'lucide-react';
import { fetchGroups, createGroup, deleteGroup } from '../store/slices/groupsSlice';
import { PageHeader, EmptyState, Spinner } from '../components/ui/index';
import Modal from '../components/ui/Modal';
import { useForm } from 'react-hook-form';
import { groupAPI } from '../services/api';
import toast from 'react-hot-toast';
import Avatar from '../components/ui/Avatar';

const GROUP_COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#f97316', '#ec4899'];

export default function GroupsPage() {
  const dispatch = useDispatch();
  const { items: groups, loading } = useSelector(s => s.groups);
  const { items: connections } = useSelector(s => s.connections);
  const { user } = useSelector(s => s.auth);
  const [showCreate, setShowCreate] = useState(false);
  const [manageGroup, setManageGroup] = useState(null);
  const [selectedColor, setSelectedColor] = useState(GROUP_COLORS[0]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => { dispatch(fetchGroups()); }, [dispatch]);

  const onCreateGroup = async (data) => {
    const result = await dispatch(createGroup({
      ...data,
      avatarColor: selectedColor,
      memberIds: selectedMemberIds,
    }));
    if (createGroup.fulfilled.match(result)) {
      setShowCreate(false);
      reset();
      setSelectedMemberIds([]);
    }
  };

  const toggleMemberSelect = (id) => {
    setSelectedMemberIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleDelete = (id) => {
    if (!confirm('Delete this group? This cannot be undone.')) return;
    dispatch(deleteGroup(id));
  };

  const handleLeave = async (id) => {
    if (!confirm('Leave this group?')) return;
    try {
      await groupAPI.leave(id);
      dispatch(fetchGroups());
      toast.success('Left group');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to leave group');
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Groups"
        subtitle={`${groups.length} group${groups.length !== 1 ? 's' : ''}`}
        action={
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Group
          </button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={28} /></div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No groups yet"
          description="Create a group to split expenses with multiple people"
          action={
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Create Group
            </button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => {
            const isCreator = group.createdBy === user?._id ||
              (typeof group.createdBy === 'object' && group.createdBy?._id === user?._id);
            const myMember = group.members?.find(m => {
              const uid = m.userId?._id || m.userId;
              return uid === user?._id;
            });

            return (
              <div key={group._id} className="card hover:border-white/15 transition-all group">
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0 shadow-lg"
                    style={{ backgroundColor: group.avatarColor || '#14b8a6' }}
                  >
                    {group.name?.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-surface-50 truncate">{group.name}</h3>
                    {group.description && (
                      <p className="text-surface-500 text-xs truncate mt-0.5">{group.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-surface-500 text-xs">{group.members?.length || 0} members</p>
                      {myMember?.role === 'admin' && (
                        <span className="badge badge-brand text-xs">admin</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Members preview */}
                {group.members?.length > 0 && (
                  <div className="flex -space-x-2 mb-4">
                    {group.members.slice(0, 6).map((m, i) => {
                      const memberUser = m.userId;
                      const name = memberUser?.displayName || memberUser?.username || '';
                      const color = memberUser?.avatarColor || m.avatarColor || '#64748b';
                      return (
                        <div
                          key={i}
                          className="w-8 h-8 rounded-full border-2 border-surface-900 flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: color }}
                          title={name}
                        >
                          {name.slice(0, 1).toUpperCase() || '?'}
                        </div>
                      );
                    })}
                    {group.members.length > 6 && (
                      <div className="w-8 h-8 rounded-full border-2 border-surface-900 bg-surface-700 flex items-center justify-center text-xs text-surface-400">
                        +{group.members.length - 6}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-3 border-t border-white/6">
                  {myMember?.role === 'admin' && (
                    <>
                      <button
                        onClick={() => setManageGroup(group)}
                        className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 flex-1 justify-center"
                      >
                        <Settings size={13} /> Manage
                      </button>
                      <button
                        onClick={() => handleDelete(group._id)}
                        className="btn-danger text-xs flex items-center gap-1.5 py-1.5"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  )}
                  {myMember?.role !== 'admin' && (
                    <button
                      onClick={() => handleLeave(group._id)}
                      className="btn-ghost text-xs flex items-center gap-1.5 py-1.5 flex-1 justify-center text-yellow-400 hover:text-yellow-300"
                    >
                      <LogOut size={13} /> Leave
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Group Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); setSelectedMemberIds([]); }} title="Create Group" size="lg">
        <form onSubmit={handleSubmit(onCreateGroup)} className="space-y-5">
          <div>
            <label className="label">Group Name *</label>
            <input
              type="text"
              placeholder="e.g. Roommates, Trip to Bali…"
              className={`input-field ${errors.name ? 'border-red-500/50' : ''}`}
              {...register('name', { required: 'Name required', maxLength: { value: 50, message: 'Too long' } })}
            />
            {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              rows={2}
              placeholder="What is this group for?"
              className="input-field resize-none"
              {...register('description', { maxLength: { value: 200, message: 'Too long' } })}
            />
          </div>

          <div>
            <label className="label">Color</label>
            <div className="flex gap-2 flex-wrap">
              {GROUP_COLORS.map(c => (
                <button
                  key={c} type="button" onClick={() => setSelectedColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${selectedColor === c ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-surface-900 scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Member picker from connections */}
          {connections.length > 0 && (
            <div>
              <label className="label">
                Add Members
                {selectedMemberIds.length > 0 && (
                  <span className="ml-2 text-brand-400 font-normal text-xs">{selectedMemberIds.length} selected</span>
                )}
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {connections.map(c => {
                  const id = c._id || c.connectionId;
                  const selected = selectedMemberIds.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleMemberSelect(id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${
                        selected
                          ? 'border-brand-500/40 bg-brand-500/10'
                          : 'border-white/8 bg-surface-800/30 hover:border-white/15'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: c.avatarColor || '#64748b' }}
                      >
                        {(c.displayName || c.username || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-surface-200 text-sm font-medium truncate">{c.displayName || c.username}</p>
                        <p className="text-surface-500 text-xs">@{c.username}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                        selected ? 'bg-brand-500 border-brand-500' : 'border-white/20'
                      }`}>
                        {selected && <Check size={12} className="text-white" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button type="submit" className="btn-primary w-full">
            Create Group
            {selectedMemberIds.length > 0 && ` with ${selectedMemberIds.length + 1} people`}
          </button>
        </form>
      </Modal>

      {/* Manage Group Modal */}
      <Modal
        open={!!manageGroup}
        onClose={() => setManageGroup(null)}
        title={`Manage: ${manageGroup?.name}`}
        size="lg"
      >
        {manageGroup && (
          <GroupManager
            group={manageGroup}
            onUpdate={() => { dispatch(fetchGroups()); setManageGroup(null); }}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Group Manager Component ──────────────────────────────────────────────────
function GroupManager({ group, onUpdate }) {
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [loadingEligible, setLoadingEligible] = useState(true);
  const [adding, setAdding] = useState(null); // userId being added
  const [search, setSearch] = useState('');

  // Load users eligible to be added (connected but not already members)
  useEffect(() => {
    const load = async () => {
      setLoadingEligible(true);
      try {
        const { data } = await groupAPI.eligibleMembers(group._id);
        setEligibleUsers(data.data?.users || []);
      } catch {
        setEligibleUsers([]);
      } finally {
        setLoadingEligible(false);
      }
    };
    load();
  }, [group._id]);

  const filteredEligible = useMemo(() => {
    if (!search) return eligibleUsers;
    const s = search.toLowerCase();
    return eligibleUsers.filter(u =>
      u.username?.toLowerCase().includes(s) ||
      (u.displayName || '').toLowerCase().includes(s)
    );
  }, [eligibleUsers, search]);

  const handleAddMember = async (user) => {
    setAdding(user._id);
    try {
      await groupAPI.addMember(group._id, { userId: user._id });
      toast.success(`${user.displayName || user.username} added!`);
      // Remove from eligible list immediately (optimistic)
      setEligibleUsers(prev => prev.filter(u => u._id !== user._id));
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add member');
    } finally {
      setAdding(null);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Remove this member?')) return;
    try {
      await groupAPI.removeMember(group._id, userId);
      toast.success('Member removed');
      onUpdate();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove member');
    }
  };

  return (
    <div className="space-y-6">
      {/* Current members */}
      <div>
        <h4 className="label mb-3">Current Members ({group.members?.length || 0})</h4>
        <div className="space-y-2">
          {group.members?.map((m, i) => {
            const memberUser = m.userId;
            const uid = memberUser?._id || m.userId;
            const name = memberUser?.displayName || memberUser?.username || 'Unknown';
            const username = memberUser?.username || '';
            const color = memberUser?.avatarColor || m.avatarColor || '#64748b';

            return (
              <div key={i} className="flex items-center gap-3 p-3 bg-surface-800/40 rounded-xl border border-white/6">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-surface-200 text-sm font-medium truncate">{name}</p>
                  {username && <p className="text-surface-500 text-xs">@{username}</p>}
                </div>
                {m.role === 'admin' ? (
                  <span className="badge badge-brand text-xs">admin</span>
                ) : (
                  <button
                    onClick={() => handleRemoveMember(uid)}
                    className="text-surface-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Remove member"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add from connected users */}
      <div>
        <h4 className="label mb-3">
          Add from Connections
          {!loadingEligible && eligibleUsers.length > 0 && (
            <span className="ml-2 text-surface-500 font-normal text-xs">({eligibleUsers.length} available)</span>
          )}
        </h4>

        {loadingEligible ? (
          <div className="flex justify-center py-4"><Spinner size={20} /></div>
        ) : eligibleUsers.length === 0 ? (
          <p className="text-surface-500 text-sm text-center py-4 border border-dashed border-white/10 rounded-xl">
            All your connections are already in this group
          </p>
        ) : (
          <>
            {/* Search filter */}
            {eligibleUsers.length > 4 && (
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                <input
                  type="text"
                  placeholder="Search connections…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="input-field pl-9 text-sm py-2"
                />
              </div>
            )}

            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {filteredEligible.map(u => (
                <div key={u._id} className="flex items-center gap-3 p-2.5 bg-surface-800/30 rounded-xl border border-white/6 hover:border-white/12 transition-all">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: u.avatarColor || '#64748b' }}
                  >
                    {(u.displayName || u.username || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-surface-200 text-sm font-medium truncate">{u.displayName || u.username}</p>
                    <p className="text-surface-500 text-xs">@{u.username}</p>
                  </div>
                  <button
                    onClick={() => handleAddMember(u)}
                    disabled={adding === u._id}
                    className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-shrink-0"
                  >
                    {adding === u._id
                      ? <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                      : <><UserPlus size={12} /> Add</>
                    }
                  </button>
                </div>
              ))}
              {filteredEligible.length === 0 && search && (
                <p className="text-surface-500 text-sm text-center py-3">No connections match "{search}"</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
