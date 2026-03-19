import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, ShieldCheck, Users } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

interface AdminBuyerProfile {
  id: number;
  buyer_code: string;
  nickname: string;
  gender: string | null;
  age: number | null;
  city: string | null;
  occupation: string | null;
  background: string | null;
  preferred_categories: string[];
  base_buy_intent: number;
  price_sensitivity: number;
  quality_sensitivity: number;
  brand_sensitivity: number;
  impulse_level: number;
  purchase_power: number;
  current_hour_active_prob: number;
  current_hour_order_intent_prob: number;
  peak_hour: number;
}

interface AdminBuyerPoolOverviewResponse {
  selected_run_id: number | null;
  selected_run_status: string | null;
  selected_run_market: string | null;
  selected_run_username: string | null;
  selected_run_day_index: number | null;
  selected_run_created_at: string | null;
  server_time: string;
  game_clock: string;
  game_hour: number;
  game_minute: number;
  buyer_count: number;
  currently_active_estimate: number;
  expected_orders_per_hour: number;
  profiles: AdminBuyerProfile[];
}

interface AdminRunOption {
  run_id: number;
  user_id: number;
  username: string;
  status: string;
  market: string;
  day_index: number;
  created_at: string;
}

interface AdminRunOptionsResponse {
  runs: AdminRunOption[];
}

interface AdminSimulateOrdersResponse {
  simulated_hours?: number;
  tick_start_time?: string;
  tick_end_time?: string;
  tick_time: string;
  active_buyer_count: number;
  candidate_product_count: number;
  generated_order_count: number;
  skip_reasons: Record<string, number>;
  shop_context: {
    run_id?: number;
    user_id?: number;
    username?: string;
    market?: string;
    status?: string;
  };
  buyer_journeys: Array<{
    buyer_code: string;
    buyer_name: string;
    city?: string | null;
    is_active: boolean;
    active_prob: number;
    active_roll: number;
    decision: string;
    reason: string;
    candidates: Array<{
      listing_id: number;
      title: string;
      category?: string | null;
      sku?: string | null;
      parent_sku?: string | null;
      price: number;
      stock_available: number;
      total_score: number;
    }>;
    selected_candidate?: {
      listing_id: number;
      title: string;
      sku?: string | null;
      parent_sku?: string | null;
      price: number;
      score: number;
    } | null;
    order_prob?: number | null;
    order_roll?: number | null;
    generated_order?: {
      order_no: string;
      listing_id: number;
      product_title: string;
      listing_sku?: string | null;
      variant_sku?: string | null;
      variant_name?: string;
      quantity: number;
      unit_price: number;
      buyer_payment: number;
    } | null;
  }>;
  cancellation_logs: Array<{
    order_id: number;
    order_no: string;
    buyer_name: string;
    cancelled_at: string;
    cancel_reason: string;
    cancel_source: string;
    overdue_hours: number;
    cancel_prob: number;
  }>;
}

interface AdminBuyerPoolPageProps {
  currentUser: {
    username: string;
    full_name: string | null;
  } | null;
  onBackToSetup?: () => void;
  embedded?: boolean;
  onRunContextChange?: (context: {
    runId: number | null;
    username: string | null;
    status: string | null;
    market: string | null;
    dayIndex: number | null;
    createdAt: string | null;
    gameClock: string | null;
  }) => void;
}

