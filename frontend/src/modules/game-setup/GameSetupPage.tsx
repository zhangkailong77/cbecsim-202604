import {
  Activity,
  BarChart3,
  Boxes,
  CalendarClock,
  Clock3,
  Coins,
  Flag,
  History,
  LayoutDashboard,
  LogOut,
  RefreshCcw,
  Rocket,
  Ship,
  ShoppingCart,
  Store,
  UserRound,
  Warehouse,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import logoImg from '../../assets/home/logo.png';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const TOTAL_REAL_SECONDS = 7 * 24 * 60 * 60; // 1局=7天
const TOTAL_GAME_DAYS = 365;
const STAGE_COUNTDOWN_SECONDS = 8 * 60 * 60; // 当前阶段默认8小时，可后续改成后端下发
const REAL_SECONDS_PER_GAME_DAY = 30 * 60;
const BOOKED_SECONDS = 10;

export interface CreateRunPayload {
  initial_cash: number;
  market: string;
  duration_days: number;
}

interface GameSetupPageProps {
  isSubmitting: boolean;
  isResetting: boolean;
  error: string;
  currentRun: {
    id: number;
    initial_cash: number;
    market: string;
    duration_days: number;
    day_index: number;
    status: string;
    created_at: string;
  } | null;
  currentUser: {
    username: string;
    role: string;
    full_name: string | null;
    major: string | null;
    class_name: string | null;
    school_name: string | null;
  } | null;
  onSubmit: (payload: CreateRunPayload) => Promise<void>;
  onEnterRunningRun: () => void;
  onEnterLogistics: () => void;
  onEnterShopee: () => void;
  onResetCurrentRun: () => Promise<void>;
  onLogout: () => void;
}

interface ProcurementSummary {
  total_cash: number;
  spent_total: number;
  logistics_spent_total: number;
  remaining_cash: number;
}

interface ShipmentApi {
  id: number;
  forwarder_label: string;
  customs_label: string;
  transport_days: number;
  customs_days: number;
  created_at: string;
}

interface LogisticsShipmentsResp {
  shipments: ShipmentApi[];
}

interface LocalShipment {
  id: number;
  forwarderLabel: string;
  customsLabel: string;
  transportDays: number;
  customsDays: number;
  createdAt: string;
}

const CASH_PRESETS = [100000, 200000, 300000];
const MARKET_OPTIONS = [
  { code: 'MY', name: '马来西亚', enabled: true, note: '首发市场' },
  { code: 'SG', name: '新加坡', enabled: false, note: 'DLC 即将开放' },
  { code: 'TH', name: '泰国', enabled: false, note: 'DLC 即将开放' },
];

const fmtMoney = (n: number) => `${Math.max(0, Math.round(n)).toLocaleString()} RMB`;

function fmtDurationSeconds(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d}天 ${h}小时 ${min}分钟 ${sec}秒`;
}

function parseServerDateMs(value: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

function calcShipmentRuntime(shipment: LocalShipment, nowMs: number) {
  const createdMs = parseServerDateMs(shipment.createdAt);
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
  const transportSeconds = Math.max(1, Math.round(shipment.transportDays * REAL_SECONDS_PER_GAME_DAY));
  const customsSeconds = Math.max(1, Math.round(shipment.customsDays * REAL_SECONDS_PER_GAME_DAY));
  const totalSeconds = BOOKED_SECONDS + transportSeconds + customsSeconds;
  const remainSeconds = Math.max(0, totalSeconds - elapsedSeconds);

  let status: 'booked' | 'in_transit' | 'customs_processing' | 'customs_cleared' = 'booked';
  if (elapsedSeconds >= BOOKED_SECONDS + transportSeconds + customsSeconds) {
    status = 'customs_cleared';
  } else if (elapsedSeconds >= BOOKED_SECONDS + transportSeconds) {
    status = 'customs_processing';
  } else if (elapsedSeconds >= BOOKED_SECONDS) {
    status = 'in_transit';
  }
  return {
    status,
    remainSeconds,
    progressPercent: Math.min(100, Math.max(0, Math.round((elapsedSeconds / totalSeconds) * 100))),
  };
}

export default function GameSetupPage({
  isSubmitting,
  isResetting,
  error,
  currentRun,
  currentUser,
  onSubmit,
  onEnterRunningRun,
  onEnterLogistics,
  onEnterShopee,
  onResetCurrentRun,
  onLogout,
}: GameSetupPageProps) {
  const [scale, setScale] = useState(1);
  const [initialCash, setInitialCash] = useState(200000);
  const [market, setMarket] = useState('MY');
  const [durationDays, setDurationDays] = useState(365);
  const [nowMs, setNowMs] = useState(Date.now());
  const [procurementSummary, setProcurementSummary] = useState<ProcurementSummary | null>(null);
  const [latestShipment, setLatestShipment] = useState<LocalShipment | null>(null);
  const [stageDeadlineMs, setStageDeadlineMs] = useState<number | null>(null);
  const [activeMenu, setActiveMenu] = useState<'overview' | 'run-data' | 'finance' | 'history'>('overview');
  const [showPlayerPanel, setShowPlayerPanel] = useState(false);
  const playerPanelRef = useRef<HTMLDivElement | null>(null);

  const hasRunningRun = Boolean(currentRun);
  const lockedInitialCash = currentRun?.initial_cash ?? initialCash;
  const lockedMarket = currentRun?.market ?? market;
  const lockedDuration = currentRun?.duration_days ?? durationDays;
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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!playerPanelRef.current) return;
      if (!playerPanelRef.current.contains(event.target as Node)) {
        setShowPlayerPanel(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => {
    if (!hasRunningRun || !currentRun?.id) {
      setStageDeadlineMs(null);
      return;
    }
    const key = `cbec_stage_countdown_deadline_run_${currentRun.id}`;
    const existing = localStorage.getItem(key);
    let deadline = existing ? Number(existing) : NaN;
    if (!Number.isFinite(deadline) || deadline <= Date.now()) {
      deadline = Date.now() + STAGE_COUNTDOWN_SECONDS * 1000;
      localStorage.setItem(key, String(deadline));
    }
    setStageDeadlineMs(deadline);
  }, [hasRunningRun, currentRun?.id]);

  useEffect(() => {
    const loadSetupData = async () => {
      if (!currentRun?.id) {
        setProcurementSummary(null);
        setLatestShipment(null);
        return;
      }
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) return;
      const [summaryResp, shipmentResp] = await Promise.all([
        fetch(`${API_BASE_URL}/game/runs/${currentRun.id}/procurement/cart-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/game/runs/${currentRun.id}/logistics/shipments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (summaryResp.ok) {
        const data = (await summaryResp.json()) as ProcurementSummary;
        setProcurementSummary(data);
      }
      if (shipmentResp.ok) {
        const data = (await shipmentResp.json()) as LogisticsShipmentsResp;
        const latest = data.shipments[0];
        if (latest) {
          setLatestShipment({
            id: latest.id,
            forwarderLabel: latest.forwarder_label,
            customsLabel: latest.customs_label,
            transportDays: latest.transport_days,
            customsDays: latest.customs_days,
            createdAt: latest.created_at,
          });
        } else {
          setLatestShipment(null);
        }
      }
    };
    void loadSetupData();
  }, [currentRun?.id]);

  const elapsedSeconds = useMemo(() => {
    if (!currentRun?.created_at) return 0;
    const diffMs = nowMs - new Date(currentRun.created_at).getTime();
    return Math.max(0, Math.floor(diffMs / 1000));
  }, [currentRun?.created_at, nowMs]);

  const remainSeconds = Math.max(0, TOTAL_REAL_SECONDS - elapsedSeconds);
  const gameDayMapped = hasRunningRun
    ? Math.min(
        TOTAL_GAME_DAYS,
        Math.max(1, Math.floor((elapsedSeconds / TOTAL_REAL_SECONDS) * TOTAL_GAME_DAYS) + 1),
      )
    : 1;
  const remainGameDays = Math.max(0, TOTAL_GAME_DAYS - gameDayMapped);
  const latestShipmentRuntime = useMemo(() => {
    if (!latestShipment) return null;
    return { shipment: latestShipment, runtime: calcShipmentRuntime(latestShipment, nowMs) };
  }, [latestShipment, nowMs]);
  const stageRemainSeconds = useMemo(() => {
    if (latestShipmentRuntime && latestShipmentRuntime.runtime.status !== 'customs_cleared') {
      return latestShipmentRuntime.runtime.remainSeconds;
    }
    if (!hasRunningRun || !stageDeadlineMs) return 0;
    return Math.max(0, Math.floor((stageDeadlineMs - nowMs) / 1000));
  }, [hasRunningRun, stageDeadlineMs, nowMs, latestShipmentRuntime]);

  const stageCards = [
    {
      step: 'Step 02',
      title: '选品与采购',
      desc: '从销量/新品/热推榜自由选品并下单',
      metric: `已采购 ${fmtMoney(procurementSummary?.spent_total ?? 0)}`,
      action: '进入选品',
      onClick: onEnterRunningRun,
      disabled: !hasRunningRun,
      icon: <ShoppingCart size={16} />,
    },
    {
      step: 'Step 03',
      title: '国际物流与清关',
      desc: '选择货代线路并完成清关流程',
      metric: latestShipmentRuntime
        ? `状态 ${
            latestShipmentRuntime.runtime.status === 'booked'
              ? '已订舱'
              : latestShipmentRuntime.runtime.status === 'in_transit'
                ? '运输中'
                : latestShipmentRuntime.runtime.status === 'customs_processing'
                  ? '清关中'
                  : '清关完成'
          } · 剩余 ${fmtDurationSeconds(latestShipmentRuntime.runtime.remainSeconds)}`
        : `市场 ${lockedMarket} · 未发运`,
      action: '进入物流',
      onClick: onEnterLogistics,
      disabled: !hasRunningRun,
      icon: <Ship size={16} />,
    },
    {
      step: 'Step 04',
      title: '海外仓与入仓',
      desc: '官方仓/第三方仓/自建仓入仓管理',
      metric: '待接入仓储模块',
      action: '即将开放',
      onClick: () => undefined,
      disabled: true,
      icon: <Warehouse size={16} />,
    },
    {
      step: 'Step 05',
      title: '店铺运营（Shopee）',
      desc: '店铺运营、定价与上架销售',
      metric: `局状态 ${currentRun?.status ?? '未开局'}`,
      action: '进入运营',
      onClick: onEnterShopee,
      disabled: !hasRunningRun,
      icon: <Store size={16} />,
    },
  ];

  const menuItems = [
    { key: 'overview', label: '工作台总览', icon: <LayoutDashboard size={15} /> },
    { key: 'run-data', label: '当前对局数据', icon: <BarChart3 size={15} /> },
    { key: 'finance', label: '营业额与资金', icon: <Coins size={15} /> },
    { key: 'history', label: '历史经营记录', icon: <History size={15} /> },
  ] as const;

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
                <div className="-mt-0.5 text-[12px] font-semibold text-[#60a5fa]">跨境经营仿真平台</div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[13px] font-semibold text-slate-700">
              <div className="relative" ref={playerPanelRef}>
                <button
                  type="button"
                  onClick={() => setShowPlayerPanel((prev) => !prev)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5"
                >
                  玩家：{playerDisplayName}
                </button>
                {showPlayerPanel && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-[280px] rounded-xl border border-[#dbeafe] bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
                    <div className="text-[13px] font-black text-slate-800">玩家信息</div>
                    <div className="mt-2 space-y-1.5 text-[12px] text-slate-600">
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                        <span>姓名</span>
                        <span className="font-semibold text-slate-800">{currentUser?.full_name || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                        <span>账号</span>
                        <span className="font-semibold text-slate-800">{currentUser?.username || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                        <span>学校</span>
                        <span className="font-semibold text-slate-800">{currentUser?.school_name || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                        <span>班级</span>
                        <span className="font-semibold text-slate-800">{currentUser?.class_name || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                        <span>专业 / 角色</span>
                        <span className="font-semibold text-slate-800">
                          {currentUser?.major || '-'}{currentUser?.role ? ` / ${currentUser.role}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-full border border-slate-200 px-3 py-1.5">局 #{currentRun?.id ?? '--'}</div>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-1.5"
              >
                <LogOut size={13} />
                退出登录
              </button>
            </div>
          </div>
        </header>

        <main className="h-[calc(1080px-78px)] overflow-hidden">
          <div className="flex h-full">
            <aside className="w-[220px] shrink-0 border-r border-[#eceef3] bg-white">
              <div className="px-3 py-4">
                <div className="px-3 pb-2 text-[28px] font-black text-[#111827]">工作台</div>
              </div>
              {menuItems.map((item) => {
                const active = activeMenu === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveMenu(item.key)}
                    className={`mb-1 block w-full rounded-lg px-3 py-2 text-left transition ${
                      active ? 'bg-[#e8f1ff] font-bold text-[#2563eb]' : 'text-[#374151] hover:bg-[#f3f7ff]'
                    }`}
                  >
                    <div className="inline-flex items-center gap-2 text-[14px]">
                      {item.icon}
                      {item.label}
                    </div>
                  </button>
                );
              })}
            </aside>

            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-[1fr_420px] gap-4">
                <section className="space-y-4">
                  {activeMenu === 'overview' ? (
                    <>
                      <div className="rounded-2xl border border-[#dbeafe] bg-gradient-to-r from-[#eff6ff] to-[#f8fbff] px-5 py-4 text-[14px] text-[#1e3a8a]">
                        开局后进入统一工作台。Step 02~05 为核心经营链路入口，倒计时统一在右侧“时间中心”展示。
                      </div>

                      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-[#e5ecfb] bg-white p-4">
                        <InfoCard label="姓名" value={currentUser?.full_name || '-'} icon={<UserRound size={14} />} />
                        <InfoCard
                          label="学校 / 班级"
                          value={`${currentUser?.school_name || '-'}${currentUser?.class_name ? ` · ${currentUser.class_name}` : ''}`}
                          icon={<Boxes size={14} />}
                        />
                        <InfoCard
                          label="专业 / 角色"
                          value={`${currentUser?.major || '-'}${currentUser?.role ? ` · ${currentUser.role}` : ''}`}
                          icon={<Activity size={14} />}
                        />
                      </div>

                      <div className="rounded-2xl border border-[#e5ecfb] bg-white p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-[18px] font-black text-slate-800">Step 01 开局信息</h3>
                          <div className="rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold text-blue-700">总资金 {fmtMoney(lockedInitialCash)}</div>
                        </div>

                        {hasRunningRun ? (
                          <div className="grid grid-cols-4 gap-3 text-[13px]">
                            <InfoCard label="本局状态" value={currentRun?.status ?? '-'} icon={<Activity size={14} />} />
                            <InfoCard label="目标市场" value={lockedMarket} icon={<Flag size={14} />} />
                            <InfoCard label="经营周期" value={`${lockedDuration} 天`} icon={<CalendarClock size={14} />} />
                            <InfoCard label="游戏日" value={`Day ${gameDayMapped}`} icon={<Clock3 size={14} />} />
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div>
                              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Coins size={15} className="text-amber-500" />初始资金</label>
                              <div className="flex gap-3">
                                {CASH_PRESETS.map((amount) => (
                                  <button
                                    key={amount}
                                    type="button"
                                    onClick={() => setInitialCash(amount)}
                                    className={`rounded-2xl px-4 py-2 text-sm font-bold transition-all ${
                                      initialCash === amount ? 'bg-blue-600 text-white shadow-[0_10px_24px_rgba(37,99,235,0.3)]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                  >
                                    {amount.toLocaleString()} RMB
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="mb-2 text-sm font-semibold text-slate-700">目标市场</label>
                              <div className="grid grid-cols-3 gap-3">
                                {MARKET_OPTIONS.map((item) => (
                                  <button
                                    key={item.code}
                                    type="button"
                                    disabled={!item.enabled}
                                    onClick={() => item.enabled && setMarket(item.code)}
                                    className={`rounded-xl border px-3 py-2 text-left ${
                                      market === item.code && item.enabled ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                                    } ${!item.enabled ? 'opacity-55' : 'hover:border-blue-200'}`}
                                  >
                                    <div className="text-sm font-bold text-slate-800">{item.name}</div>
                                    <div className="text-xs text-slate-500">{item.note}</div>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <label className="mb-2 text-sm font-semibold text-slate-700">经营周期</label>
                              <select
                                value={durationDays}
                                onChange={(event) => setDurationDays(Number(event.target.value))}
                                className="h-10 w-[240px] rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
                              >
                                <option value={365}>365 天（标准）</option>
                                <option value={180}>180 天（短）</option>
                                <option value={730}>730 天（长）</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-600">{error}</div>}

                        <div className="mt-4 flex gap-2">
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => {
                              if (hasRunningRun) {
                                onEnterRunningRun();
                                return;
                              }
                              void onSubmit({
                                initial_cash: initialCash,
                                market,
                                duration_days: durationDays,
                              });
                            }}
                            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#2563eb] px-5 text-sm font-bold text-white disabled:opacity-50"
                          >
                            <Rocket size={15} />
                            {hasRunningRun ? '进入选品（Step 02）' : isSubmitting ? '开局中...' : '领取资金并开始'}
                          </button>

                          {hasRunningRun && (
                            <button
                              type="button"
                              onClick={() => void onResetCurrentRun()}
                              disabled={isResetting}
                              className="inline-flex h-11 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-600 disabled:opacity-50"
                            >
                              <RefreshCcw size={15} />
                              {isResetting ? '重置中...' : '重置当前局（测试）'}
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-[#e5ecfb] bg-white" style={{ minHeight: '620px' }} />
                  )}

                  {activeMenu === 'overview' && (
                    <div className="rounded-2xl border border-[#e5ecfb] bg-white p-4">
                      <div className="mb-3 flex items-center gap-2 text-[18px] font-black text-slate-800">
                        <Boxes size={17} />
                        阶段入口（Step 02 ~ Step 05）
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {stageCards.map((card) => (
                          <button
                            key={card.step}
                            type="button"
                            onClick={card.onClick}
                            disabled={card.disabled}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-55"
                          >
                            <div className="flex items-center justify-between">
                              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700">
                                {card.icon}
                                {card.step}
                              </div>
                              <div className="text-[11px] text-slate-500">{card.action}</div>
                            </div>
                            <div className="mt-1 text-[15px] font-black text-slate-800">{card.title}</div>
                            <div className="mt-1 text-[12px] text-slate-500">{card.desc}</div>
                            <div className="mt-2 text-[12px] font-semibold text-slate-700">{card.metric}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <aside className="space-y-4">
                  <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
                    <div className="mb-3 flex items-center gap-2 text-[17px] font-black text-slate-800">
                      <CalendarClock size={16} />
                      统一倒计时中心
                    </div>
                    <div className="space-y-3 text-[13px]">
                  <CountCard title="本局总倒计时" value={hasRunningRun ? fmtDurationSeconds(remainSeconds) : '--'} sub="规则：1局=7天映射365游戏天（秒级实时）" />
                  <CountCard title="当前游戏日" value={hasRunningRun ? `Day ${gameDayMapped}` : 'Day 1'} sub={`剩余 ${remainGameDays} 游戏天`} />
                  <StageDigestCard
                    stageLabel={latestShipmentRuntime ? 'Step 03 国际物流与清关' : 'Step 02 选品与采购'}
                    statusLabel={
                      latestShipmentRuntime
                        ? latestShipmentRuntime.runtime.status === 'booked'
                          ? '已订舱'
                          : latestShipmentRuntime.runtime.status === 'in_transit'
                            ? '运输中'
                            : latestShipmentRuntime.runtime.status === 'customs_processing'
                              ? '清关中'
                              : '清关完成'
                        : '进行中'
                    }
                    progress={latestShipmentRuntime?.runtime.progressPercent ?? 35}
                    nextAction={
                      latestShipmentRuntime
                        ? latestShipmentRuntime.runtime.status === 'customs_cleared'
                          ? '可进入 Step 04 海外仓入仓'
                          : '等待物流清关流程自动推进'
                        : '进入 Step 02 完成选品采购'
                    }
                  />
                </div>
              </div>

                  <div className="rounded-2xl border border-[#e5ecfb] bg-white p-4">
                    <div className="mb-2 text-[15px] font-black text-slate-800">阶段总览数据</div>
                    <div className="space-y-2 text-[13px]">
                      <OverviewRow label="总资金" value={fmtMoney(lockedInitialCash)} />
                      <OverviewRow label="已采购" value={fmtMoney(procurementSummary?.spent_total ?? 0)} />
                      <OverviewRow label="采购剩余" value={fmtMoney(procurementSummary?.remaining_cash ?? lockedInitialCash)} />
                      <OverviewRow label="目标市场" value={lockedMarket} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-cyan-50 p-4">
                    <div className="mb-2 text-[15px] font-black text-slate-800">本阶段提示</div>
                    <ul className="space-y-1 text-[12px] text-slate-600">
                      <li>1. Step 01 领取资金后，进入 Step 02 选品。</li>
                      <li>2. 倒计时统一在此处查看，不分散到各页面。</li>
                      <li>3. 阶段入口按主流程串联，支持一键跳转。</li>
                    </ul>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: JSX.Element }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="inline-flex items-center gap-1 text-[11px] text-slate-500">{icon}<span>{label}</span></div>
      <div className="mt-1 text-[14px] font-bold text-slate-800">{value}</div>
    </div>
  );
}

function CountCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-3">
      <div className="text-[11px] text-slate-500">{title}</div>
      <div className="mt-1 text-[16px] font-black text-blue-700">{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function StageDigestCard({
  stageLabel,
  statusLabel,
  progress,
  nextAction,
}: {
  stageLabel: string;
  statusLabel: string;
  progress: number;
  nextAction: string;
}) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-3">
      <div className="text-[11px] text-slate-500">当前阶段摘要</div>
      <div className="mt-1 text-[14px] font-black text-blue-700">{stageLabel}</div>
      <div className="mt-1 text-[12px] text-slate-600">阶段状态：{statusLabel}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100">
        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-slate-500">阶段完成度：{Math.max(0, Math.min(100, progress))}%</div>
      <div className="mt-1 text-[11px] text-slate-500">下一动作：{nextAction}</div>
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
