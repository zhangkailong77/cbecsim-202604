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
  Users,
  UserRound,
  Warehouse,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import logoImg from '../../assets/home/logo.png';
import AdminBuyerPoolPage from '../admin/AdminBuyerPoolPage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const TOTAL_REAL_SECONDS = 7 * 24 * 60 * 60; // 1局=7天
const TOTAL_GAME_DAYS = 365;
const STAGE_COUNTDOWN_SECONDS = 8 * 60 * 60; // 当前阶段默认8小时，可后续改成后端下发
const REAL_SECONDS_PER_GAME_DAY = 30 * 60;
const BOOKED_SECONDS = 10;
const GAME_MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const GAME_MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'] as const;
const GAME_WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

export interface CreateRunPayload {
  initial_cash: number;
  market: string;
  duration_days: number;
}

type SetupSubView = 'default' | 'run-data' | 'finance' | 'history' | 'admin-buyer-pool';

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
  onEnterWarehouse: () => void;
  onEnterShopee: () => void;
  onResetCurrentRun: () => Promise<void>;
  onLogout: () => void;
  setupSubView?: SetupSubView;
  onSetupSubViewChange?: (subView: SetupSubView) => void;
}

interface ProcurementSummary {
  initial_cash: number;
  income_withdrawal_total: number;
  total_expense: number;
  current_balance: number;
  total_cash: number;
  spent_total: number;
  logistics_spent_total: number;
  remaining_cash: number;
  warehouse_spent_total: number;
}

interface GameFinanceDetailRow {
  id: string;
  direction: 'in' | 'out';
  type: string;
  type_label: string;
  amount: number;
  created_at: string;
  remark: string | null;
}