function fmtPercent(value: number) {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function fmtDecisionLabel(decision: string) {
  const map: Record<string, string> = {
    generated_order: '生成订单',
    skipped_inactive: '未激活',
    skipped_no_candidate: '无候选商品',
    skipped_probability: '概率未命中',
    skipped_no_stock: '库存不足',
    skipped_invalid_qty: '数量无效',
  };
  return map[decision] ?? decision;
}

export default function AdminBuyerPoolPage({
  currentUser,
  onBackToSetup,
  embedded = false,
  onRunContextChange,
}: AdminBuyerPoolPageProps) {
  const [data, setData] = useState<AdminBuyerPoolOverviewResponse | null>(null);
  const [runOptions, setRunOptions] = useState<AdminRunOption[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [error, setError] = useState('');
  const [simulateError, setSimulateError] = useState('');
  const [simulateResult, setSimulateResult] = useState<AdminSimulateOrdersResponse | null>(null);
  const [refreshTs, setRefreshTs] = useState<number>(Date.now());
  const [fastForwardHours, setFastForwardHours] = useState<number>(1);

  const displayName = currentUser?.full_name?.trim() || currentUser?.username || 'yzcube';

  const loadRunOptions = async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/game/admin/runs/options`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const payload = (await resp.json()) as AdminRunOptionsResponse;
      setRunOptions(payload.runs ?? []);
      if (selectedRunId === null && (payload.runs?.length ?? 0) > 0) {
        setSelectedRunId(payload.runs[0].run_id);
      }
    } catch {
      // ignore
    }
  };

  const loadOverview = async (runId: number | null = selectedRunId) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录态失效，请重新登录');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const url = new URL(`${API_BASE_URL}/game/admin/buyer-pool/overview`);
      if (runId !== null) url.searchParams.set('run_id', String(runId));
      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}));
        throw new Error(payload.detail || '读取买家池失败');
      }
      const payload = (await resp.json()) as AdminBuyerPoolOverviewResponse;
      setData(payload);
      setRefreshTs(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取买家池失败');
    } finally {
      setLoading(false);
    }
  };

  const triggerSimulateOnce = async () => {
    const runId = selectedRunId ?? data?.selected_run_id ?? null;
    if (!runId) {
      setSimulateError('请先选择一个对局');
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setSimulateError('登录态失效，请重新登录');
      return;
    }
    setSimulateError('');
    setSimulateLoading(true);
    try {
      const hours = Math.max(1, Math.min(168, Number.isFinite(fastForwardHours) ? Math.floor(fastForwardHours) : 1));
      let merged: AdminSimulateOrdersResponse | null = null;
      let tickStartTime = '';
      let tickEndTime = '';

      for (let i = 0; i < hours; i += 1) {
        const resp = await fetch(`${API_BASE_URL}/game/admin/runs/${runId}/orders/simulate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) {
          const payload = await resp.json().catch(() => ({}));
          throw new Error(payload.detail || `第 ${i + 1} 小时模拟失败`);
        }
        const payload = (await resp.json()) as AdminSimulateOrdersResponse;
        if (!tickStartTime) tickStartTime = payload.tick_time;
        tickEndTime = payload.tick_time;

        if (!merged) {
          merged = {
            ...payload,
            simulated_hours: 1,
            tick_start_time: payload.tick_time,
            tick_end_time: payload.tick_time,
          };
        } else {
          merged = {
            ...payload,
            simulated_hours: (merged.simulated_hours || 1) + 1,
            tick_start_time: merged.tick_start_time || tickStartTime,
            tick_end_time: payload.tick_time,
            active_buyer_count: merged.active_buyer_count + payload.active_buyer_count,
            candidate_product_count: merged.candidate_product_count + payload.candidate_product_count,
            generated_order_count: merged.generated_order_count + payload.generated_order_count,
            skip_reasons: Object.entries(payload.skip_reasons || {}).reduce((acc, [key, val]) => {
              acc[key] = (acc[key] || 0) + val;
              return acc;
            }, { ...(merged.skip_reasons || {}) } as Record<string, number>),
            cancellation_logs: [...(merged.cancellation_logs || []), ...(payload.cancellation_logs || [])],
          };
        }
      }
      if (merged) {
        merged.tick_start_time = tickStartTime;
        merged.tick_end_time = tickEndTime;
        setSimulateResult(merged);
      }
      await loadOverview(runId);
    } catch (err) {
      setSimulateError(err instanceof Error ? err.message : '模拟订单触发失败');
    } finally {
      setSimulateLoading(false);
    }
  };

  useEffect(() => {
    void loadRunOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadOverview(selectedRunId);
    const timer = window.setInterval(() => {
      void loadOverview(selectedRunId);
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRunId]);

  useEffect(() => {
    onRunContextChange?.({
      runId: data?.selected_run_id ?? null,
      username: data?.selected_run_username ?? null,
      status: data?.selected_run_status ?? null,
      market: data?.selected_run_market ?? null,
      dayIndex: data?.selected_run_day_index ?? null,
      createdAt: data?.selected_run_created_at ?? null,
      gameClock: data?.game_clock ?? null,
    });
  }, [data, onRunContextChange]);

  const topActiveBuyers = useMemo(() => {
    const rows = [...(data?.profiles ?? [])];
    rows.sort((a, b) => b.current_hour_active_prob - a.current_hour_active_prob);
    return rows.slice(0, 3);
  }, [data?.profiles]);

  return (
    <div className={embedded ? 'w-full' : 'fixed inset-0 overflow-y-auto bg-[#eef3fb] p-6 custom-scrollbar'}>
      <div className={embedded ? 'w-full' : 'mx-auto max-w-[1680px]'}>
        <div className="rounded-2xl border border-[#d8e5ff] bg-white px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-[18px] font-black text-slate-800">
                <ShieldCheck size={18} className="text-[#2563eb]" />
                超级管理员 · 买家池实时总览
              </div>
              <div className="mt-1 text-[13px] text-slate-500">
                当前账号：{displayName} ｜ 仅 `super_admin` 可访问
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedRunId ?? ''}
                onChange={(event) => {
                  const val = event.target.value.trim();
                  setSelectedRunId(val ? Number(val) : null);
                }}
                className="h-10 min-w-[260px] rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none"
              >
                <option value="">全部对局（默认）</option>
                {runOptions.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    #{r.run_id} · {r.username} · {r.market} · Day {r.day_index} · {r.status}
                  </option>
                ))}
              </select>
              {!embedded && onBackToSetup && (
                <button
                  type="button"
                  onClick={onBackToSetup}
                  className="h-10 rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  返回工作台
                </button>
              )}
              <button
                type="button"
                onClick={() => void loadOverview()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1d4ed8]"
              >
                <RefreshCw size={14} />
                刷新
              </button>
              <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 h-10">
                <span className="text-[12px] text-slate-500">快进</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  value={fastForwardHours}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (!Number.isFinite(next)) {
                      setFastForwardHours(1);
                      return;
                    }
                    setFastForwardHours(Math.max(1, Math.min(168, Math.floor(next))));
                  }}
                  className="h-7 w-16 rounded border border-slate-200 px-2 text-[12px] font-semibold text-slate-700 outline-none"
                />
                <span className="text-[12px] text-slate-500">小时</span>
              </div>
              <button
                type="button"
                onClick={() => void triggerSimulateOnce()}
                disabled={simulateLoading || !(selectedRunId ?? data?.selected_run_id)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ea580c] px-4 text-[13px] font-semibold text-white hover:bg-[#c2410c] disabled:cursor-not-allowed disabled:bg-[#fdba74]"
              >
                {simulateLoading ? <RefreshCw size={14} className="animate-spin" /> : <Users size={14} />}
                {simulateLoading ? '模拟中...' : `模拟 ${Math.max(1, fastForwardHours)} 小时订单`}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
            <div className="text-[12px] text-slate-500">买家总数</div>
            <div className="mt-2 inline-flex items-center gap-2 text-[28px] font-black text-[#1e3a8a]">
              <Users size={20} />
              {data?.buyer_count ?? '--'}
            </div>
          </div>
          <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
            <div className="text-[12px] text-slate-500">当前时段活跃估算</div>
            <div className="mt-2 text-[28px] font-black text-[#1e3a8a]">
              {data?.currently_active_estimate.toFixed(2) ?? '--'}
            </div>
          </div>
          <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
            <div className="text-[12px] text-slate-500">预估每小时订单(买家池)</div>
            <div className="mt-2 text-[28px] font-black text-[#1e3a8a]">
              {data?.expected_orders_per_hour.toFixed(2) ?? '--'}
            </div>
          </div>
          <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
            <div className="text-[12px] text-slate-500">当前游戏时刻（按选中对局）</div>
            <div className="mt-2 inline-flex items-center gap-2 text-[24px] font-black text-[#1e3a8a]">
              <CalendarClock size={17} />
              {data?.game_clock ?? '--:--:--'}
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              对局：#{data?.selected_run_id ?? '--'} / {data?.selected_run_market || '--'} / {data?.selected_run_status || '--'}
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              最近刷新：{new Date(refreshTs).toLocaleTimeString()} 
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] text-rose-600">
            {error}
          </div>
        )}
        {simulateError && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] text-rose-600">
            {simulateError}
          </div>
        )}
        {simulateResult && (
          <div className="mt-3 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
            <div className="text-[14px] font-bold text-[#9a3412]">本次模拟摘要</div>
            <div className="mt-2 grid grid-cols-5 gap-3 text-[13px]">
              <div className="rounded-lg border border-[#fdba74] bg-white px-3 py-2">
                模拟时长：<span className="font-bold">{simulateResult.simulated_hours || 1}h</span>
              </div>
              <div className="rounded-lg border border-[#fdba74] bg-white px-3 py-2">
                激活买家：<span className="font-bold">{simulateResult.active_buyer_count}</span>
              </div>
              <div className="rounded-lg border border-[#fdba74] bg-white px-3 py-2">
                候选商品：<span className="font-bold">{simulateResult.candidate_product_count}</span>
              </div>
              <div className="rounded-lg border border-[#fdba74] bg-white px-3 py-2">
                生成订单：<span className="font-bold">{simulateResult.generated_order_count}</span>
              </div>
              <div className="rounded-lg border border-[#fdba74] bg-white px-3 py-2">
                模拟时段：
                <span className="font-bold">
                  {new Date(simulateResult.tick_start_time || simulateResult.tick_time).toLocaleString()}
                  {' ~ '}
                  {new Date(simulateResult.tick_end_time || simulateResult.tick_time).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 text-[13px]">
              <div className="rounded-lg border border-[#fdba74] bg-white px-3 py-2">
                本次命中取消：<span className="font-bold text-rose-600">{(simulateResult.cancellation_logs ?? []).length}</span>
              </div>
            </div>
            {Object.keys(simulateResult.skip_reasons || {}).length > 0 && (
              <div className="mt-2 text-[12px] text-[#9a3412]">
                跳过原因：{Object.entries(simulateResult.skip_reasons).map(([key, value]) => `${key}=${value}`).join('；')}
              </div>
            )}
            <div className="mt-2 rounded-lg border border-[#fdba74] bg-white px-3 py-2 text-[12px] text-slate-700">
              店铺上下文：对局 #{simulateResult.shop_context?.run_id ?? '--'} ｜ 玩家 {simulateResult.shop_context?.username ?? '--'}
              （uid={simulateResult.shop_context?.user_id ?? '--'}） ｜ 市场 {simulateResult.shop_context?.market ?? '--'} ｜ 状态 {simulateResult.shop_context?.status ?? '--'}
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-[#fdba74] bg-white">
              <div className="grid grid-cols-[0.9fr_0.9fr_2.2fr_1.3fr_1.2fr_2fr_1.6fr] bg-[#fff1eb] px-3 py-2 text-[12px] font-semibold text-[#9a3412]">
                <div>买家</div>
                <div>激活判定</div>
                <div>候选商品（SKU/价格）</div>
                <div>选中商品</div>
                <div>下单概率</div>
                <div>订单结果</div>
                <div>原因</div>
              </div>
              <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                {(simulateResult.buyer_journeys ?? []).map((row, idx) => (
                  <div
                    key={`${row.buyer_code}-${idx}`}
                    className="grid grid-cols-[0.9fr_0.9fr_2.2fr_1.3fr_1.2fr_2fr_1.6fr] border-t border-[#ffedd5] px-3 py-2 text-[12px] text-slate-700"
                  >
                    <div>
                      <div className="font-semibold">{row.buyer_name}</div>
                      <div className="text-slate-500">{row.buyer_code}</div>
                    </div>
                    <div>
                      <div>{row.is_active ? '已激活' : '未激活'}</div>
                      <div className="text-slate-500">{fmtPercent(row.active_prob || 0)} / {fmtPercent(row.active_roll || 0)}</div>
                    </div>
                    <div className="space-y-1">
                      {(row.candidates ?? []).length === 0 && <div className="text-slate-400">-</div>}
                      {(row.candidates ?? []).slice(0, 3).map((c) => (
                        <div key={c.listing_id} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                          <div className="font-semibold">#{c.listing_id} {c.title}</div>
                          <div className="text-slate-500">SKU:{c.sku || '-'} ｜ 价:{c.price} ｜ 分:{(c.total_score ?? 0).toFixed(3)}</div>
                        </div>
                      ))}
                    </div>
                    <div>
                      {row.selected_candidate ? (
                        <>
                          <div className="font-semibold">#{row.selected_candidate.listing_id}</div>
                          <div className="text-slate-500">SKU:{row.selected_candidate.sku || '-'}</div>
                          <div className="text-slate-500">价:{row.selected_candidate.price}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                    <div>
                      {row.order_prob !== null && row.order_prob !== undefined ? (
                        <>
                          <div>p={fmtPercent(row.order_prob || 0)}</div>
                          <div className="text-slate-500">roll={fmtPercent(row.order_roll || 0)}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                    <div>
                      {row.generated_order ? (
                        <>
                          <div className="font-semibold text-emerald-700">{row.generated_order.order_no}</div>
                          <div className="text-slate-500">SKU:{row.generated_order.variant_sku || row.generated_order.listing_sku || '-'}</div>
                          <div className="text-slate-500">数量:{row.generated_order.quantity} ｜ 单价:{row.generated_order.unit_price} ｜ 实付:{row.generated_order.buyer_payment}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">未生成</span>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold">{fmtDecisionLabel(row.decision)}</div>
                      <div className="text-slate-500">{row.reason || '-'}</div>
                    </div>
                  </div>
                ))}
                {(simulateResult.buyer_journeys ?? []).length === 0 && (
                  <div className="px-3 py-6 text-[12px] text-slate-500">暂无买家决策明细</div>
                )}
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-rose-200 bg-white">
              <div className="flex items-center justify-between bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
                <span>本次取消日志（时间加速后触发）</span>
                <span>{(simulateResult.cancellation_logs ?? []).length} 条</span>
              </div>
              <div className="grid grid-cols-[1.2fr_1.3fr_1.2fr_1fr_1fr_1fr_1fr] bg-rose-50/60 px-3 py-2 text-[12px] font-semibold text-rose-700 border-t border-rose-100">
                <div>订单号</div>
                <div>买家</div>
                <div>取消时间</div>
                <div>超时小时</div>
                <div>取消概率</div>
                <div>取消来源</div>
                <div>取消原因</div>
              </div>
              <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                {(simulateResult.cancellation_logs ?? []).map((log, idx) => (
                  <div
                    key={`${log.order_id}-${idx}`}
                    className="grid grid-cols-[1.2fr_1.3fr_1.2fr_1fr_1fr_1fr_1fr] border-t border-rose-100 px-3 py-2 text-[12px] text-slate-700"
                  >
                    <div className="font-semibold">{log.order_no}</div>
                    <div>{log.buyer_name}</div>
                    <div>{new Date(log.cancelled_at).toLocaleString()}</div>
                    <div>{log.overdue_hours}h</div>
                    <div>{(log.cancel_prob * 100).toFixed(1)}%</div>
                    <div>{log.cancel_source}</div>
                    <div>{log.cancel_reason}</div>
                  </div>
                ))}
                {(simulateResult.cancellation_logs ?? []).length === 0 && (
                  <div className="px-3 py-6 text-[12px] text-slate-500">本次模拟未触发取消</div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-[#dbeafe] bg-white p-4">
          <div className="mb-3 text-[14px] font-bold text-slate-700">当前时段活跃 Top 3</div>
          <div className="grid grid-cols-3 gap-3">
            {topActiveBuyers.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[13px] font-bold text-slate-800">
                  {row.nickname} <span className="text-slate-500">({row.buyer_code})</span>
                </div>
                <div className="mt-1 text-[12px] text-slate-600">
                  当前活跃：{fmtPercent(row.current_hour_active_prob)} ｜ 下单意愿：
                  {fmtPercent(row.current_hour_order_intent_prob)}
                </div>
              </div>
            ))}
            {topActiveBuyers.length === 0 && (
              <div className="text-[13px] text-slate-500">暂无买家数据</div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[#dbeafe] bg-white overflow-hidden">
          <div className="h-12 bg-[#f8fbff] border-b border-[#e7efff] px-4 grid grid-cols-[0.9fr_1.2fr_1fr_1.6fr_1.6fr_1fr_1fr_1fr_1fr_1fr] items-center text-[12px] font-semibold text-slate-500">
            <div>编号</div>
            <div>买家画像</div>
            <div>城市/职业</div>
            <div>偏好类目</div>
            <div>人物背景</div>
            <div>活跃概率</div>
            <div>下单意愿</div>
            <div>价格敏感</div>
            <div>质量敏感</div>
            <div>峰值时段</div>
          </div>
          <div className="max-h-[560px] overflow-y-auto custom-scrollbar">
            {loading && !data && (
              <div className="px-4 py-8 text-[13px] text-slate-500">加载中...</div>
            )}
            {(data?.profiles ?? []).map((row) => (
              <div
                key={row.id}
                className="px-4 py-3 grid grid-cols-[0.9fr_1.2fr_1fr_1.6fr_1.6fr_1fr_1fr_1fr_1fr_1fr] items-start text-[13px] border-b border-slate-100"
              >
                <div className="font-semibold text-slate-700">{row.buyer_code}</div>
                <div className="text-slate-800">
                  {row.nickname}
                  {row.age ? <span className="ml-1 text-slate-500">/ {row.age}岁</span> : null}
                </div>
                <div className="text-slate-600">
                  {(row.city || '-') + ' / ' + (row.occupation || '-')}
                </div>
                <div className="text-slate-600">{row.preferred_categories.join('、') || '-'}</div>
                <div className="text-slate-500 leading-5">{row.background || '-'}</div>
                <div className="font-semibold text-[#2563eb]">{fmtPercent(row.current_hour_active_prob)}</div>
                <div className="font-semibold text-[#1d4ed8]">{fmtPercent(row.current_hour_order_intent_prob)}</div>
                <div className="text-slate-700">{fmtPercent(row.price_sensitivity)}</div>
                <div className="text-slate-700">{fmtPercent(row.quality_sensitivity)}</div>
                <div className="text-slate-600">{String(row.peak_hour).padStart(2, '0')}:00</div>
              </div>
            ))}
            {!loading && (data?.profiles?.length ?? 0) === 0 && (
              <div className="px-4 py-8 text-[13px] text-slate-500">暂无买家画像数据</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
