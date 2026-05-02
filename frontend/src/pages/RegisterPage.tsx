import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { getStoredToken, register, setStoredToken } from '@/lib/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasToken = useMemo(() => !!getStoredToken(), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    const normalizedInvite = inviteCode.trim().toUpperCase();

    if (!trimmedEmail) {
      setError('请输入邮箱');
      return;
    }
    if (password.length < 8) {
      setError('密码长度不能少于 8 位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const token = await register(trimmedEmail, password, normalizedInvite);
      setStoredToken(token.access_token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (hasToken) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[var(--dark-bg)]">
      <div className="w-[360px] rounded-2xl bg-white/75 px-8 py-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-[var(--dark-surface)]/88 dark:shadow-[0_18px_56px_rgba(0,0,0,0.62)]">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-[var(--dark-text)]">注册 CourseLens</h1>
        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（至少 8 位）"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="确认密码"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
          />
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="邀请码（8位）"
            maxLength={16}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm uppercase text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
          />
          <p className="text-[11px] text-slate-400 dark:text-[var(--dark-muted)]">仅内测用户可填</p>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gray-900 py-2.5 text-sm text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[var(--dark-button-bg)] dark:hover:bg-[var(--dark-button-hover)]"
          >
            {submitting ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500 dark:text-[var(--dark-muted)]">
          已有账号？{' '}
          <Link to="/login" className="text-slate-700 underline dark:text-[var(--dark-text)]">
            去登录
          </Link>
        </p>
      </div>
    </main>
  );
}
