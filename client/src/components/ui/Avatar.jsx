// Avatar component
export default function Avatar({ user, size = 'md', className = '' }) {
  const sizes = { xs: 'w-6 h-6 text-[10px]', sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg', xl: 'w-20 h-20 text-2xl' };
  const initials = user?.displayName?.slice(0, 2).toUpperCase() || user?.username?.slice(0, 2).toUpperCase() || '??';
  const bg = user?.avatarColor || '#14b8a6';

  if (user?.avatar) {
    return <img src={user.avatar} alt={initials} className={`${sizes[size]} rounded-full object-cover ring-2 ring-white/10 ${className}`} />;
  }
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-display font-bold text-white ring-2 ring-white/10 flex-shrink-0 ${className}`}
      style={{ backgroundColor: bg }}>
      {initials}
    </div>
  );
}