interface GameFinanceDetailsResponse {
  tab: 'income' | 'expense';
  page: number;
  page_size: number;
  total: number;
  rows: GameFinanceDetailRow[];
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

interface WarehouseSummaryResp {
  strategy: {
    id: number;
    warehouse_mode: string;
    warehouse_location: string;
  } | null;
  pending_inbound_count: number;
  completed_inbound_count: number;
  inventory_total_quantity: number;
  inventory_total_sku: number;
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

const fmtMoney = (n: number) =>
  `${Math.max(0, Number(n || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} RMB`;

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

function getGameCalendarInfo(dayIndex: number) {
  const safeDay = Math.min(TOTAL_GAME_DAYS, Math.max(1, dayIndex));
  let remain = safeDay;
  let monthIndex = 0;
  for (let i = 0; i < GAME_MONTH_DAY_COUNTS.length; i += 1) {
    if (remain <= GAME_MONTH_DAY_COUNTS[i]) {
      monthIndex = i;
      break;
    }
    remain -= GAME_MONTH_DAY_COUNTS[i];
  }
  const dayOfMonth = remain;
  const dayOfYear = safeDay;
  const weekdayIndex = (dayOfYear - 1) % 7; // Day1 -> 周一
  const isWeekend = weekdayIndex >= 5;
  const quarter = Math.floor(monthIndex / 3) + 1;
  const seasonLabel = quarter === 1 ? '春季' : quarter === 2 ? '夏季' : quarter === 3 ? '秋季' : '冬季';
  const daysBeforeMonth = dayOfYear - dayOfMonth;
  const firstWeekdayIndex = daysBeforeMonth % 7;

  return {
    dayOfYear,
    monthIndex,
    dayOfMonth,
    weekdayIndex,
    isWeekend,
    quarter,
    seasonLabel,
    firstWeekdayIndex,
  };
}

function getGameClockLabel(elapsedSeconds: number) {
  const safeElapsed = Math.max(0, elapsedSeconds);
  const gameDayFloat = (safeElapsed / TOTAL_REAL_SECONDS) * TOTAL_GAME_DAYS + 1;
  const frac = gameDayFloat - Math.floor(gameDayFloat);
  const totalSeconds = Math.max(0, Math.floor(frac * 24 * 60 * 60));
  const hour = Math.floor(totalSeconds / 3600) % 24;
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function getGameDayClockFromTimestamps(runCreatedAt: string, eventAt: string) {
  const runMs = parseServerDateMs(runCreatedAt);
  const eventMs = parseServerDateMs(eventAt);
  const elapsedSeconds = Math.max(0, Math.floor((eventMs - runMs) / 1000));
  const gameDayFloat = (elapsedSeconds / TOTAL_REAL_SECONDS) * TOTAL_GAME_DAYS + 1;
  const dayIndex = Math.min(TOTAL_GAME_DAYS, Math.max(1, Math.floor(gameDayFloat)));
  const frac = gameDayFloat - Math.floor(gameDayFloat);
  const secOfDay = Math.max(0, Math.floor(frac * 24 * 60 * 60));
  const hour = Math.floor(secOfDay / 3600) % 24;
  const minute = Math.floor((secOfDay % 3600) / 60);
  const second = secOfDay % 60;
  return {
    dayText: `Day ${dayIndex}`,
    clockText: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
  };
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
  onEnterWarehouse,
  onEnterShopee,
  onResetCurrentRun,
  onLogout,
  setupSubView = 'default',
  onSetupSubViewChange,
}: GameSetupPageProps) {
  const [scale, setScale] = useState(1);
  const [initialCash, setInitialCash] = useState(200000);
  const [market, setMarket] = useState('MY');
  const [durationDays, setDurationDays] = useState(365);
  const [nowMs, setNowMs] = useState(Date.now());
  const [procurementSummary, setProcurementSummary] = useState<ProcurementSummary | null>(null);
  const [latestShipment, setLatestShipment] = useState<LocalShipment | null>(null);
  const [warehouseSummary, setWarehouseSummary] = useState<WarehouseSummaryResp | null>(null);
  const [financeTab, setFinanceTab] = useState<'income' | 'expense'>('income');
  const [financeRows, setFinanceRows] = useState<GameFinanceDetailRow[]>([]);
  const [financeTotal, setFinanceTotal] = useState(0);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [stageDeadlineMs, setStageDeadlineMs] = useState<number | null>(null);
  const [activeMenu, setActiveMenu] = useState<'overview' | 'run-data' | 'finance' | 'history' | 'buyer-pool'>('overview');
  const [showPlayerPanel, setShowPlayerPanel] = useState(false);
  const [adminSelectedRunContext, setAdminSelectedRunContext] = useState<{
    runId: number | null;
    username: string | null;
    status: string | null;
    market: string | null;
    dayIndex: number | null;
    createdAt: string | null;
    gameClock: string | null;
  } | null>(null);
  const playerPanelRef = useRef<HTMLDivElement | null>(null);

  const hasRunningRun = Boolean(currentRun);
  const lockedInitialCash = currentRun?.initial_cash ?? initialCash;
  const lockedMarket = currentRun?.market ?? market;
  const lockedDuration = currentRun?.duration_days ?? durationDays;
  const playerDisplayName = currentUser?.full_name?.trim() || currentUser?.username || '玩家';
  const canEnterAdminBuyerPool =
    (currentUser?.role || '').trim() === 'super_admin' &&
    (currentUser?.username || '').trim().toLowerCase() === 'yzcube';
  const displayCurrentBalance = procurementSummary?.current_balance ?? procurementSummary?.remaining_cash ?? lockedInitialCash;
  const displayWithdrawalIncome = procurementSummary?.income_withdrawal_total ?? 0;
  const displayTotalExpense = procurementSummary?.total_expense ?? (procurementSummary
    ? (procurementSummary.spent_total + procurementSummary.logistics_spent_total + (procurementSummary.warehouse_spent_total ?? 0))
    : 0);

  useEffect(() => {
    if (setupSubView === 'admin-buyer-pool' && canEnterAdminBuyerPool) {
      setActiveMenu('buyer-pool');
      return;
    }
    if (setupSubView === 'run-data') {
      setActiveMenu('run-data');
      return;
    }
    if (setupSubView === 'finance') {
      setActiveMenu('finance');
      return;
    }
    if (setupSubView === 'history') {
      setActiveMenu('history');
      return;
    }
    if (!canEnterAdminBuyerPool && activeMenu === 'buyer-pool') {
      setActiveMenu('overview');
      return;
    }
    setActiveMenu('overview');
  }, [setupSubView, canEnterAdminBuyerPool]);

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
        setWarehouseSummary(null);
        return;
      }
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) return;
      const [summaryResp, shipmentResp, warehouseResp] = await Promise.all([
        fetch(`${API_BASE_URL}/game/runs/${currentRun.id}/procurement/cart-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/game/runs/${currentRun.id}/logistics/shipments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE_URL}/game/runs/${currentRun.id}/warehouse/summary`, {
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
      if (warehouseResp.ok) {
        const data = (await warehouseResp.json()) as WarehouseSummaryResp;
        setWarehouseSummary(data);
      }
    };
    void loadSetupData();
  }, [currentRun?.id]);

  useEffect(() => {
    const loadFinanceDetails = async () => {
      if (!currentRun?.id) {
        setFinanceRows([]);
        setFinanceTotal(0);
        return;
      }
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) return;
      setFinanceLoading(true);
      try {
        const resp = await fetch(
          `${API_BASE_URL}/game/runs/${currentRun.id}/finance/details?tab=${financeTab}&page=1&page_size=8`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!resp.ok) return;
        const data = (await resp.json()) as GameFinanceDetailsResponse;
        setFinanceRows(data.rows ?? []);
        setFinanceTotal(data.total ?? 0);
      } finally {
        setFinanceLoading(false);
      }
    };
    void loadFinanceDetails();
  }, [currentRun?.id, financeTab]);

