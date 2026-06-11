import { useState, type FormEvent, type ReactNode } from 'react';

const UNLOCK_KEY = 'shorts-automator:unlocked';
const ACCESS_PASSWORD = 'avoSEED2020!';

export default function PasswordGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(UNLOCK_KEY) === 'true');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password === ACCESS_PASSWORD) {
      localStorage.setItem(UNLOCK_KEY, 'true');
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-white">Shorts Automator</h1>
          <p className="mt-1 text-sm text-gray-400">Enter the password to continue.</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(false);
          }}
          autoFocus
          placeholder="Password"
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
        />
        {error && <p className="text-xs text-red-400">Incorrect password.</p>}
        <button
          type="submit"
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
