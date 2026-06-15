import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ACCOUNT_EMAIL, supabase } from '../api/supabase';

export default function PasswordGate({
  children,
}: {
  children: (session: Session) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from('app_meta')
      .select('password_set')
      .eq('id', true)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setError(
            `Could not reach the server (${error.message}). Check the Supabase configuration.`
          );
          return;
        }
        setPasswordSet(Boolean(data?.password_set));
      });
  }, []);

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: ACCOUNT_EMAIL,
        password,
      });
      if (error) throw error;
      if (!data.session) {
        throw new Error(
          'Account created but no session was returned. Disable "Confirm email" for the Email provider in Supabase Auth settings.'
        );
      }

      const { error: metaError } = await supabase
        .from('app_meta')
        .update({ password_set: true })
        .eq('id', true);
      if (metaError) throw metaError;

      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: ACCOUNT_EMAIL,
        password,
      });
      if (error) throw error;
      setSession(data.session);
    } catch {
      setError('Incorrect password.');
    } finally {
      setLoading(false);
    }
  };

  if (session) {
    return <>{children(session)}</>;
  }

  if (passwordSet === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4">
        {error ? (
          <p className="max-w-sm text-center text-sm text-red-400">{error}</p>
        ) : (
          <p className="text-sm text-gray-500">Loading…</p>
        )}
      </div>
    );
  }

  if (!passwordSet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4">
        <form
          onSubmit={handleSetPassword}
          className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-6"
        >
          <div>
            <h1 className="text-lg font-semibold text-white">Shorts Automator</h1>
            <p className="mt-1 text-sm text-gray-400">
              Set a password to protect this dashboard. You'll use it to sign in from any device.
            </p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="New password (min. 8 characters)"
            autoComplete="new-password"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
          >
            {loading ? 'Setting up…' : 'Set Password'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-4">
      <form
        onSubmit={handleSignIn}
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
            setError(null);
          }}
          autoFocus
          placeholder="Password"
          autoComplete="current-password"
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-violet-500"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