  const sidebarUsingAdminRun = activeMenu === 'buyer-pool' && !!adminSelectedRunContext?.runId;
  const timelineCreatedAt = sidebarUsingAdminRun
    ? adminSelectedRunContext?.createdAt ?? null
    : currentRun?.created_at ?? null;
  const elapsedSeconds = useMemo(() => {
    if (!timelineCreatedAt) return 0;
    const diffMs = nowMs - new Date(timelineCreatedAt).getTime();
    return Math.max(0, Math.floor(diffMs / 1000));
  }, [timelineCreatedAt, nowMs]);
  const hasTimelineRun = sidebarUsingAdminRun ? Boolean(adminSelectedRunContext?.runId) : Boolean(timelineCreatedAt);

  const remainSeconds = Math.max(0, TOTAL_REAL_SECONDS - elapsedSeconds);
  const derivedDayByTimeline = Math.min(
    TOTAL_GAME_DAYS,
    Math.max(1, Math.floor((elapsedSeconds / TOTAL_REAL_SECONDS) * TOTAL_GAME_DAYS) + 1),
  );
  const gameDayMapped = sidebarUsingAdminRun
    ? Math.min(
        TOTAL_GAME_DAYS,
        Math.max(1, adminSelectedRunContext?.dayIndex ?? derivedDayByTimeline),
      )
    : hasTimelineRun
      ? derivedDayByTimeline
      : 1;
  const remainGameDays = Math.max(0, TOTAL_GAME_DAYS - gameDayMapped);
  const gameClockLabel = useMemo(() => {
    if (sidebarUsingAdminRun && adminSelectedRunContext?.gameClock) {
      return adminSelectedRunContext.gameClock;
    }
    return getGameClockLabel(elapsedSeconds);
  }, [elapsedSeconds, sidebarUsingAdminRun, adminSelectedRunContext?.gameClock]);
  const latestShipmentRuntime = useMemo(() => {
    if (!latestShipment) return null;
    return { shipment: latestShipment, runtime: calcShipmentRuntime(latestShipment, nowMs) };
  }, [latestShipment, nowMs]);
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
      metric: warehouseSummary?.strategy
        ? `已入仓 ${warehouseSummary.completed_inbound_count} 单 · SKU ${warehouseSummary.inventory_total_sku}`
        : '待确认入仓策略',
      action: '进入入仓',
      onClick: onEnterWarehouse,
      disabled: !hasRunningRun,
      icon: <Warehouse size={16} />,
    },
    {
      step: 'Step 05',
      title: '店铺运营（Shopee）',
      desc: '店铺运营、定价与上架销售',
      metric: warehouseSummary?.completed_inbound_count
        ? `已入仓 ${warehouseSummary.completed_inbound_count} 单，满足运营条件`
        : '需先完成 Step 04 入仓',
      action: '进入运营',
      onClick: onEnterShopee,
      disabled: !hasRunningRun || (warehouseSummary?.completed_inbound_count ?? 0) <= 0,
      icon: <Store size={16} />,
    },
  ];

  const menuItems = [
    { key: 'overview', label: '工作台总览', icon: <LayoutDashboard size={15} /> },
    { key: 'run-data', label: '当前对局数据', icon: <BarChart3 size={15} /> },
    { key: 'finance', label: '营业额与资金', icon: <Coins size={15} /> },
    { key: 'history', label: '历史经营记录', icon: <History size={15} /> },
    ...(canEnterAdminBuyerPool
      ? ([{ key: 'buyer-pool', label: '买家池总览', icon: <Users size={15} /> }] as const)
      : []),
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
                    onClick={() => {
                      setActiveMenu(item.key);
                      const mappedSubView: SetupSubView =
                        item.key === 'buyer-pool'
                          ? 'admin-buyer-pool'
                          : item.key === 'run-data'
                            ? 'run-data'
                            : item.key === 'finance'
                              ? 'finance'
                              : item.key === 'history'
                                ? 'history'
                                : 'default';
                      onSetupSubViewChange?.(mappedSubView);
                    }}
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
                          <div className="rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold text-blue-700">当前可用余额 {fmtMoney(displayCurrentBalance)}</div>
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
                  ) : activeMenu === 'buyer-pool' ? (
                    <AdminBuyerPoolPage
                      currentUser={currentUser}
                      embedded
                      onRunContextChange={setAdminSelectedRunContext}
                    />
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
                      <CountCard
                        title={sidebarUsingAdminRun ? '选中对局倒计时' : '本局总倒计时'}
                        value={hasTimelineRun ? fmtDurationSeconds(remainSeconds) : '--'}
                        sub="规则：1局=7天映射365游戏天（秒级实时）"
                      />
                      <CountCard
                        title="当前游戏日"
                        value={hasTimelineRun ? `Day ${gameDayMapped}` : '--'}
                        sub={
                          sidebarUsingAdminRun
                            ? `对局 #${adminSelectedRunContext?.runId ?? '--'} · 玩家 ${adminSelectedRunContext?.username ?? '--'} · ${adminSelectedRunContext?.status ?? '--'}`
                            : `剩余 ${remainGameDays} 游戏天`
                        }
                      />
                      <GameCalendarCard dayIndex={hasTimelineRun ? gameDayMapped : 1} gameClockLabel={gameClockLabel} />
                    </div>
              </div>

                  <div className="rounded-2xl border border-[#e5ecfb] bg-white p-4">
                    <div className="mb-2 text-[15px] font-black text-slate-800">阶段总览数据</div>
                    <div className="space-y-2 text-[13px]">
                      <OverviewRow label="期初资金" value={fmtMoney(procurementSummary?.initial_cash ?? lockedInitialCash)} />
                      <OverviewRow label="累计收入（仅提现转入）" value={fmtMoney(displayWithdrawalIncome)} />
                      <OverviewRow label="累计支出（采购/物流/仓储）" value={fmtMoney(displayTotalExpense)} />
                      <OverviewRow label="当前可用余额" value={fmtMoney(displayCurrentBalance)} />
                      <OverviewRow label="目标市场" value={lockedMarket} />
                      {sidebarUsingAdminRun && (
                        <OverviewRow
                          label="选中对局"
                          value={`#${adminSelectedRunContext?.runId ?? '--'} · ${adminSelectedRunContext?.status ?? '--'}`}
                        />
                      )}
                    </div>
                    <div className="mt-3 border-t border-[#e5ecfb] pt-3">
                      <div className="mb-2 inline-flex rounded-lg border border-[#dbeafe] bg-[#f8fbff] p-1 text-[12px]">
                        <button
                          type="button"
                          onClick={() => setFinanceTab('income')}
                          className={`rounded-md px-3 py-1.5 font-semibold ${financeTab === 'income' ? 'bg-[#2563eb] text-white' : 'text-slate-600'}`}
                        >
                          收入明细
                        </button>
                        <button
                          type="button"
                          onClick={() => setFinanceTab('expense')}
                          className={`rounded-md px-3 py-1.5 font-semibold ${financeTab === 'expense' ? 'bg-[#2563eb] text-white' : 'text-slate-600'}`}
                        >
                          支出明细
                        </button>
                      </div>
                      <div className="mb-2 text-[11px] text-slate-500">最近 {Math.min(financeRows.length, 8)} 条（共 {financeTotal} 条，时间按游戏日）</div>
                      <div className="space-y-1.5">
                        {financeLoading && <div className="rounded-md bg-slate-50 px-2 py-2 text-[12px] text-slate-500">加载中...</div>}
                        {!financeLoading && financeRows.length === 0 && (
                          <div className="rounded-md bg-slate-50 px-2 py-2 text-[12px] text-slate-500">暂无明细</div>
                        )}
                        {!financeLoading &&
                          financeRows.map((row) => {
                            const ts = currentRun?.created_at ? getGameDayClockFromTimestamps(currentRun.created_at, row.created_at) : null;
                            return (
                              <div key={row.id} className="rounded-md border border-slate-100 bg-slate-50 px-2 py-2">
                                <div className="flex items-center justify-between text-[12px]">
                                  <span className="font-semibold text-slate-700">{row.type_label}</span>
                                  <span className={`font-bold ${row.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {row.direction === 'in' ? '+' : '-'}
                                    {fmtMoney(row.amount)}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                                  <span>{ts ? `${ts.dayText} ${ts.clockText}` : '-'}</span>
                                  <span className="truncate pl-2">{row.remark || '-'}</span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
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

function InfoCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
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

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function GameCalendarCard({ dayIndex, gameClockLabel }: { dayIndex: number; gameClockLabel: string }) {
  const info = getGameCalendarInfo(dayIndex);
  const [viewMonthIndex, setViewMonthIndex] = useState(info.monthIndex);

  useEffect(() => {
    setViewMonthIndex(info.monthIndex);
  }, [info.monthIndex]);

  const daysBeforeViewMonth = GAME_MONTH_DAY_COUNTS.slice(0, viewMonthIndex).reduce((sum, dayCount) => sum + dayCount, 0);
  const viewFirstWeekdayIndex = daysBeforeViewMonth % 7; // Day1 -> 周一
  const monthDays = GAME_MONTH_DAY_COUNTS[viewMonthIndex];
  const leadingEmpty = Array.from({ length: viewFirstWeekdayIndex }, (_, idx) => `lead-${idx}`);
  const dayCells = Array.from({ length: monthDays }, (_, idx) => idx + 1);
  const totalCells = Math.ceil((leadingEmpty.length + dayCells.length) / 7) * 7;
  const tailCount = Math.max(0, totalCells - leadingEmpty.length - dayCells.length);
  const trailingEmpty = Array.from({ length: tailCount }, (_, idx) => `tail-${idx}`);
  const canPrev = viewMonthIndex > 0;
  const canNext = viewMonthIndex < GAME_MONTH_NAMES.length - 1;

  return (
    <div className="rounded-xl border border-[#dbeafe] bg-white px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-slate-500">游戏日历（实时）</div>
        <div className="text-[11px] font-semibold text-blue-700">{GAME_MONTH_NAMES[info.monthIndex]} · {info.seasonLabel}</div>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <div className="text-[14px] font-black text-slate-800">
          Day {info.dayOfYear}
        </div>
        <div className="text-[11px] text-slate-600">
          {GAME_MONTH_NAMES[info.monthIndex]} {info.dayOfMonth}日 · {GAME_WEEKDAY_NAMES[info.weekdayIndex]}
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 px-2 py-2">
        <div className="text-[10px] text-slate-500">当前游戏时刻</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">Game Time</span>
          <span className="rounded-md bg-blue-600 px-2 py-0.5 font-mono text-[18px] font-black tracking-wide text-white">
            {gameClockLabel}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-700">{GAME_MONTH_NAMES[viewMonthIndex]}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => canPrev && setViewMonthIndex((v) => Math.max(0, v - 1))}
            disabled={!canPrev}
            className="h-6 w-6 rounded-md border border-slate-200 text-[12px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="查看上个月"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setViewMonthIndex(info.monthIndex)}
            className="h-6 rounded-md border border-slate-200 px-2 text-[10px] font-semibold text-slate-600"
          >
            回到今日
          </button>
          <button
            type="button"
            onClick={() => canNext && setViewMonthIndex((v) => Math.min(GAME_MONTH_NAMES.length - 1, v + 1))}
            disabled={!canNext}
            className="h-6 w-6 rounded-md border border-slate-200 text-[12px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="查看下个月"
          >
            ›
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
        {GAME_WEEKDAY_NAMES.map((day) => (
          <div key={day}>{day.replace('周', '')}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {leadingEmpty.map((key) => (
          <div key={key} className="h-6 rounded-md bg-slate-50/30" />
        ))}
        {dayCells.map((day) => {
          const isToday = viewMonthIndex === info.monthIndex && day === info.dayOfMonth;
          return (
            <div
              key={`d-${day}`}
              className={`flex h-6 items-center justify-center rounded-md text-[11px] ${
                isToday
                  ? 'bg-blue-600 font-black text-white'
                  : 'bg-slate-50 text-slate-700'
              }`}
            >
              {day}
            </div>
          );
        })}
        {trailingEmpty.map((key) => (
          <div key={key} className="h-6 rounded-md bg-slate-50/30" />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">季度：Q{info.quarter}</span>
        <span className={info.isWeekend ? 'font-semibold text-amber-600' : 'text-slate-500'}>
          {info.isWeekend ? '周末流量期' : '工作日'}
        </span>
      </div>
    </div>
  );
}
