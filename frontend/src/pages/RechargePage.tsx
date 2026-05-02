import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  confirmOrder,
  createOrder,
  getRechargePackages,
  getStorageStatus,
  getUserOrders,
} from '@/lib/api';

function formatMb(value: number): string {
  if (value >= 1024) {
    return `${(value / 1024).toFixed(2)} GB`;
  }
  return `${value.toFixed(2)} MB`;
}

function formatPrice(fen: number): string {
  return `¥${(fen / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function getWechatQrByAmountFen(amountFen: number): string {
  if (amountFen === 300) return '/wechat-pay-3.png';
  if (amountFen === 1000) return '/wechat-pay-10.png';
  if (amountFen === 4000) return '/wechat-pay-40.png';
  return '/wechat-pay-3.png';
}

export default function RechargePage() {
  const queryClient = useQueryClient();
  const [creatingId, setCreatingId] = useState<string>('');
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const packagesQuery = useQuery({
    queryKey: ['recharge-packages'],
    queryFn: getRechargePackages,
  });
  const storageQuery = useQuery({
    queryKey: ['storage-status'],
    queryFn: getStorageStatus,
  });
  const ordersQuery = useQuery({
    queryKey: ['recharge-orders'],
    queryFn: getUserOrders,
  });

  const usedPercent = storageQuery.data?.used_percent ?? 0;
  const progressColor = usedPercent >= 100 ? 'bg-red-500' : usedPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500';

  const activeOrder = useMemo(
    () => ordersQuery.data?.find((item) => item.id === activeOrderId) ?? null,
    [ordersQuery.data, activeOrderId],
  );

  async function handleCreateOrder(packageId: string): Promise<void> {
    setCreatingId(packageId);
    setError('');
    setMessage('');
    try {
      const payload = await createOrder(packageId);
      setActiveOrderId(payload.order_id);
      setMessage(`订单已创建：#${payload.order_id}，请完成付款后提交审核`);
      await queryClient.invalidateQueries({ queryKey: ['recharge-orders'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建订单失败');
    } finally {
      setCreatingId('');
    }
  }

  async function handleConfirmOrder(): Promise<void> {
    if (!activeOrderId) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await confirmOrder(activeOrderId);
      setMessage('已提交人工审核，请等待管理员确认');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recharge-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['storage-status'] }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交审核失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 text-slate-800 dark:text-[var(--dark-text)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
        <h1 className="text-lg font-semibold">存储空间</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-[var(--dark-muted)]">
          已用 {formatMb(storageQuery.data?.used_mb ?? 0)} / {formatMb(storageQuery.data?.quota_mb ?? 60)}
        </p>
        <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-[var(--dark-surface-elev)]">
          <div className={`h-2 rounded-full ${progressColor}`} style={{ width: `${Math.min(100, usedPercent)}%` }} />
        </div>
        {usedPercent > 80 && (
          <p className={`mt-2 text-xs ${usedPercent >= 100 ? 'text-red-500' : 'text-amber-500'}`}>
            {usedPercent >= 100 ? '存储空间已满，请充值' : '存储空间即将用完，建议尽快充值'}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
        <h2 className="text-lg font-semibold">充值套餐</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(packagesQuery.data ?? []).map((pkg) => (
            <div key={pkg.id} className="rounded-xl border border-slate-200 p-4 dark:border-[var(--dark-border)]">
              <p className="text-base font-semibold">{pkg.name}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-[var(--dark-muted)]">+{formatMb(pkg.quota_mb)}</p>
              <p className="mt-3 text-xl font-bold">{formatPrice(pkg.price_fen)}</p>
              <button
                type="button"
                onClick={() => void handleCreateOrder(pkg.id)}
                disabled={creatingId === pkg.id}
                className="mt-4 w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-white transition hover:bg-black disabled:opacity-50"
              >
                {creatingId === pkg.id ? '创建中...' : '购买'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {activeOrder && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
          <h2 className="text-lg font-semibold">订单支付</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-[var(--dark-muted)]">
            当前订单 #{activeOrder.id}，请在微信付款备注中填写订单号。
          </p>
          <div className="mt-4 rounded-lg border border-slate-200 p-3 text-center dark:border-[var(--dark-border)]">
            <p className="mb-2 text-sm">微信收款码（{formatPrice(activeOrder.amount_fen)}）</p>
            <img
              src={getWechatQrByAmountFen(activeOrder.amount_fen)}
              alt="微信收款码"
              className="mx-auto h-72 w-72 max-w-full object-contain"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleConfirmOrder()}
            disabled={submitting}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? '提交中...' : '我已付款，提交审核'}
          </button>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
        <h2 className="text-lg font-semibold">订单记录</h2>
        <div className="mt-4 space-y-2">
          {(ordersQuery.data ?? []).map((order) => (
            <div key={order.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-[var(--dark-border)]">
              <div>
                <p>
                  #{order.id} {order.package_id} +{formatMb(order.quota_mb)} {formatPrice(order.amount_fen)}
                </p>
                <p className="text-xs text-slate-500 dark:text-[var(--dark-muted)]">{formatTime(order.created_at)}</p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  order.status === 'paid'
                    ? 'bg-emerald-100 text-emerald-700'
                    : order.status === 'cancelled'
                      ? 'bg-red-100 text-red-600'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {order.status === 'paid' ? '已支付' : order.status === 'cancelled' ? '已拒绝' : '待审核'}
              </span>
            </div>
          ))}
          {ordersQuery.data && ordersQuery.data.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-[var(--dark-muted)]">暂无订单记录</p>
          )}
        </div>
      </section>

      {message && <p className="text-sm text-emerald-600">{message}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </main>
  );
}
