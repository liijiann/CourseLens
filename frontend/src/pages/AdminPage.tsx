import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { AdminInviteCode, AdminRechargeOrder, AdminUser } from '@/lib/types';
import {
  approveAdminOrder,
  banUser,
  clearAnnouncement,
  clearStoredToken,
  createInviteCode,
  deleteUser,
  fetchAdminPendingOrders,
  fetchAdminUserSessions,
  fetchAdminUsers,
  fetchAnnouncement,
  fetchInviteCodes,
  fetchMe,
  publishAnnouncement,
  rejectAdminOrder,
  removeInviteCode,
  unbanUser,
} from '@/lib/api';

const SESSION_PAGE_SIZE = 10;

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  } catch {
    return '-';
  }
}

function formatUsage(invite: AdminInviteCode): string {
  if (invite.max_uses === -1) {
    return `${invite.used_count}/不限`;
  }
  return `${invite.used_count}/${invite.max_uses}`;
}

function formatMb(value: number): string {
  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} GB`;
  }
  return `${value.toFixed(2)} MB`;
}

function formatPrice(fen: number): string {
  return `¥${(fen / 100).toFixed(2)}`;
}

function formatPackage(pkg: string): string {
  if (pkg === 'small') return '小包';
  if (pkg === 'medium') return '中包';
  if (pkg === 'large') return '大包';
  return pkg;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [operatingUserId, setOperatingUserId] = useState<number | null>(null);
  const [operatingInviteId, setOperatingInviteId] = useState<number | null>(null);
  const [approvingOrderId, setApprovingOrderId] = useState<number | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  const [showInviteCreate, setShowInviteCreate] = useState(false);
  const [inviteNote, setInviteNote] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState<number>(1);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteCreateError, setInviteCreateError] = useState('');
  const [highlightInviteCode, setHighlightInviteCode] = useState('');

  const [announcementContent, setAnnouncementContent] = useState('');
  const [publishingAnnouncement, setPublishingAnnouncement] = useState(false);
  const [clearingAnnouncement, setClearingAnnouncement] = useState(false);
  const [announcementError, setAnnouncementError] = useState('');
  const [announcementSuccess, setAnnouncementSuccess] = useState('');

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [sessionsPage, setSessionsPage] = useState(1);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: 0,
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
    enabled: meQuery.data?.role === 'admin',
  });

  const pendingOrdersQuery = useQuery({
    queryKey: ['admin-pending-orders'],
    queryFn: fetchAdminPendingOrders,
    enabled: meQuery.data?.role === 'admin',
  });

  const inviteCodesQuery = useQuery({
    queryKey: ['invite-codes'],
    queryFn: fetchInviteCodes,
    enabled: meQuery.data?.role === 'admin',
  });

  const announcementQuery = useQuery({
    queryKey: ['announcement'],
    queryFn: fetchAnnouncement,
    enabled: meQuery.data?.role === 'admin',
  });

  const userSessionsQuery = useQuery({
    queryKey: ['admin-user-sessions', selectedUserId, sessionsPage, SESSION_PAGE_SIZE],
    queryFn: () => fetchAdminUserSessions(selectedUserId as number, sessionsPage, SESSION_PAGE_SIZE),
    enabled: meQuery.data?.role === 'admin' && selectedUserId != null,
  });

  useEffect(() => {
    const users = usersQuery.data ?? [];
    if (users.length === 0) {
      setSelectedUserId(null);
      return;
    }
    if (selectedUserId == null || !users.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(users[0].id);
      setSessionsPage(1);
    }
  }, [selectedUserId, usersQuery.data]);

  const selectedUser = useMemo(
    () => (usersQuery.data ?? []).find((u) => u.id === selectedUserId) ?? null,
    [selectedUserId, usersQuery.data],
  );

  const inviteRows = useMemo(() => inviteCodesQuery.data ?? [], [inviteCodesQuery.data]);
  const pendingOrders = useMemo(() => pendingOrdersQuery.data ?? [], [pendingOrdersQuery.data]);

  async function refreshAfterOrderAction() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-pending-orders'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
    ]);
  }

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
      queryClient.invalidateQueries({ queryKey: ['invite-codes'] }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-pending-orders'] }),
    ]);
  }

  async function handleBanToggle(user: AdminUser) {
    setOperatingUserId(user.id);
    setActionError('');
    try {
      if (user.is_active === 1) {
        await banUser(user.id);
      } else {
        await unbanUser(user.id);
      }
      await refreshAll();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setOperatingUserId(null);
    }
  }

  async function handleDeleteUser(user: AdminUser) {
    const ok = window.confirm(`确认删除用户 ${user.email} 吗？该用户的所有会话将被删除。`);
    if (!ok) return;

    setOperatingUserId(user.id);
    setActionError('');
    try {
      await deleteUser(user.id);
      await refreshAll();
      if (selectedUserId === user.id) {
        setSelectedUserId(null);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setOperatingUserId(null);
    }
  }

  async function handleApproveOrder(order: AdminRechargeOrder) {
    setApprovingOrderId(order.id);
    setActionError('');
    try {
      await approveAdminOrder(order.id);
      await refreshAfterOrderAction();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '审批失败');
    } finally {
      setApprovingOrderId(null);
    }
  }

  async function handleRejectOrder(order: AdminRechargeOrder) {
    setRejectingOrderId(order.id);
    setActionError('');
    try {
      await rejectAdminOrder(order.id);
      await refreshAfterOrderAction();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '拒绝失败');
    } finally {
      setRejectingOrderId(null);
    }
  }

  async function handleCreateInviteCode() {
    setCreatingInvite(true);
    setInviteCreateError('');
    setHighlightInviteCode('');
    try {
      const created = await createInviteCode(inviteMaxUses, inviteNote.trim());
      setHighlightInviteCode(created.code);
      setInviteNote('');
      setInviteMaxUses(1);
      setShowInviteCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['invite-codes'] });
    } catch (err) {
      setInviteCreateError(err instanceof Error ? err.message : '创建邀请码失败');
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleDeleteInviteCode(invite: AdminInviteCode) {
    const ok = window.confirm(`确认删除邀请码 ${invite.code} 吗？`);
    if (!ok) return;

    setOperatingInviteId(invite.id);
    setActionError('');
    try {
      await removeInviteCode(invite.id);
      if (highlightInviteCode === invite.code) {
        setHighlightInviteCode('');
      }
      await queryClient.invalidateQueries({ queryKey: ['invite-codes'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '删除邀请码失败');
    } finally {
      setOperatingInviteId(null);
    }
  }

  async function handlePublishAnnouncement() {
    const content = announcementContent.trim();
    if (!content) {
      setAnnouncementError('公告内容不能为空');
      return;
    }

    setPublishingAnnouncement(true);
    setAnnouncementError('');
    setAnnouncementSuccess('');
    try {
      await publishAnnouncement(content);
      setAnnouncementContent('');
      setAnnouncementSuccess('公告发布成功');
      await queryClient.invalidateQueries({ queryKey: ['announcement'] });
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : '发布公告失败');
    } finally {
      setPublishingAnnouncement(false);
    }
  }

  async function handleClearAnnouncement() {
    setClearingAnnouncement(true);
    setAnnouncementError('');
    setAnnouncementSuccess('');
    try {
      await clearAnnouncement();
      setAnnouncementSuccess('已清除当前公告');
      await queryClient.invalidateQueries({ queryKey: ['announcement'] });
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : '清除公告失败');
    } finally {
      setClearingAnnouncement(false);
    }
  }

  function handleLogout() {
    clearStoredToken();
    navigate('/login', { replace: true });
  }

  if (meQuery.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[var(--dark-bg)]">
        <p className="text-sm text-slate-400 dark:text-[var(--dark-muted)]">加载中...</p>
      </main>
    );
  }

  if (meQuery.data?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="admin-page min-h-screen bg-white px-6 py-6 dark:bg-[var(--dark-bg)]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800 dark:text-[var(--dark-text)]">管理员后台</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-[var(--dark-muted)]">用户、订单审核、公告与邀请码管理</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
            >
              返回首页
            </button>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
            >
              退出登录
            </button>
          </div>
        </div>

        <div className="admin-card overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="admin-table-head bg-slate-50 text-xs text-slate-500 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-muted)]">
                <tr>
                  <th className="px-4 py-3">邮箱</th>
                  <th className="px-4 py-3">角色</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">课件数/总页数</th>
                  <th className="px-4 py-3">存储用量</th>
                  <th className="px-4 py-3">注册时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {(usersQuery.data ?? []).map((user) => {
                  const isOperating = operatingUserId === user.id;
                  const isActive = user.is_active === 1;
                  const usedPercent = user.storage_used_percent ?? 0;
                  const barColor = usedPercent >= 100 ? 'bg-red-500' : usedPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500';
                  return (
                    <tr
                      key={user.id}
                      className={`border-t border-slate-100 dark:border-[var(--dark-border)] ${
                        selectedUserId === user.id ? 'bg-slate-50/70 dark:bg-[var(--dark-surface-elev)]/40' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-700 dark:text-[var(--dark-text)]">{user.email}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{user.role}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300'
                          }`}
                        >
                          {isActive ? '正常' : '已封禁'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">
                        {user.session_count} / {user.total_pages} 页
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-[180px]">
                          <p className="text-xs text-slate-600 dark:text-[var(--dark-muted)]">
                            {formatMb(user.storage_used_mb)} / {formatMb(user.storage_quota_mb)} ({usedPercent.toFixed(2)}%)
                          </p>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 dark:bg-[var(--dark-surface-elev)]">
                            <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${Math.min(100, usedPercent)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{formatTime(user.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            disabled={isOperating}
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setSessionsPage(1);
                            }}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
                          >
                            课件
                          </button>
                          <button
                            disabled={isOperating}
                            onClick={() => void handleBanToggle(user)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
                          >
                            {isActive ? '封禁' : '解封'}
                          </button>
                          <button
                            disabled={isOperating}
                            onClick={() => void handleDeleteUser(user)}
                            className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-400/10"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {usersQuery.isPending && (
            <p className="px-4 py-4 text-xs text-slate-500 dark:text-[var(--dark-muted)]">正在加载用户列表...</p>
          )}
          {!usersQuery.isPending && (usersQuery.data ?? []).length === 0 && (
            <p className="px-4 py-4 text-xs text-slate-500 dark:text-[var(--dark-muted)]">暂无用户</p>
          )}
        </div>

        <div className="admin-card mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-[var(--dark-text)]">充值订单审核（待审核）</h2>
            <button
              type="button"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ['admin-pending-orders'] })}
              className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
            >
              刷新
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="admin-table-head bg-slate-50 text-xs text-slate-500 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-muted)]">
                <tr>
                  <th className="px-4 py-3">订单号</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">套餐</th>
                  <th className="px-4 py-3">加配额</th>
                  <th className="px-4 py-3">金额</th>
                  <th className="px-4 py-3">创建时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((order) => {
                  const approving = approvingOrderId === order.id;
                  const rejecting = rejectingOrderId === order.id;
                  return (
                    <tr key={order.id} className="border-t border-slate-100 dark:border-[var(--dark-border)]">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700 dark:text-[var(--dark-text)]">#{order.id}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-[var(--dark-text)]">{order.user_email}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{formatPackage(order.package_id)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{formatMb(order.quota_mb)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{formatPrice(order.amount_fen)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{formatTime(order.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={approving || rejecting}
                            onClick={() => void handleApproveOrder(order)}
                            className="rounded-lg border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40 dark:border-emerald-400/40 dark:text-emerald-300 dark:hover:bg-emerald-400/10"
                          >
                            {approving ? '通过中...' : '通过'}
                          </button>
                          <button
                            type="button"
                            disabled={approving || rejecting}
                            onClick={() => void handleRejectOrder(order)}
                            className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-400/10"
                          >
                            {rejecting ? '拒绝中...' : '拒绝'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pendingOrdersQuery.isPending && (
            <p className="px-1 py-3 text-xs text-slate-500 dark:text-[var(--dark-muted)]">正在加载待审核订单...</p>
          )}
          {!pendingOrdersQuery.isPending && pendingOrders.length === 0 && (
            <p className="px-1 py-3 text-xs text-slate-500 dark:text-[var(--dark-muted)]">暂无待审核订单</p>
          )}
        </div>

        <div className="admin-card mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-[var(--dark-text)]">用户课件详情</h2>
            {selectedUser && (
              <p className="text-xs text-slate-500 dark:text-[var(--dark-muted)]">
                {selectedUser.email} · 共 {userSessionsQuery.data?.total_items ?? selectedUser.session_count} 份 ·
                {' '}总页数 {userSessionsQuery.data?.total_file_pages ?? selectedUser.total_pages} 页
              </p>
            )}
          </div>

          {!selectedUser && <p className="text-xs text-slate-500 dark:text-[var(--dark-muted)]">暂无可查看的用户</p>}

          {selectedUser && (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="admin-table-head bg-slate-50 text-xs text-slate-500 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-muted)]">
                    <tr>
                      <th className="px-4 py-3">Session ID</th>
                      <th className="px-4 py-3">文件名</th>
                      <th className="px-4 py-3">页数</th>
                      <th className="px-4 py-3">上传时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(userSessionsQuery.data?.items ?? []).map((item) => (
                      <tr key={item.session_id} className="border-t border-slate-100 dark:border-[var(--dark-border)]">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-[var(--dark-muted)]">{item.session_id}</td>
                        <td className="max-w-[420px] truncate px-4 py-3 text-slate-700 dark:text-[var(--dark-text)]" title={item.filename}>{item.filename}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{item.total_pages}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{formatTime(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {userSessionsQuery.isPending && (
                <p className="px-1 py-3 text-xs text-slate-500 dark:text-[var(--dark-muted)]">正在加载课件列表...</p>
              )}
              {!userSessionsQuery.isPending && (userSessionsQuery.data?.items.length ?? 0) === 0 && (
                <p className="px-1 py-3 text-xs text-slate-500 dark:text-[var(--dark-muted)]">该用户暂无课件</p>
              )}

              {userSessionsQuery.data && userSessionsQuery.data.total_items > SESSION_PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={sessionsPage <= 1}
                    onClick={() => setSessionsPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-slate-500 dark:text-[var(--dark-muted)]">
                    第 {sessionsPage} / {Math.max(1, Math.ceil(userSessionsQuery.data.total_items / SESSION_PAGE_SIZE))} 页
                  </span>
                  <button
                    type="button"
                    disabled={sessionsPage >= Math.ceil(userSessionsQuery.data.total_items / SESSION_PAGE_SIZE)}
                    onClick={() => setSessionsPage((p) => p + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="admin-card mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-[var(--dark-text)]">通知管理</h2>
          </div>

          <div
            className={`rounded-xl border px-4 py-3 ${
              announcementQuery.data?.content
                ? 'border-amber-200 bg-amber-50 dark:border-amber-400/40 dark:bg-amber-300/10'
                : 'border-slate-200 bg-slate-50 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)]'
            }`}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <p
                className={`text-xs font-medium ${
                  announcementQuery.data?.content
                    ? 'text-amber-700 dark:text-amber-200'
                    : 'text-slate-500 dark:text-[var(--dark-muted)]'
                }`}
              >
                当前公告
              </p>
              {announcementQuery.data?.content && (
                <button
                  type="button"
                  onClick={() => void handleClearAnnouncement()}
                  disabled={clearingAnnouncement}
                  className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-400/10"
                >
                  {clearingAnnouncement ? '清除中...' : '清除'}
                </button>
              )}
            </div>
            {announcementQuery.data?.content ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-[var(--dark-text)]">
                {announcementQuery.data.content}
              </p>
            ) : (
              <p className="text-sm text-slate-400 dark:text-[var(--dark-muted)]">当前暂无生效公告</p>
            )}
          </div>

          <div className="admin-divider my-4 border-t border-slate-200 dark:border-[var(--dark-border)]" />

          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-[var(--dark-text)]">发布新公告</h3>
            <textarea
              value={announcementContent}
              onChange={(e) => setAnnouncementContent(e.target.value)}
              placeholder="输入公告内容（纯文本）"
              rows={3}
              className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-text)]"
            />
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void handlePublishAnnouncement()}
                disabled={publishingAnnouncement}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white transition hover:bg-slate-700 disabled:opacity-40 dark:bg-[var(--dark-accent)] dark:hover:opacity-90"
              >
                {publishingAnnouncement ? '发布中...' : '发布'}
              </button>
            </div>
            {announcementError && <p className="mt-2 text-right text-xs text-red-500">{announcementError}</p>}
            {announcementSuccess && <p className="mt-2 text-right text-xs text-emerald-600 dark:text-emerald-300">{announcementSuccess}</p>}
          </div>
        </div>

        <div className="admin-card mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-[var(--dark-text)]">邀请码管理</h2>
            <button
              onClick={() => {
                setShowInviteCreate((prev) => !prev);
                setInviteCreateError('');
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
            >
              创建邀请码
            </button>
          </div>

          {showInviteCreate && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)]">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={inviteNote}
                  onChange={(e) => setInviteNote(e.target.value)}
                  placeholder="备注（选填）"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-text)]"
                />
                <select
                  value={String(inviteMaxUses)}
                  onChange={(e) => setInviteMaxUses(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-text)]"
                >
                  <option value="1">1 次</option>
                  <option value="5">5 次</option>
                  <option value="10">10 次</option>
                  <option value="-1">不限次数</option>
                </select>
              </div>
              {inviteCreateError && <p className="mt-2 text-xs text-red-500">{inviteCreateError}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setShowInviteCreate(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface)]"
                >
                  取消
                </button>
                <button
                  onClick={() => void handleCreateInviteCode()}
                  disabled={creatingInvite}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white transition hover:bg-slate-700 disabled:opacity-40 dark:bg-[var(--dark-accent)] dark:hover:opacity-90"
                >
                  {creatingInvite ? '创建中...' : '确认创建'}
                </button>
              </div>
            </div>
          )}

          {highlightInviteCode && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-300/40 dark:bg-amber-300/10 dark:text-amber-200">
              新邀请码：<span className="font-semibold tracking-[0.2em]">{highlightInviteCode}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="admin-table-head bg-slate-50 text-xs text-slate-500 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-muted)]">
                <tr>
                  <th className="px-4 py-3">邀请码</th>
                  <th className="px-4 py-3">备注</th>
                  <th className="px-4 py-3">已用/上限</th>
                  <th className="px-4 py-3">创建时间</th>
                  <th className="px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {inviteRows.map((invite) => {
                  const isDeleting = operatingInviteId === invite.id;
                  const isHighlighted = highlightInviteCode === invite.code;
                  return (
                    <tr
                      key={invite.id}
                      className={`border-t border-slate-100 dark:border-[var(--dark-border)] ${isHighlighted ? 'bg-amber-50/60 dark:bg-amber-300/10' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs tracking-[0.18em] text-slate-700 dark:text-[var(--dark-text)]">{invite.code}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{invite.note || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{formatUsage(invite)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-[var(--dark-muted)]">{formatTime(invite.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          disabled={isDeleting}
                          onClick={() => void handleDeleteInviteCode(invite)}
                          className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-400/10"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {inviteCodesQuery.isPending && (
            <p className="px-1 py-3 text-xs text-slate-500 dark:text-[var(--dark-muted)]">正在加载邀请码...</p>
          )}
          {!inviteCodesQuery.isPending && inviteRows.length === 0 && (
            <p className="px-1 py-3 text-xs text-slate-500 dark:text-[var(--dark-muted)]">暂无邀请码</p>
          )}
        </div>

        {actionError && <p className="mt-3 text-xs text-red-500">{actionError}</p>}
      </div>
    </main>
  );
}
