import { Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import DateTimePicker from '../components/DateTimePicker';
import homePreviewImage from '../../../assets/home/1.jpeg';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

type BundleType = 'percent' | 'fixed_amount' | 'bundle_price';

interface BundleTier {
  tier_no: number;
  buy_quantity: number;
  discount_value: number;
}

interface BundleProductRow {
  listing_id: number;
  variant_id: number | null;
  product_name: string;
  variant_name: string;
  category: string;
  image_url: string | null;
  sku: string | null;
  original_price: number;
  stock_available: number;
  conflict: boolean;
  conflict_reason: string | null;
}

interface BundleBootstrapResponse {
  meta: {
    run_id: number;
    user_id: number;
    campaign_type: string;
    read_only: boolean;
    current_tick: string;
  };
  form: {
    campaign_name: string;
    name_max_length: number;
    start_at: string | null;
    end_at: string | null;
    max_duration_days: number;
    bundle_type: BundleType;
    purchase_limit: number | null;
    tiers: BundleTier[];
  };
  rules: {
    bundle_types: BundleType[];
    tier_count_limit: number;
    purchase_limit_range: [number, number];
    requires_at_least_one_product: boolean;
  };
  selected_products: BundleProductRow[];
  product_picker: {
    default_page_size: number;
  };
}

interface BundleEligibleProductsResponse {
  page: number;
  page_size: number;
  total: number;
  items: BundleProductRow[];
}

interface BundleCreateViewProps {
  runId: number | null;
  readOnly?: boolean;
  onBackToDiscount: () => void;
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) return null;
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map((item) => Number(item));
  const [hour, minute] = timePart.split(':').map((item) => Number(item));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
}

function addMinutesToLocalDateTime(value: string, minutes: number): string {
  const date = parseLocalDateTime(value);
  if (!date) return '';
  date.setMinutes(date.getMinutes() + minutes);
  return toDateTimeLocal(date.toISOString());
}

function buildCurrentDefaultWindow() {
  const now = new Date();
  const start = toDateTimeLocal(now.toISOString());
  const end = addMinutesToLocalDateTime(start, 60);
  return { start, end };
}

function formatMoney(value: number) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

