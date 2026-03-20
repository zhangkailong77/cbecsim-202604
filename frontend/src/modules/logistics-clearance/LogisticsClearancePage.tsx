import { CalendarClock, ChevronRight, CircleCheckBig, Clock3, ShieldCheck, Truck } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import logoImg from '../../assets/home/logo.png';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const REAL_SECONDS_PER_GAME_DAY = 30 * 60;
const BOOKED_SECONDS = 10;

type ShipmentStatus = 'booked' | 'in_transit' | 'customs_processing' | 'customs_cleared';

interface LogisticsClearancePageProps {
  run: {
    id: number;
    market: string;
    initial_cash: number;
  } | null;
  currentUser: {
    username: string;
    full_name: string | null;
  } | null;
  onBackToSetup: () => void;
  onEnterShopee: () => void;
}

interface ProcurementSummary {
  total_cash: number;
  spent_total: number;
  remaining_cash: number;
}

interface ProcurementOrderItem {
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

interface ProcurementOrder {
  id: number;
  total_amount: number;
  created_at: string;
  items: ProcurementOrderItem[];
}

interface OrdersResp {
  orders: ProcurementOrder[];
}

interface Shipment {
  id: number;
  orderIds: number[];
  forwarderKey: 'economy' | 'standard' | 'express';
  forwarderLabel: string;
  customsKey: 'normal' | 'priority';
  customsLabel: string;
  cargoValue: number;
  logisticsFee: number;
  customsFee: number;
  totalFee: number;
  transportDays: number;
  customsDays: number;
  createdAt: string;
}

interface LogisticsShipmentApi {
  id: number;
  order_ids: number[];
  forwarder_key: 'economy' | 'standard' | 'express';
  forwarder_label: string;
  customs_key: 'normal' | 'priority';
  customs_label: string;
  cargo_value: number;
  logistics_fee: number;
  customs_fee: number;
  total_fee: number;
  transport_days: number;
  customs_days: number;
  created_at: string;
}

interface LogisticsShipmentsResp {
  shipments: LogisticsShipmentApi[];
}

const FORWARDERS = [
  { key: 'economy', label: '经济线（马来）', feeRate: 0.035, fixedFee: 1800, etaDays: 18, stability: '中' },
  { key: 'standard', label: '标准线（马来）', feeRate: 0.052, fixedFee: 2600, etaDays: 12, stability: '高' },
  { key: 'express', label: '快速线（马来）', feeRate: 0.075, fixedFee: 3600, etaDays: 8, stability: '很高' },
] as const;

const CUSTOMS = [
  { key: 'normal', label: '标准清关', addFee: 0, days: 4 },
  { key: 'priority', label: '加急清关', addFee: 1200, days: 2 },
] as const;

const statusLabel: Record<ShipmentStatus, string> = {
  booked: '已订舱',
  in_transit: '运输中',
  customs_processing: '清关中',
  customs_cleared: '清关完成',
};

function parseServerDateMs(value: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

function calcShipmentRuntime(shipment: Shipment, nowMs: number) {
  const createdMs = parseServerDateMs(shipment.createdAt);
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
  const transportSeconds = Math.max(1, Math.round(shipment.transportDays * REAL_SECONDS_PER_GAME_DAY));
  const customsSeconds = Math.max(1, Math.round(shipment.customsDays * REAL_SECONDS_PER_GAME_DAY));
  const totalSeconds = BOOKED_SECONDS + transportSeconds + customsSeconds;
  const remainSeconds = Math.max(0, totalSeconds - elapsedSeconds);

  let status: ShipmentStatus = 'booked';
  if (elapsedSeconds >= BOOKED_SECONDS + transportSeconds + customsSeconds) {
    status = 'customs_cleared';
  } else if (elapsedSeconds >= BOOKED_SECONDS + transportSeconds) {
    status = 'customs_processing';
  } else if (elapsedSeconds >= BOOKED_SECONDS) {
    status = 'in_transit';
  }

  return {
    status,
    totalSeconds,
    remainSeconds,
    progressPercent: Math.min(100, Math.max(0, Math.round((elapsedSeconds / totalSeconds) * 100))),
  };
}

export default function LogisticsClearancePage({ run, currentUser, onBackToSetup, onEnterShopee }: LogisticsClearancePageProps) {
  const [scale, setScale] = useState(1);
  const [orders, setOrders] = useState<ProcurementOrder[]>([]);
  const [summary, setSummary] = useState<ProcurementSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [selectedForwarder, setSelectedForwarder] = useState<(typeof FORWARDERS)[number]>(FORWARDERS[1]);
  const [selectedCustoms, setSelectedCustoms] = useState<(typeof CUSTOMS)[number]>(CUSTOMS[0]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [remainingCashLocal, setRemainingCashLocal] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [acceleratingShipmentId, setAcceleratingShipmentId] = useState<number | null>(null);

  const playerDisplayName = currentUser?.full_name?.trim() || currentUser?.username || '玩家';

  useEffect(() => {
    const resize = () => {
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const ws = vw / BASE_WIDTH;
      const hs = vh / BASE_HEIGHT;
      setScale(Math.max(ws, hs));
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadData = async () => {
    if (!run?.id) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;

    setLoading(true);
    try {
      const [orderResp, summaryResp, shipmentResp] = await Promise.all([
        fetch(`${API_BASE_URL}/game/runs/${run.id}/procurement/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/game/runs/${run.id}/procurement/cart-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/game/runs/${run.id}/logistics/shipments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (orderResp.ok) {
        const data = (await orderResp.json()) as OrdersResp;
        setOrders(data.orders);
      }
      if (summaryResp.ok) {
        const data = (await summaryResp.json()) as ProcurementSummary;
        setSummary(data);
        setRemainingCashLocal(data.remaining_cash);
      }
      if (shipmentResp.ok) {
        const data = (await shipmentResp.json()) as LogisticsShipmentsResp;
        const mapped = data.shipments.map((row) => ({
          id: row.id,
          orderIds: row.order_ids,
          forwarderKey: row.forwarder_key,
          forwarderLabel: row.forwarder_label,
          customsKey: row.customs_key,
          customsLabel: row.customs_label,
          cargoValue: row.cargo_value,
          logisticsFee: row.logistics_fee,
          customsFee: row.customs_fee,
          totalFee: row.total_fee,
          transportDays: row.transport_days,
          customsDays: row.customs_days,
          createdAt: row.created_at,
        }));
        setShipments(mapped);
        if (mapped.length > 0) {
          const latest = mapped[0];
          const forwarder = FORWARDERS.find((item) => item.key === latest.forwarderKey);
          const customs = CUSTOMS.find((item) => item.key === latest.customsKey);
          if (forwarder) setSelectedForwarder(forwarder);
          if (customs) setSelectedCustoms(customs);
        }
        setSelectedOrderIds([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [run?.id]);

  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedOrderIds.includes(order.id)),
    [orders, selectedOrderIds],
  );

  const selectedOrderValue = useMemo(
    () => selectedOrders.reduce((sum, order) => sum + order.total_amount, 0),
    [selectedOrders],
  );

  const totalPieces = useMemo(
    () => selectedOrders.reduce((sum, order) => sum + order.items.reduce((inner, item) => inner + item.quantity, 0), 0),
    [selectedOrders],
  );

  const logisticsFee = Math.round(selectedOrderValue * selectedForwarder.feeRate) + (selectedOrders.length > 0 ? selectedForwarder.fixedFee : 0);
  const customsFee = Math.round(selectedOrderValue * 0.02) + (selectedOrders.length > 0 ? 600 : 0) + selectedCustoms.addFee;
  const totalFee = logisticsFee + customsFee;
  const etaDays = selectedForwarder.etaDays + selectedCustoms.days;
  const currentCash = remainingCashLocal ?? summary?.remaining_cash ?? 0;
  const cashAfterShipment = currentCash - totalFee;
  const canConfirmShipment = selectedOrders.length > 0 && cashAfterShipment >= 0;
  const shippedOrderIds = useMemo(
    () => new Set(shipments.flatMap((shipment) => shipment.orderIds)),
    [shipments],
  );
  const shipmentRuntimes = useMemo(
    () => shipments.map((shipment) => ({ shipment, runtime: calcShipmentRuntime(shipment, nowMs) })),
    [shipments, nowMs],
  );
  const latestPendingShipment = useMemo(
    () => shipmentRuntimes.find((item) => item.runtime.status !== 'customs_cleared') ?? null,
    [shipmentRuntimes],
  );
  const canEnterShopee = shipmentRuntimes.some((item) => item.runtime.status === 'customs_cleared');

  const toggleOrder = (id: number) => {
    if (shippedOrderIds.has(id)) return;
    setSelectedOrderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleConfirmShipment = async () => {
    if (!canConfirmShipment) {
      setError('请先选择待发运订单，并确保资金足够覆盖物流与清关费用。');
      return;
    }
    if (!run?.id) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录状态失效，请重新登录。');
      return;
    }
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/game/runs/${run.id}/logistics/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          order_ids: selectedOrderIds,
          forwarder_key: selectedForwarder.key,
          customs_key: selectedCustoms.key,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.detail || '发运失败，请稍后重试。');
        return;
      }
      await loadData();
      const stageTotalSeconds = BOOKED_SECONDS + Math.round((selectedForwarder.etaDays + selectedCustoms.days) * REAL_SECONDS_PER_GAME_DAY);
      localStorage.setItem(`cbec_stage_countdown_deadline_run_${run.id}`, String(Date.now() + stageTotalSeconds * 1000));
      localStorage.setItem(`cbec_current_stage_run_${run.id}`, 'step03');
      setSelectedOrderIds([]);
    } catch {
      setError('发运失败，请检查网络后重试。');
    }
  };

  const handleDebugAccelerateClearance = async () => {
    if (!run?.id || !latestPendingShipment) {
      setError('当前没有可加速的物流单。');
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录状态失效，请重新登录。');
      return;
    }
    setError('');
    setAcceleratingShipmentId(latestPendingShipment.shipment.id);
    try {
      const response = await fetch(
        `${API_BASE_URL}/game/runs/${run.id}/logistics/shipments/${latestPendingShipment.shipment.id}/debug/accelerate-clearance`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.detail || '加速失败，请稍后重试。');
        return;
      }
      await loadData();
    } catch {
      setError('加速失败，请检查网络后重试。');
    } finally {
      setAcceleratingShipmentId(null);
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#eef4ff]">
      <div
        style={{
          width: `${BASE_WIDTH}px`,
          height: `${BASE_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          left: 0,
          top: 0,
        }}
        className="bg-[#eef4ff]"
      >
        <header className="h-[78px] border-b border-[#e5ecfb] bg-white px-5">
          <div className="flex h-full items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-11 w-11">
                <span className="logo-breathe absolute inset-[-7px] rounded-full bg-blue-400/30 blur-lg" />
                <span className="logo-breathe logo-breathe-delay absolute inset-[-13px] rounded-full bg-cyan-300/20 blur-xl" />
                <div className="relative h-11 w-11 overflow-hidden rounded-full border border-blue-100 bg-white p-1 shadow-[0_8px_24px_rgba(37,99,235,0.22)]">
                  <img src={logoImg} alt="CbecSim" className="h-full w-full rounded-full object-cover" />
                </div>
              </div>
              <div>
                <div className="text-[30px] font-black leading-none text-[#2563eb]">CbecSim</div>
                <div className="-mt-0.5 text-[12px] font-semibold text-[#60a5fa]">跨境运营仿真平台</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[13px] font-semibold text-slate-700">
              <div className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700">STEP 03 国际物流与清关</div>
              <div className="rounded-full border border-slate-200 px-3 py-1.5">玩家：{playerDisplayName}</div>
              <div className="rounded-full border border-slate-200 px-3 py-1.5">局 #{run?.id ?? '-'}</div>
              <button onClick={onBackToSetup} className="rounded-full border border-slate-200 px-4 py-1.5">返回工作台</button>
              <button
                onClick={onEnterShopee}
                disabled={!canEnterShopee}
                className="rounded-full bg-[#2563eb] px-5 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-40"
                title={canEnterShopee ? '' : '至少完成 1 票清关后可进入 Step 04 入仓'}
              >
                进入入仓
              </button>
            </div>
          </div>
        </header>

        <main className="h-[calc(1080px-78px)] overflow-auto p-5">
          <div className="mb-4 rounded-2xl border border-[#dbeafe] bg-gradient-to-r from-[#eff6ff] to-[#f8fbff] px-5 py-4 text-[14px] text-[#1e3a8a]">
            你已完成选品采购。请根据目标市场选择货代线路并完成清关，清关后货物才能进入海外仓并开启正式运营。
          </div>

          <div className="grid grid-cols-[1fr_420px] gap-4">
            <div className="space-y-4">
              <section className="rounded-2xl border border-[#e5ecfb] bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[17px] font-black text-slate-800">A. 待发运采购单</h3>
                  <div className="text-[12px] text-slate-500">已选 {selectedOrders.length} 单 · 共 {totalPieces.toLocaleString()} 件</div>
                </div>
                <div className="max-h-[260px] overflow-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[12px] font-bold text-slate-600">
                      <tr>
                        <th className="px-3 py-2">选择</th>
                        <th className="px-3 py-2">订单号</th>
                        <th className="px-3 py-2">商品数</th>
                        <th className="px-3 py-2">件数</th>
                        <th className="px-3 py-2">货值</th>
                        <th className="px-3 py-2">时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-slate-400">加载中...</td>
                        </tr>
                      )}
                      {!loading && orders.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-slate-400">暂无可发运采购订单</td>
                        </tr>
                      )}
                      {!loading && orders.map((order) => {
                        const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
                        const shipped = shippedOrderIds.has(order.id);
                        return (
                          <tr key={order.id} className="border-t border-slate-100 text-[13px] text-slate-700">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={shipped || selectedOrderIds.includes(order.id)}
                                disabled={shipped}
                                onChange={() => toggleOrder(order.id)}
                              />
                            </td>
                            <td className="px-3 py-2 font-semibold">
                              订单 #{order.id}
                              {shipped && <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-600">已发运</span>}
                            </td>
                            <td className="px-3 py-2">{order.items.length}</td>
                            <td className="px-3 py-2">{pieces.toLocaleString()} 件</td>
                            <td className="px-3 py-2">{order.total_amount.toLocaleString()} RMB</td>
                            <td className="px-3 py-2">{new Date(order.created_at).toLocaleString('zh-CN')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-[#e5ecfb] bg-white p-4">
                <h3 className="mb-3 text-[17px] font-black text-slate-800">B. 货代线路选择（马来）</h3>
                <div className="grid grid-cols-3 gap-3">
                  {FORWARDERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedForwarder(item)}
                      className={`rounded-xl border p-3 text-left ${selectedForwarder.key === item.key ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="text-[13px] font-bold text-slate-800">{item.label}</div>
                      <div className="mt-1 text-[12px] text-slate-500">时效约 {item.etaDays} 天</div>
                      <div className="text-[12px] text-slate-500">费率 {(item.feeRate * 100).toFixed(1)}% + {item.fixedFee} RMB</div>
                      <div className="text-[12px] text-slate-500">稳定性 {item.stability}</div>
                    </button>
                  ))}
                </div>

                <h3 className="mb-3 mt-4 text-[17px] font-black text-slate-800">C. 清关策略</h3>
                <div className="grid grid-cols-2 gap-3">
                  {CUSTOMS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedCustoms(item)}
                      className={`rounded-xl border p-3 text-left ${selectedCustoms.key === item.key ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="text-[13px] font-bold text-slate-800">{item.label}</div>
                      <div className="mt-1 text-[12px] text-slate-500">清关约 {item.days} 天</div>
                      <div className="text-[12px] text-slate-500">附加费用 {item.addFee.toLocaleString()} RMB</div>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-[#e5ecfb] bg-white p-4">
                <h3 className="mb-3 text-[17px] font-black text-slate-800">D. 本次费用与时效预估</h3>
                <div className="space-y-2 text-[13px]">
                  <KV label="选中货值" value={`${selectedOrderValue.toLocaleString()} RMB`} />
                  <KV label="物流费" value={`${logisticsFee.toLocaleString()} RMB`} icon={<Truck size={14} />} />
                  <KV label="清关费" value={`${customsFee.toLocaleString()} RMB`} icon={<ShieldCheck size={14} />} />
                  <KV label="本次总费用" value={`${totalFee.toLocaleString()} RMB`} strong />
                  <KV label="预计总时效" value={`${etaDays} 天`} icon={<CalendarClock size={14} />} />
                  <KV label="扣款后余额" value={`${cashAfterShipment.toLocaleString()} RMB`} danger={cashAfterShipment < 0} success={cashAfterShipment >= 0} />
                </div>
                {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[12px] text-rose-600">{error}</div>}
                <button
                  type="button"
                  onClick={handleConfirmShipment}
                  disabled={!canConfirmShipment}
                  className="mt-3 h-10 w-full rounded-xl bg-[#2563eb] text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  确认发运并扣款
                </button>
              </section>

              <section className="rounded-2xl border border-[#e5ecfb] bg-white p-4">
                <h3 className="mb-3 text-[17px] font-black text-slate-800">E. 物流清关进度</h3>
                <div className="max-h-[420px] space-y-2 overflow-auto">
                  {shipments.length === 0 && <div className="text-[12px] text-slate-400">暂无物流单，确认发运后生成。</div>}
                  {shipmentRuntimes.map(({ shipment, runtime }) => (
                    <div key={shipment.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-semibold text-slate-700">物流单 #{shipment.id.toString().slice(-6)}</span>
                        <span className="text-slate-500">{shipment.totalFee.toLocaleString()} RMB</span>
                      </div>
                      <div className="mt-1 text-[12px] text-slate-500">{shipment.forwarderLabel} · {shipment.customsLabel}</div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                        <StatusPill label="已订舱" active={runtime.status === 'booked' || runtime.status === 'in_transit' || runtime.status === 'customs_processing' || runtime.status === 'customs_cleared'} />
                        <ChevronRight size={12} />
                        <StatusPill label="运输中" active={runtime.status === 'in_transit' || runtime.status === 'customs_processing' || runtime.status === 'customs_cleared'} />
                        <ChevronRight size={12} />
                        <StatusPill label="清关中" active={runtime.status === 'customs_processing' || runtime.status === 'customs_cleared'} />
                        <ChevronRight size={12} />
                        <StatusPill label="清关完成" active={runtime.status === 'customs_cleared'} />
                      </div>
                      <div className="mt-2 text-[12px] text-slate-600">
                        当前状态：{statusLabel[runtime.status]} · 剩余 {Math.floor(runtime.remainSeconds / 3600)}小时 {Math.floor((runtime.remainSeconds % 3600) / 60)}分钟 {runtime.remainSeconds % 60}秒
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${runtime.progressPercent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                  <button
                    type="button"
                    onClick={handleDebugAccelerateClearance}
                    disabled={!latestPendingShipment || acceleratingShipmentId !== null}
                    className="h-9 w-full rounded-lg bg-amber-500 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    title={latestPendingShipment ? `加速物流单 #${latestPendingShipment.shipment.id.toString().slice(-6)} 到清关完成` : '当前无可加速物流单'}
                  >
                    {acceleratingShipmentId !== null ? '加速中...' : '调试：加速到清关完成'}
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-[#dbeafe] bg-[#f4f8ff] p-4">
                <h3 className="mb-2 text-[14px] font-black text-slate-800">本环节提示</h3>
                <ul className="space-y-1 text-[12px] text-slate-600">
                  <li>1. 线路越快，费用越高。</li>
                  <li>2. 清关策略会影响上架节奏。</li>
                  <li>3. 至少完成 1 票清关后可进入运营。</li>
                </ul>
              </section>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  icon,
  strong,
  danger,
  success,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  strong?: boolean;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="inline-flex items-center gap-1 text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <span
        className={`font-semibold ${strong ? 'text-slate-900' : 'text-slate-700'} ${danger ? 'text-rose-600' : ''} ${success ? 'text-emerald-600' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
      {active && <CircleCheckBig size={11} />}
      {!active && <Clock3 size={11} />}
      {label}
    </span>
  );
}
