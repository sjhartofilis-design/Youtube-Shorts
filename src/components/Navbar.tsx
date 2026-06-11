import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Scripts' },
  { to: '/queue', label: 'Queue' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/settings', label: 'Settings' },
];

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0f0f0f]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-violet-600" />
          <span className="text-lg font-semibold tracking-tight text-white">
            Shorts Automator
          </span>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
