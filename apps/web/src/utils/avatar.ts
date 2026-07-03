export const getAvatarColor = (username: string) => {
  const colors = [
    'bg-orange-500 text-white',
    'bg-sky-500 text-white',
    'bg-emerald-500 text-white',
    'bg-amber-500 text-white',
    'bg-indigo-500 text-white',
    'bg-rose-500 text-white',
    'bg-violet-500 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};