export default function BundleCreateView({ runId, readOnly = false, onBackToDiscount }: BundleCreateViewProps) {
  const [bootstrap, setBootstrap] = useState<BundleBootstrapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [bundleType, setBundleType] = useState<BundleType>('percent');
  const [purchaseLimit, setPurchaseLimit] = useState('');
  const [tiers, setTiers] = useState<BundleTier[]>([{ tier_no: 1, buy_quantity: 2, discount_value: 10 }]);
  const [selectedProducts, setSelectedProducts] = useState<BundleProductRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerRows, setPickerRows] = useState<BundleProductRow[]>([]);
  const [pickerKeyword, setPickerKeyword] = useState('');
  const [pickerSelections, setPickerSelections] = useState<Record<string, BundleProductRow>>({});

  useEffect(() => {
    if (!runId) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录状态失效，请重新登录。');
      return;
    }
    let cancelled = false;
    const loadBootstrap = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/bundle/create/bootstrap?campaign_type=bundle`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('bootstrap failed');
        const result = (await response.json()) as BundleBootstrapResponse;
        if (cancelled) return;
        setBootstrap(result);
        setCampaignName(result.form.campaign_name || '');
        if (result.form.start_at && result.form.end_at) {
          setStartAt(toDateTimeLocal(result.form.start_at));
          setEndAt(toDateTimeLocal(result.form.end_at));
        } else {
          const defaults = buildCurrentDefaultWindow();
          setStartAt(defaults.start);
          setEndAt(defaults.end);
        }
        setBundleType(result.form.bundle_type || 'percent');
        setPurchaseLimit(result.form.purchase_limit ? String(result.form.purchase_limit) : '');
        setTiers(result.form.tiers?.length ? result.form.tiers : [{ tier_no: 1, buy_quantity: 2, discount_value: 10 }]);
        setSelectedProducts(result.selected_products || []);
      } catch {
        if (!cancelled) setError('套餐优惠创建页加载失败，请稍后重试。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadBootstrap();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!pickerOpen || !runId) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPickerLoading(true);
      try {
        const params = new URLSearchParams({
          keyword: pickerKeyword.trim(),
          page: '1',
          page_size: String(bootstrap?.product_picker.default_page_size || 20),
        });
        const response = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/bundle/eligible-products?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('eligible failed');
        const result = (await response.json()) as BundleEligibleProductsResponse;
        if (!cancelled) setPickerRows(result.items || []);
      } catch {
        if (!cancelled) setPickerRows([]);
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bootstrap?.product_picker.default_page_size, pickerKeyword, pickerOpen, runId]);

  const maxNameLength = bootstrap?.form.name_max_length ?? 25;
  const maxDurationDays = bootstrap?.form.max_duration_days ?? 180;
  const purchaseLimitRange = bootstrap?.rules.purchase_limit_range ?? [1, 999];

  const durationErrorMessage = useMemo(() => {
    if (!startAt || !endAt) return '请完整填写套餐活动时间';
    const startDate = parseLocalDateTime(startAt);
    const endDate = parseLocalDateTime(endAt);
    if (!startDate || !endDate) return '请完整填写套餐活动时间';
    if (startDate.getTime() >= endDate.getTime()) return '开始时间必须早于结束时间';
    if (endDate.getTime() - startDate.getTime() >= maxDurationDays * 24 * 60 * 60 * 1000) return `活动时长必须小于 ${maxDurationDays} 天`;
    return '';
  }, [endAt, maxDurationDays, startAt]);

  const validationMessage = useMemo(() => {
    if (!campaignName.trim()) return '请填写套餐名称';
    if (campaignName.trim().length > maxNameLength) return `套餐名称不能超过 ${maxNameLength} 个字符`;
    if (durationErrorMessage) return durationErrorMessage;
    if (!tiers.length) return '请至少配置 1 条套餐阶梯';
    let lastQuantity = 0;
    for (const tier of tiers) {
      if (!tier.buy_quantity || tier.buy_quantity <= 0) return '购买件数必须大于 0';
      if (tier.buy_quantity <= lastQuantity) return '阶梯购买件数必须严格递增';
      if (!tier.discount_value || tier.discount_value <= 0) return bundleType === 'percent' ? '折扣比例必须大于 0' : '优惠值必须大于 0';
      if (bundleType === 'percent' && tier.discount_value >= 100) return '折扣比例必须小于 100';
      lastQuantity = tier.buy_quantity;
    }
    if (purchaseLimit && (Number(purchaseLimit) < purchaseLimitRange[0] || Number(purchaseLimit) > purchaseLimitRange[1])) {
      return `限购次数必须在 ${purchaseLimitRange[0]} 到 ${purchaseLimitRange[1]} 之间`;
    }
    if (!selectedProducts.length) return '请至少添加 1 个套餐商品';
    return '';
  }, [bundleType, campaignName, durationErrorMessage, maxNameLength, purchaseLimit, purchaseLimitRange, selectedProducts.length, tiers]);

  const minEndAt = useMemo(() => (startAt ? addMinutesToLocalDateTime(startAt, 1) : ''), [startAt]);
  const maxEndAt = useMemo(() => (startAt ? addMinutesToLocalDateTime(startAt, maxDurationDays * 24 * 60 - 1) : ''), [maxDurationDays, startAt]);
  const maxStartAt = useMemo(() => (endAt ? addMinutesToLocalDateTime(endAt, -1) : ''), [endAt]);

  const bundleTypeOptions: Array<{ value: BundleType; label: string }> = [
    { value: 'percent', label: '折扣比例' },
    { value: 'fixed_amount', label: '固定金额减免' },
    { value: 'bundle_price', label: '套餐价' },
  ];
  const renderBundleTierRows = () => {
    return tiers.map((tier) => {
      // 1. Fixed Amount 类型的行渲染
      if (bundleType === 'fixed_amount') {
        return (
          <div 
          key={tier.tier_no} 
          className="flex w-full items-center border-b border-[#f0f0f0] bg-white last:border-0"
          style={{ height: '60px' }}  // ✅ 请把高度加在这里！
        >
            <div className="w-[80px] shrink-0 flex items-center px-4 text-[14px] text-[#333]">{tier.tier_no}</div>
            <div className="flex-1 flex flex-wrap items-center gap-2 px-4">
              <span className="text-[14px] text-[#555] whitespace-nowrap">买</span>
              <div className="flex items-center">
                <input
                  type="number"
                  value={tier.buy_quantity}
                  min={1}
                  disabled={readOnly}
                  onChange={(event) => handleUpdateTier(tier.tier_no, { buy_quantity: Number(event.target.value || '0') })}
                  className="h-10 w-[80px] rounded-[4px] border border-[#d9d9d9] px-3 text-center outline-none focus:border-[#ee4d2d] focus:z-10"
                />
              </div>
              <span className="text-[14px] text-[#555] whitespace-nowrap">件，立减</span>
              <div className="flex items-center">
                <div className="h-10 rounded-l-[4px] border border-[#d9d9d9] border-r-0 bg-white px-3 flex items-center text-[14px] text-[#999]">RM</div>
                <input
                  type="number"
                  value={tier.discount_value}
                  min={0}
                  disabled={readOnly}
                  onChange={(event) => handleUpdateTier(tier.tier_no, { discount_value: Number(event.target.value || '0') })}
                  className="h-10 w-[100px] rounded-r-[4px] border border-[#d9d9d9] px-3 text-center outline-none focus:border-[#ee4d2d] focus:z-10"
                />
              </div>
            </div>
            <div className="w-[88px] shrink-0 flex items-center justify-center px-4">
              <button
                type="button"
                onClick={() => handleRemoveTier(tier.tier_no)}
                disabled={readOnly || tiers.length <= 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9d9d9] bg-white text-[#8c8c8c] transition-colors hover:border-[#2563eb] hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      }

      if (bundleType === 'bundle_price') {
        return (
          <div 
          key={tier.tier_no} 
          className="flex w-full items-center border-b border-[#f0f0f0] bg-white last:border-0"
          style={{ height: '60px' }} 
        >
            <div className="w-[80px] shrink-0 flex items-center px-4 text-[14px] text-[#333]">{tier.tier_no}</div>
            <div className="flex-1 flex flex-wrap items-center gap-2 px-4">
              <span className="text-[14px] text-[#555] whitespace-nowrap">买</span>
              <div className="flex items-center">
                <input
                  type="number"
                  value={tier.buy_quantity}
                  min={1}
                  disabled={readOnly}
                  onChange={(event) => handleUpdateTier(tier.tier_no, { buy_quantity: Number(event.target.value || '0') })}
                  className="h-10 w-[80px] rounded-[4px] border border-[#d9d9d9] px-3 text-center outline-none focus:border-[#ee4d2d] focus:z-10"
                />
              </div>
              <span className="text-[14px] text-[#555] whitespace-nowrap">件，套餐价</span>
              <div className="flex items-center">
                <div className="h-10 rounded-l-[4px] border border-[#d9d9d9] border-r-0 bg-white px-3 flex items-center text-[14px] text-[#999]">RM</div>
                <input
                  type="number"
                  value={tier.discount_value}
                  min={0}
                  disabled={readOnly}
                  onChange={(event) => handleUpdateTier(tier.tier_no, { discount_value: Number(event.target.value || '0') })}
                  className="h-10 w-[100px] rounded-r-[4px] border border-[#d9d9d9] px-3 text-center outline-none focus:border-[#ee4d2d] focus:z-10"
                />
              </div>
            </div>
            <div className="w-[88px] shrink-0 flex items-center justify-center px-4">
              <button
                type="button"
                onClick={() => handleRemoveTier(tier.tier_no)}
                disabled={readOnly || tiers.length <= 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9d9d9] bg-white text-[#8c8c8c] transition-colors hover:border-[#2563eb] hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
      }

      return (
        <div 
          key={tier.tier_no} 
          className="flex w-full items-center border-b border-[#f0f0f0] bg-white last:border-0"
          style={{ height: '60px' }}
        >
          <div className="w-[80px] shrink-0 flex items-center px-4 text-[14px] text-[#333]">{tier.tier_no}</div>
          <div className="flex-1 flex flex-wrap items-center gap-2 px-4">
            <span className="text-[14px] text-[#555] whitespace-nowrap">买</span>
            <div className="flex items-center">
              <input
                type="number"
                value={tier.buy_quantity}
                min={1}
                disabled={readOnly}
                onChange={(event) => handleUpdateTier(tier.tier_no, { buy_quantity: Number(event.target.value || '0') })}
                className="h-10 w-[80px] rounded-[4px] border border-[#d9d9d9] px-3 text-center outline-none focus:border-[#ee4d2d] focus:z-10"
              />
            </div>
            <span className="text-[14px] text-[#555] whitespace-nowrap">件，享</span>
            <div className="flex items-center">
              <input
                type="number"
                value={tier.discount_value}
                min={0}
                disabled={readOnly}
                onChange={(event) => handleUpdateTier(tier.tier_no, { discount_value: Number(event.target.value || '0') })}
                className="h-10 w-[100px] rounded-l-[4px] border border-[#d9d9d9] px-3 text-center outline-none focus:border-[#ee4d2d] focus:z-10"
              />
              <div className="flex h-10 items-center rounded-r-[4px] border border-l-0 border-[#d9d9d9] bg-[#f5f5f5] px-3 text-[13px] text-[#999] whitespace-nowrap">%折扣</div>
            </div>
          </div>
          <div className="w-[88px] shrink-0 flex items-center justify-center px-4">
            <button
              type="button"
              onClick={() => handleRemoveTier(tier.tier_no)}
              disabled={readOnly || tiers.length <= 1}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d9d9d9] bg-white text-[#8c8c8c] transition-colors hover:border-[#2563eb] hover:text-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      );
    });
  };

  const handleAddTier = () => {
    if (readOnly) return;
    setTiers((prev) => [...prev, { tier_no: prev.length + 1, buy_quantity: (prev[prev.length - 1]?.buy_quantity || 1) + 1, discount_value: prev[prev.length - 1]?.discount_value || 10 }]);
  };

  const handleRemoveTier = (tierNo: number) => {
    if (readOnly) return;
    setTiers((prev) => prev.filter((tier) => tier.tier_no !== tierNo).map((tier, index) => ({ ...tier, tier_no: index + 1 })));
  };

  const handleUpdateTier = (tierNo: number, patch: Partial<BundleTier>) => {
    setTiers((prev) => prev.map((tier) => (tier.tier_no === tierNo ? { ...tier, ...patch } : tier)));
  };

  const handleOpenPicker = () => {
    if (readOnly) {
      window.alert('历史对局回溯模式下仅可浏览，不能添加套餐商品。');
      return;
    }
    setPickerSelections({});
    setPickerKeyword('');
    setPickerOpen(true);
  };

  const handleTogglePickerRow = (row: BundleProductRow) => {
    const key = `${row.listing_id}-${row.variant_id ?? 0}`;
    setPickerSelections((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: row };
    });
  };

  const handleApplyPicker = () => {
    const pickedRows = Object.values(pickerSelections) as BundleProductRow[];
    setSelectedProducts((prev) => {
      const existing = new Set(prev.map((item) => `${item.listing_id}-${item.variant_id ?? 0}`));
      return [...prev, ...pickedRows.filter((item) => !existing.has(`${item.listing_id}-${item.variant_id ?? 0}`))];
    });
    setPickerOpen(false);
  };

  const handleSubmit = async () => {
    if (!runId) return;
    if (readOnly) {
      window.alert('历史对局回溯模式下仅可浏览，不能创建套餐优惠。');
      return;
    }
    if (validationMessage) {
      window.alert(validationMessage);
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      window.alert('登录状态失效，请重新登录。');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/bundle/campaigns`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_type: 'bundle',
          campaign_name: campaignName.trim(),
          start_at: startAt,
          end_at: endAt,
          bundle_type: bundleType,
          purchase_limit: purchaseLimit ? Number(purchaseLimit) : null,
          tiers: tiers.map((tier, index) => ({ tier_no: index + 1, buy_quantity: Number(tier.buy_quantity), discount_value: Number(tier.discount_value) })),
          items: selectedProducts.map((item) => ({
            listing_id: item.listing_id,
            variant_id: item.variant_id,
            product_name: item.product_name,
            variant_name: item.variant_name,
            image_url: item.image_url,
            sku: item.sku,
            original_price: item.original_price,
            stock_available: item.stock_available,
          })),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || '创建失败');
      }
      window.alert('套餐优惠创建成功。');
      onBackToDiscount();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '创建失败，请稍后重试。';
      window.alert(message);
    } finally {
      setSaving(false);
    }
  };

  const playerDisplayName = '玩家'; // Placeholder if needed, but runId is passed

  return (
    <div className="flex-1 overflow-y-auto bg-[#f6f6f6] px-9 py-6 custom-scrollbar">
      <div className="mx-auto max-w-[1360px] pb-10">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-[14px] text-[#999]">
          <span className="hover:text-[#ee4d2d] cursor-pointer">首页</span>
          <span>&gt;</span>
          <span className="hover:text-[#ee4d2d] cursor-pointer">营销中心</span>
          <span>&gt;</span>
          <span className="hover:text-[#ee4d2d] cursor-pointer">套餐优惠</span>
          <span>&gt;</span>
          <span className="text-[#333]">创建新套餐优惠</span>
        </div>

        {readOnly ? <div className="mb-5 border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-700">当前为历史对局回溯模式：可浏览创建页，但不能提交套餐活动。</div> : null}
        {error ? <div className="mb-5 border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</div> : null}

        <section className="rounded-[4px] border border-[#e6e6e6] bg-white px-8 py-8 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="text-[18px] font-bold text-[#333] mb-6">基本信息</div>
          
          <div className="flex gap-6">
            {/* Form Column */}
            <div className="flex-1 max-w-[810px]">
              <div className="flex flex-col gap-y-10">
                {/* Bundle Deal Name */}
                <div className="flex items-start">
                  <div className="w-[180px] shrink-0 pt-[8px] pr-6 text-right text-[14px] font-normal leading-5 text-[#555]">
                    套餐优惠名称
                  </div>
                  <div className="w-[760px] max-w-full">
                    <div className="relative">
                      <input
                        value={campaignName}
                        onChange={(event) => setCampaignName(event.target.value.slice(0, maxNameLength))}
                        disabled={readOnly || loading}
                        placeholder="请输入"
                        className="h-10 w-full rounded-[4px] border border-[#d9d9d9] bg-white px-3 pr-20 text-[14px] text-[#333] outline-none transition-all placeholder:text-[#bfbfbf] focus:border-[#ee4d2d] disabled:bg-[#fafafa]"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#a0a0a0]">{campaignName.length}/{maxNameLength}</span>
                    </div>
                    <div className="mt-1.5 text-[12px] text-[#999]">套餐优惠名称仅供卖家参考，买家不可见。</div>
                  </div>
                </div>

                {/* Bundle Deal Period */}
                <div className="flex items-start">
                  <div className="w-[180px] shrink-0 pt-[10px] pr-6 text-right text-[14px] font-normal leading-5 text-[#555]">
                    套餐优惠时间
                  </div>
                  <div className="w-[760px] max-w-full">
                    <div className="flex items-center gap-3">
                      <DateTimePicker value={startAt} onChange={setStartAt} inputWidthClassName="flex-1 min-w-0" popupPlacement="bottom" maxValue={maxStartAt || undefined} />
                      <span className="flex-shrink-0 text-[#bcbcbc]">—</span>
                      <DateTimePicker value={endAt} onChange={setEndAt} inputWidthClassName="flex-1 min-w-0" popupPlacement="bottom" minValue={minEndAt || undefined} maxValue={maxEndAt || undefined} />
                    </div>
                    <div className={`mt-1.5 text-[12px] ${durationErrorMessage ? 'text-[#ee4d2d]' : 'text-[#999]'}`}>
                      {durationErrorMessage || `活动时长必须少于 ${maxDurationDays} 天。`}
                    </div>
                  </div>
                </div>

                {/* Bundle Deal Type */}
                <div className="flex items-start">
                  <div className="w-[180px] shrink-0 pt-0 pr-6 text-right text-[14px] font-normal leading-5 text-[#555]">
                    套餐优惠类型
                  </div>
                  <div className="w-[760px] max-w-full space-y-3">
                    {bundleTypeOptions.map((option) => {
                      const isActive = option.value === bundleType;
                      return (
                        <div key={option.value} className="space-y-3">
                          <label className="group flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name="bundleType"
                              className="h-4 w-4 shrink-0 accent-[#ee4d2d] align-middle"
                              checked={isActive}
                              onChange={() => setBundleType(option.value)}
                              disabled={readOnly}
                            />
                            <span className={`text-[14px] leading-5 ${isActive ? 'text-[#333]' : 'text-[#555]'}`}>{option.label}</span>
                          </label>

                          {isActive ? (
                            <div className="overflow-hidden rounded-[4px] border border-[#f0f0f0] bg-white">
                              <div 
                                className="flex w-full items-center border-b border-[#eee] bg-[#f5f5f5] text-[14px] font-medium text-[#666]"
                                style={{ height: '50px' }} 
                              >
                                <div className="w-[80px] shrink-0 px-4 whitespace-nowrap leading-5">阶梯</div>
                                <div className="flex-1" />
                                <div className="w-[88px] shrink-0 flex justify-center px-4 whitespace-nowrap leading-5">操作</div>
                              </div>
                              <div className="max-h-[300px] overflow-y-auto">
                                {renderBundleTierRows()}
                              </div>
                              <div className="border-t border-[#f0f0f0] bg-white px-4 py-3">
                                <button
                                  type="button"
                                  onClick={handleAddTier}
                                  disabled={readOnly || tiers.length >= (bootstrap?.rules.tier_count_limit ?? 10)}
                                  className="inline-flex h-8 items-center gap-2 px-2 text-[14px] text-[#2563eb] transition-colors hover:text-[#1d4ed8] disabled:opacity-40"
                                >
                                  <Plus size={16} />
                                  <span>新增阶梯</span>
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Purchase Limit */}
              <div className="mt-4 flex items-start">
                <div className="w-[180px] shrink-0 pt-[8px] pr-6 text-right text-[14px] font-normal leading-5 text-[#555]">
                  限购次数
                </div>
                <div className="w-[760px] max-w-full">
                  <div className="relative w-full">
                    <input 
                      value={purchaseLimit} 
                      onChange={(event) => setPurchaseLimit(event.target.value.replace(/[^\d]/g, ''))} 
                      disabled={readOnly} 
                      placeholder="请输入" 
                      className="h-10 w-full rounded-[4px] border border-[#d9d9d9] px-3 text-[14px] text-[#333] outline-none transition-all placeholder:text-[#bfbfbf] focus:border-[#ee4d2d]" 
                    />
                  </div>
                  <div className="mt-1.5 text-[12px] text-[#999]">买家可以购买该套餐优惠的最大次数。</div>
                </div>
              </div>
            </div>

{/* Phone Preview Column */}
<div 
  className="w-[280px] flex-shrink-0" 
  style={{ 
    marginTop: '-120px',
    marginLeft: '100px' 
  }} 
>
  <div className="relative">
    {/* 手机总容器：280x560，去掉所有背景色和边框 */}
    <div className="relative mx-auto h-[560px] w-[280px]">
      
      {/* 1. 屏幕内容层：限制截图只显示在手机屏幕开口内 */}
      <div 
        className="absolute z-10 overflow-hidden"
        style={{
          // 根据 Shopee 原图比例精确对齐内部白色区域
          top: '38px',     
          left: '18px',    
          right: '18px',
          bottom: '42px',
          backgroundColor: '#fff',
          borderRadius: '22px',
        }}
      >
        {/* 截图图片 */}
        <img 
          src={homePreviewImage} 
          alt="screenshot"
          style={{ 
            position: 'absolute',
            top: '110px',
            left: '16px',
            width: '212px', 
            height: '212px',
            aspectRatio: '1/1', 
            objectFit: 'cover', 
            display: 'block'
          }}
        />
      </div>

      {/* 2. 手机外壳图：放在最上面 (z-20)，作为盖子扣在内容上 */}
      {/* pointer-events-none 极其重要，否则你无法在手机区域内滚动图片 */}
      <img 
        src="https://deo.shopeemobile.com/shopee/shopee-seller-live-sg/mmf_portal_seller_root_dir/static/modules/bundle-deal-v2/image/phone_bg.076ca95.png" 
        className="absolute inset-0 h-full w-full object-contain z-20 pointer-events-none"
        alt="phone frame"
      />

    </div>
  </div>
</div>
          </div>
        </section>

        <section className="mt-6 rounded-[4px] border border-[#e5e5e5] bg-white px-6 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="min-h-[150px]">
            <div className="text-[18px] font-semibold text-[#333]">套餐优惠商品</div>
            <div className="mt-3 text-[14px] text-[#999]">请添加商品到套餐优惠中。</div>
            <div className="mt-7">
              <button
                type="button"
                onClick={handleOpenPicker}
                disabled={loading}
                className="inline-flex h-[32px] items-center gap-2 rounded-[4px] border border-[#ee4d2d] bg-white px-4 text-[14px] font-normal text-[#ee4d2d] transition-colors hover:bg-[#fff8f5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={16} strokeWidth={1.75} />
                添加商品
              </button>
            </div>

            {selectedProducts.length ? (
              <div className="mt-8 border-t border-[#f0f0f0] pt-5">
                <div className="grid grid-cols-[1fr_200px_100px] border-b border-[#eee] pb-3 text-[14px] font-medium text-[#666]">
                  <div>商品信息</div>
                  <div>价格与库存</div>
                  <div className="text-right">操作</div>
                </div>
                {selectedProducts.map((item) => {
                  const rowKey = `${item.listing_id}-${item.variant_id ?? 0}`;
                  return (
                    <div key={rowKey} className="grid grid-cols-[1fr_200px_100px] items-center border-b border-[#f5f5f5] py-4 text-[14px]">
                      <div className="flex min-w-0 items-center gap-4 pr-4">
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-[2px] border border-[#ececec] bg-[#f5f5f5]">
                          {item.image_url ? (
                            <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#ddd]"><Plus size={20} /></div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] text-[#333]">{item.product_name}</div>
                          <div className="mt-1 truncate text-[12px] text-[#999]">
                            {item.variant_name || '无规格'}
                            {item.sku ? ` · SKU: ${item.sku}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-[14px] text-[#555]">
                        <div>{formatMoney(item.original_price)}</div>
                        <div className="mt-1 text-[12px] text-[#999]">库存：{item.stock_available}</div>
                      </div>
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedProducts((prev) => prev.filter((row) => `${row.listing_id}-${row.variant_id ?? 0}` !== rowKey))}
                          disabled={readOnly}
                          className="text-[#ee4d2d] transition-opacity hover:opacity-80 disabled:opacity-40"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-4 flex items-center justify-end gap-3 px-1 py-2">
          <button 
            type="button" 
            onClick={onBackToDiscount} 
            style={{ height: '38px' }}
            className="flex w-[72px] items-center justify-center rounded-[4px] border border-[#d9d9d9] bg-white text-[14px] text-[#333] transition-colors hover:bg-[#f5f5f5]"
          >
            Cancel
          </button>
          
          <button 
            type="button" 
            onClick={handleSubmit} 
            disabled={readOnly || Boolean(validationMessage) || saving || loading} 
            style={{ height: '38px' }}
            className="flex min-w-[84px] items-center justify-center rounded-[4px] bg-[#ee4d2d] px-3 text-[14px] text-white transition-colors hover:bg-[#d73f22] disabled:cursor-not-allowed disabled:bg-[#f59a8d] disabled:hover:bg-[#f59a8d]"
          >
            {saving ? 'Submitting...' : 'Confirm'}
          </button>
        </div>

        {pickerOpen ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="flex h-[720px] w-[960px] flex-col overflow-hidden rounded-[8px] bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b px-6 py-5">
                <div className="text-[18px] font-bold text-[#333]">添加套餐商品</div>
                <button type="button" onClick={() => setPickerOpen(false)} className="text-[#888] hover:text-[#333] transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="px-6 py-4">
                <div className="relative w-[360px]">
                  <input 
                    value={pickerKeyword} 
                    onChange={(event) => setPickerKeyword(event.target.value)} 
                    placeholder="通过商品名称或 SKU 搜索" 
                    className="h-10 w-full rounded-[4px] border border-[#d9d9d9] px-4 text-[14px] outline-none transition-all focus:border-[#ee4d2d] focus:ring-1 focus:ring-[#ee4d2d]/20" 
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <div className="grid grid-cols-[48px_1.5fr_0.7fr_0.6fr] bg-[#f7f7f7] px-4 py-3 text-[14px] text-[#666] font-medium rounded-t-[4px]">
                  <div></div>
                  <div>商品详情</div>
                  <div>价格</div>
                  <div>可用库存</div>
                </div>
                {pickerRows.map((row) => {
                  const rowKey = `${row.listing_id}-${row.variant_id ?? 0}`;
                  const checked = Boolean(pickerSelections[rowKey]);
                  return (
                    <button 
                      key={rowKey} 
                      type="button" 
                      onClick={() => handleTogglePickerRow(row)} 
                      className={`grid w-full grid-cols-[48px_1.5fr_0.7fr_0.6fr] items-center border-b border-[#f0f0f0] px-4 py-4 text-left transition-colors hover:bg-[#f9f9f9] ${checked ? 'bg-[#fff9f8]' : ''}`}
                    >
                      <div>
                        <div className={`h-4 w-4 rounded-[2px] border flex items-center justify-center transition-all ${checked ? 'bg-[#ee4d2d] border-[#ee4d2d]' : 'border-[#d9d9d9] bg-white'}`}>
                          {checked && <div className="h-2 w-2 bg-white rounded-full"></div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 flex-shrink-0 rounded-[4px] border border-[#ececec] bg-[#f5f5f5] overflow-hidden">
                          {row.image_url ? (
                            <img src={row.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#ddd]"><Plus size={20} /></div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] text-[#333]">{row.product_name}</div>
                          <div className="mt-1 truncate text-[12px] text-[#8a8a8a]">{row.variant_name || '无规格商品'}{row.sku ? ` · SKU: ${row.sku}` : ''}</div>
                        </div>
                      </div>
                      <div className="text-[14px] text-[#555]">{formatMoney(row.original_price)}</div>
                      <div className="text-[14px] text-[#555]">{row.stock_available}</div>
                    </button>
                  );
                })}
                {pickerLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-[14px] text-[#999]">
                    <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-[#eee] border-t-[#ee4d2d]"></div>
                    正在加载商品列表...
                  </div>
                ) : pickerRows.length === 0 ? (
                  <div className="py-20 text-center text-[14px] text-[#999]">未找到匹配的商品</div>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-[#eee] px-6 py-5 bg-[#fafafa]">
                <div className="mr-auto text-[14px] text-[#666]">
                  已选择 <span className="font-bold text-[#ee4d2d]">{Object.keys(pickerSelections).length}</span> 个商品
                </div>
                <button 
                  type="button" 
                  onClick={() => setPickerOpen(false)} 
                  className="h-10 min-w-[80px] rounded-[4px] border border-[#d9d9d9] bg-white px-6 text-[14px] text-[#555] hover:bg-white/80 transition-colors"
                >
                  取消
                </button>
                <button 
                  type="button" 
                  onClick={handleApplyPicker} 
                  disabled={Object.keys(pickerSelections).length === 0}
                  className="h-10 min-w-[140px] rounded-[4px] bg-[#ee4d2d] px-8 text-[14px] font-medium text-white shadow-sm transition-all hover:bg-[#e04526] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  确认添加
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
