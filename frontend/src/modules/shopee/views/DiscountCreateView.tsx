import { Check, ChevronDown, ChevronRight, CircleHelp, PackageOpen, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import DateTimePicker from '../components/DateTimePicker';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

type DiscountMode = 'percent' | 'final_price';
type ProductPickerTab = 'select' | 'upload';
type ProductPickerSearchField = 'product_name' | 'product_id';
type ProductPickerDropdown = 'category' | 'search_field' | null;
type ProductPickerCategoryParent = 'shopee' | 'shop' | null;

interface ProductPickerCategoryOption {
  value: string;
  label: string;
  accent?: boolean;
  hasChild?: boolean;
}

interface DiscountCreateBootstrapResponse {
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
  };
  rules: {
    discount_modes: DiscountMode[];
    discount_percent_range: [number, number];
    requires_at_least_one_product: boolean;
  };
  selected_products: DiscountCreateProductRow[];
  product_picker: {
    default_page_size: number;
  };
  draft: {
    id: number;
    updated_at: string;
  } | null;
}

interface DiscountCreateProductRow {
  listing_id: number;
  variant_id: number | null;
  product_name: string;
  variant_name: string;
  category: string;
  image_url: string | null;
  sku: string | null;
  original_price: number;
  stock_available: number;
  discount_mode: DiscountMode;
  discount_percent: number | null;
  final_price: number | null;
  activity_stock_limit: number | null;
  conflict: boolean;
  conflict_reason: string | null;
}

interface EligibleProductsResponse {
  page: number;
  page_size: number;
  total: number;
  items: DiscountCreateProductRow[];
}

interface DiscountCreateViewProps {
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

function formatMoney(value: number) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

function addMinutesToLocalDateTime(value: string, minutes: number): string {
  const date = parseLocalDateTime(value);
  if (!date) return '';
  date.setMinutes(date.getMinutes() + minutes);
  return toDateTimeLocal(date.toISOString());
}

function buildCurrentDefaultDiscountWindow() {
  const now = new Date();
  const start = toDateTimeLocal(now.toISOString());
  const end = addMinutesToLocalDateTime(start, 60);
  return { start, end };
}

function getProductPickerSearchFieldLabel(value: ProductPickerSearchField) {
  if (value === 'product_id') return '商品 ID';
  return '商品名称';
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) return null;
  const [datePart, timePart = '00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map((item) => Number(item));
  const [hour, minute] = timePart.split(':').map((item) => Number(item));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
}

function splitCategoryPath(value: string) {
  return value
    .split(/>|\/|>|›|»/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function computeFinalPrice(originalPrice: number, mode: DiscountMode, discountPercent: number | null, finalPrice: number | null) {
  const safeOriginalPrice = Number(originalPrice || 0);
  if (safeOriginalPrice <= 0) return { percent: null, price: null };
  if (mode === 'final_price') {
    const safeFinalPrice = Number(finalPrice || 0);
    if (safeFinalPrice <= 0 || safeFinalPrice >= safeOriginalPrice) {
      return { percent: null, price: finalPrice };
    }
    return {
      percent: Number(((1 - safeFinalPrice / safeOriginalPrice) * 100).toFixed(2)),
      price: Number(safeFinalPrice.toFixed(2)),
    };
  }

  const safePercent = Number(discountPercent || 0);
  if (safePercent <= 0 || safePercent >= 100) {
    return { percent: discountPercent, price: null };
  }
  return {
    percent: Number(safePercent.toFixed(2)),
    price: Number((safeOriginalPrice * (100 - safePercent) / 100).toFixed(2)),
  };
}

export default function DiscountCreateView({ runId, readOnly = false, onBackToDiscount }: DiscountCreateViewProps) {
  const [bootstrap, setBootstrap] = useState<DiscountCreateBootstrapResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [campaignNameTouched, setCampaignNameTouched] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<DiscountCreateProductRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<ProductPickerTab>('select');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [pickerKeyword, setPickerKeyword] = useState('');
  const [pickerKeywordInput, setPickerKeywordInput] = useState('');
  const [pickerCategory, setPickerCategory] = useState('all');
  const [pickerSearchField, setPickerSearchField] = useState<ProductPickerSearchField>('product_name');
  const [pickerAvailableOnly, setPickerAvailableOnly] = useState(true);
  const [pickerDropdownOpen, setPickerDropdownOpen] = useState<ProductPickerDropdown>(null);
  const [pickerCategoryParent, setPickerCategoryParent] = useState<ProductPickerCategoryParent>(null);
  const [pickerRows, setPickerRows] = useState<DiscountCreateProductRow[]>([]);
  const [pickerSelections, setPickerSelections] = useState<Record<string, DiscountCreateProductRow>>({});
  const [discountModeDropdownRowKey, setDiscountModeDropdownRowKey] = useState<string | null>(null);

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
        const response = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/discount/create/bootstrap?campaign_type=discount`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('bootstrap failed');
        const result = (await response.json()) as DiscountCreateBootstrapResponse;
        if (cancelled) return;
        setBootstrap(result);
        setCampaignName(result.form.campaign_name || '');
        if (result.draft) {
          setStartAt(toDateTimeLocal(result.form.start_at));
          setEndAt(toDateTimeLocal(result.form.end_at));
        } else {
          const defaults = buildCurrentDefaultDiscountWindow();
          setStartAt(defaults.start);
          setEndAt(defaults.end);
        }
        setSelectedProducts(result.selected_products || []);
      } catch {
        if (!cancelled) {
          setError('创建页加载失败，请稍后重试。');
        }
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
    if (!pickerOpen || pickerTab !== 'select' || !runId) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPickerLoading(true);
      setPickerError('');
      try {
        const params = new URLSearchParams({
          keyword: pickerKeyword.trim(),
          page: '1',
          page_size: String(bootstrap?.product_picker.default_page_size || 20),
        });
        const response = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/discount/eligible-products?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('eligible products failed');
        const result = (await response.json()) as EligibleProductsResponse;
        if (cancelled) return;
        setPickerRows(result.items || []);
      } catch {
        if (!cancelled) setPickerError('可选商品加载失败，请稍后重试。');
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pickerKeyword, pickerOpen, pickerTab, runId, bootstrap?.product_picker.default_page_size]);

  const maxNameLength = bootstrap?.form.name_max_length ?? 150;
  const maxDurationDays = bootstrap?.form.max_duration_days ?? 180;
  const durationHint = `活动时长必须小于 ${bootstrap?.form.max_duration_days ?? 180} 天`;
  const durationErrorMessage = useMemo(() => {
    if (!startAt || !endAt) return '';
    const startDate = parseLocalDateTime(startAt);
    const endDate = parseLocalDateTime(endAt);
    if (!startDate || !endDate) return '请完整填写活动时间';
    if (startDate.getTime() >= endDate.getTime()) return '开始时间必须早于结束时间';
    if (endDate.getTime() - startDate.getTime() >= maxDurationDays * 24 * 60 * 60 * 1000) {
      return `活动时长必须小于 ${maxDurationDays} 天`;
    }
    return '';
  }, [endAt, maxDurationDays, startAt]);

  const minEndAt = useMemo(() => (startAt ? addMinutesToLocalDateTime(startAt, 1) : ''), [startAt]);
  const maxEndAt = useMemo(() => (startAt ? addMinutesToLocalDateTime(startAt, maxDurationDays * 24 * 60 - 1) : ''), [maxDurationDays, startAt]);
  const maxStartAt = useMemo(() => (endAt ? addMinutesToLocalDateTime(endAt, -1) : ''), [endAt]);

  const nameErrorMessage = useMemo(() => {
    if (!campaignNameTouched) return '';
    if (!campaignName.trim()) return '请填写活动名称';
    if (campaignName.trim().length > maxNameLength) return `活动名称不能超过 ${maxNameLength} 个字符`;
    return '';
  }, [campaignName, campaignNameTouched, maxNameLength]);

  const validationMessage = useMemo(() => {
    if (!campaignName.trim()) return '请填写活动名称';
    if (campaignName.trim().length > maxNameLength) return `活动名称不能超过 ${maxNameLength} 个字符`;
    if (!startAt || !endAt) return '请完整填写活动时间';
    if (durationErrorMessage) return durationErrorMessage;
    if (!selectedProducts.length) return '请至少添加 1 个商品';
    const invalidRow = selectedProducts.find((item) => {
      const computed = computeFinalPrice(item.original_price, item.discount_mode, item.discount_percent, item.final_price);
      return !computed.percent || !computed.price;
    });
    if (invalidRow) return '请检查商品折扣比例或折后价';
    return '';
  }, [campaignName, durationErrorMessage, endAt, maxNameLength, selectedProducts, startAt]);

  const pickerDisplayRows = useMemo(() => {
    return pickerRows.filter((row) => {
      if (pickerCategory !== 'all' && row.category !== pickerCategory) return false;
      if (!pickerAvailableOnly) return true;
      return row.stock_available > 0 && !row.conflict;
    });
  }, [pickerAvailableOnly, pickerCategory, pickerRows]);

  const selectablePickerRows = useMemo(
    () => pickerDisplayRows.filter((row) => row.stock_available > 0 && !row.conflict),
    [pickerDisplayRows],
  );

  const shopCategoryLeafOptions = useMemo(() => {
    const leafMap = new Map<string, string>();
    pickerRows.forEach((row) => {
      const categoryPath = row.category?.trim();
      if (!categoryPath) return;
      const parts = splitCategoryPath(categoryPath);
      if (!parts.length) return;
      leafMap.set(categoryPath, parts[parts.length - 1]);
    });
    return Array.from(leafMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
  }, [pickerRows]);

  const categoryOptions: ProductPickerCategoryOption[] = [
    { value: 'all', label: '全部分类', accent: true },
    { value: 'shopee', label: 'Shopee 分类', hasChild: true },
    { value: 'shop', label: '店铺分类', hasChild: true },
  ];

  const selectedCategoryLabel = useMemo(() => {
    if (pickerCategory === 'all') return '全部分类';
    const matchedShopCategory = shopCategoryLeafOptions.find((option) => option.value === pickerCategory);
    if (matchedShopCategory) return matchedShopCategory.label;
    return categoryOptions.find((option) => option.value === pickerCategory)?.label ?? '全部分类';
  }, [categoryOptions, pickerCategory, shopCategoryLeafOptions]);

  const searchFieldOptions: Array<{ value: ProductPickerSearchField; label: string }> = [
    { value: 'product_name', label: '商品名称' },
    { value: 'product_id', label: '商品 ID' },
  ];
  const discountModeOptions: Array<{ value: DiscountMode; label: string }> = [
    { value: 'percent', label: '折扣比例' },
    { value: 'final_price', label: '折后价' },
  ];

  const allPickerRowsChecked =
    selectablePickerRows.length > 0 &&
    selectablePickerRows.every((row) => Boolean(pickerSelections[`${row.listing_id}-${row.variant_id ?? 0}`]));

  const handleOpenPicker = () => {
    if (readOnly) {
      window.alert('历史对局回溯模式下仅可浏览，不能添加活动商品。');
      return;
    }
    setPickerSelections({});
    setPickerTab('select');
    setPickerCategory('all');
    setPickerSearchField('product_name');
    setPickerAvailableOnly(true);
    setPickerDropdownOpen(null);
    setPickerCategoryParent(null);
    setPickerKeyword('');
    setPickerKeywordInput('');
    setPickerOpen(true);
  };

  const handleTogglePickerRow = (row: DiscountCreateProductRow) => {
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
    const pickedRows = Object.values(pickerSelections) as DiscountCreateProductRow[];
    if (!pickedRows.length) {
      setPickerOpen(false);
      return;
    }
    setSelectedProducts((prev) => {
      const existing = new Set(prev.map((item) => `${item.listing_id}-${item.variant_id ?? 0}`));
      const merged = [...prev];
      pickedRows.forEach((row) => {
        const key = `${row.listing_id}-${row.variant_id ?? 0}`;
        if (!existing.has(key)) {
          const computed = computeFinalPrice(row.original_price, 'percent', 10, null);
          merged.push({
            ...row,
            discount_mode: 'percent',
            discount_percent: computed.percent,
            final_price: computed.price,
          });
        }
      });
      return merged;
    });
    setPickerOpen(false);
  };

  const handleSearchPicker = () => {
    setPickerDropdownOpen(null);
    setPickerKeyword(pickerKeywordInput.trim());
  };

  const handleResetPicker = () => {
    setPickerCategory('all');
    setPickerSearchField('product_name');
    setPickerAvailableOnly(true);
    setPickerDropdownOpen(null);
    setPickerCategoryParent(null);
    setPickerKeywordInput('');
    setPickerKeyword('');
  };

  const handleToggleAllPickerRows = () => {
    if (!selectablePickerRows.length) return;
    setPickerSelections((prev) => {
      const next = { ...prev };
      if (allPickerRowsChecked) {
        selectablePickerRows.forEach((row) => {
          delete next[`${row.listing_id}-${row.variant_id ?? 0}`];
        });
        return next;
      }
      selectablePickerRows.forEach((row) => {
        next[`${row.listing_id}-${row.variant_id ?? 0}`] = row;
      });
      return next;
    });
  };

  const handleUpdateProduct = (targetKey: string, patch: Partial<DiscountCreateProductRow>) => {
    setSelectedProducts((prev) =>
      prev.map((item) => {
        const key = `${item.listing_id}-${item.variant_id ?? 0}`;
        if (key !== targetKey) return item;
        const next = { ...item, ...patch };
        const computed = computeFinalPrice(next.original_price, next.discount_mode, next.discount_percent, next.final_price);
        return {
          ...next,
          discount_percent: computed.percent,
          final_price: computed.price,
        };
      }),
    );
  };

  const handleRemoveProduct = (targetKey: string) => {
    setSelectedProducts((prev) => prev.filter((item) => `${item.listing_id}-${item.variant_id ?? 0}` !== targetKey));
  };

  useEffect(() => {
    if (!discountModeDropdownRowKey) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-discount-mode-dropdown-root="true"]')) return;
      setDiscountModeDropdownRowKey(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [discountModeDropdownRowKey]);

  const handleSubmit = async () => {
    if (!runId) return;
    if (readOnly) {
      window.alert('历史对局回溯模式下仅可浏览，不能创建折扣活动。');
      return;
    }
    setCampaignNameTouched(true);
    if (validationMessage) {
      if (validationMessage !== '请填写活动名称' && validationMessage !== `活动名称不能超过 ${maxNameLength} 个字符`) {
        window.alert(validationMessage);
      }
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      window.alert('登录状态失效，请重新登录。');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/marketing/discount/campaigns`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          campaign_type: 'discount',
          campaign_name: campaignName.trim(),
          start_at: startAt,
          end_at: endAt,
          items: selectedProducts.map((item) => ({
            listing_id: item.listing_id,
            variant_id: item.variant_id,
            product_name: item.product_name,
            variant_name: item.variant_name,
            image_url: item.image_url,
            sku: item.sku,
            original_price: item.original_price,
            stock_available: item.stock_available,
            discount_mode: item.discount_mode,
            discount_percent: item.discount_percent,
            final_price: item.final_price,
            activity_stock_limit: item.activity_stock_limit,
          })),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || '创建失败');
      }
      window.alert('单品折扣创建成功。');
      onBackToDiscount();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '创建失败，请稍后重试。';
      window.alert(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f6f6f6] px-9 py-6 custom-scrollbar">
      <div className="mx-auto max-w-[1360px]">
        {readOnly ? (
          <div className="mb-5 border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-700">
            当前为历史对局回溯模式：可浏览创建页，但无法添加商品、保存草稿或正式提交。
          </div>
        ) : null}
        {error ? <div className="mb-5 border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</div> : null}

        <section className="border border-[#ececec] bg-white px-7 py-7 shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div className="text-[18px] font-semibold text-[#2f2f2f]">基础信息</div>
          <div className="mt-8 grid grid-cols-[160px_1fr] items-start gap-y-9">
            <div className="pt-3 text-[14px] text-[#444]">折扣活动名称</div>
            <div className="max-w-[650px]">
              <div className="relative">
                <input
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value.slice(0, maxNameLength))}
                  onBlur={() => setCampaignNameTouched(true)}
                  placeholder=""
                  disabled={readOnly || loading}
                  className={`h-10 w-full bg-white px-3 pr-20 text-[14px] text-[#555] outline-none disabled:bg-[#fafafa] ${
                    nameErrorMessage ? 'border border-[#ee4d2d]' : 'border border-[#d9d9d9] focus:border-[#ee4d2d]'
                  }`}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-[#a0a0a0]">
                  {campaignName.length}/{maxNameLength}
                </span>
              </div>
              {nameErrorMessage ? (
                <div className="mt-3 min-h-[18px] text-[13px] leading-[18px] text-[#ee4d2d]">{nameErrorMessage}</div>
              ) : null}
              <div className="mt-3 min-h-[18px] text-[13px] leading-[18px] text-[#9a9a9a]">活动名称仅卖家可见，不向买家展示。</div>
            </div>

            <div className="pt-3 text-[14px] text-[#444]">折扣活动时间</div>
            <div className="max-w-[760px]">
              <div className="flex items-center gap-3">
                <DateTimePicker
                  value={startAt}
                  onChange={setStartAt}
                  inputWidthClassName="w-[180px]"
                  popupPlacement="bottom"
                  maxValue={maxStartAt || undefined}
                />
                <span className="w-[18px] text-center text-[14px] text-[#999]">至</span>
                <DateTimePicker
                  value={endAt}
                  onChange={setEndAt}
                  inputWidthClassName="w-[180px]"
                  popupPlacement="bottom"
                  minValue={minEndAt || undefined}
                  maxValue={maxEndAt || undefined}
                />
              </div>
              <div className={`mt-3 min-h-[18px] text-[13px] leading-[18px] ${durationErrorMessage ? 'text-[#ee4d2d]' : 'text-[#9a9a9a]'}`}>
                {durationErrorMessage || durationHint}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 border border-[#ececec] bg-white px-6 py-6 shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div className="text-[18px] font-semibold text-[#2f2f2f]">单品折扣商品</div>
          <div className="mt-2 text-[14px] text-[#9a9a9a]">将商品加入活动并设置折扣价格。</div>

          <div className="mt-5">
            <button
              type="button"
              onClick={handleOpenPicker}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 border border-[#ee4d2d] px-4 text-[14px] font-medium text-[#ee4d2d] hover:bg-[#fff6f4] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={16} />
              添加商品
            </button>
          </div>

          {selectedProducts.length ? (
            <div className="mt-6 border border-[#efefef]">
              <div className="grid grid-cols-[2.2fr_1fr_0.9fr_0.9fr_0.9fr_0.8fr] bg-[#fafafa] px-4 py-3 text-[14px] text-[#666]">
                <div>商品</div>
                <div>原价</div>
                <div>折扣方式</div>
                <div>折扣值</div>
                <div>折后价</div>
                <div>操作</div>
              </div>
              {selectedProducts.map((item) => {
                const rowKey = `${item.listing_id}-${item.variant_id ?? 0}`;
                return (
                  <div key={rowKey} className="grid grid-cols-[2.2fr_1fr_0.9fr_0.9fr_0.9fr_0.8fr] items-center border-t border-[#f1f1f1] px-4 py-4 text-[14px]">
                    <div className="flex items-center gap-3 pr-4">
                      <div
                        className="h-12 w-12 flex-shrink-0 border border-[#ececec] bg-[#f5f5f5]"
                        style={item.image_url ? { backgroundImage: `url(${item.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[#333]">{item.product_name}</div>
                        <div className="mt-1 text-[12px] text-[#8a8a8a]">
                          {item.variant_name ? `规格：${item.variant_name}` : '单规格商品'}
                          {item.sku ? ` · SKU：${item.sku}` : ''}
                          {` · 库存：${item.stock_available}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-[#555]">{formatMoney(item.original_price)}</div>
                    <div className="relative" data-discount-mode-dropdown-root="true">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setDiscountModeDropdownRowKey((prev) => (prev === rowKey ? null : rowKey))}
                        className={`flex h-9 w-[120px] items-center justify-between border bg-white px-4 text-left text-[14px] text-[#555] ${
                          discountModeDropdownRowKey === rowKey ? 'border-[#c8c8c8] shadow-[0_2px_10px_rgba(15,23,42,0.08)]' : 'border-[#d9d9d9]'
                        } disabled:cursor-not-allowed disabled:bg-[#fafafa]`}
                      >
                        <span>{discountModeOptions.find((option) => option.value === item.discount_mode)?.label ?? '折扣比例'}</span>
                        <ChevronDown size={16} className={`text-[#999] transition-transform ${discountModeDropdownRowKey === rowKey ? 'rotate-180' : ''}`} />
                      </button>
                      {discountModeDropdownRowKey === rowKey && !readOnly ? (
                        <div className="absolute left-0 top-[40px] z-20 w-[120px] border border-[#e6e6e6] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                          {discountModeOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                handleUpdateProduct(rowKey, { discount_mode: option.value });
                                setDiscountModeDropdownRowKey(null);
                              }}
                              className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] hover:bg-[#fafafa] ${
                                item.discount_mode === option.value ? 'text-[#ee4d2d]' : 'text-[#444]'
                              }`}
                            >
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="relative w-[112px]">
                      <input
                        value={item.discount_mode === 'percent' ? String(item.discount_percent ?? '') : '-'}
                        disabled={readOnly || item.discount_mode !== 'percent'}
                        onChange={(event) => handleUpdateProduct(rowKey, { discount_percent: Number(event.target.value || '0') })}
                        className="h-9 w-full border border-[#d9d9d9] bg-white px-3 pr-9 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d] disabled:bg-[#fafafa]"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#999]">%</span>
                    </div>
                    <div className="relative w-[120px]">
                      <input
                        value={item.final_price ?? ''}
                        disabled={readOnly}
                        onChange={(event) => handleUpdateProduct(rowKey, { final_price: Number(event.target.value || '0') })}
                        className="h-9 w-full border border-[#d9d9d9] bg-white px-3 pr-10 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d] disabled:bg-[#fafafa]"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#999]">RM</span>
                    </div>
                    <div>
                      <button type="button" onClick={() => handleRemoveProduct(rowKey)} disabled={readOnly} className="text-[#2563eb] hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40">
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 border border-dashed border-[#e5e5e5] bg-[#fcfcfc] px-6 py-8 text-[14px] text-[#999]">
              还没有加入任何活动商品，先点击“添加商品”开始配置。
            </div>
          )}
        </section>

        <div className="mt-6 flex items-center justify-end gap-4">
          <button type="button" onClick={onBackToDiscount} className="h-10 border border-[#d9d9d9] bg-white px-6 text-[14px] text-[#555] hover:bg-[#fafafa]">
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={readOnly || Boolean(validationMessage) || saving || loading}
            className="h-10 bg-[#ee4d2d] px-8 text-[14px] font-medium text-white hover:bg-[#d83f21] disabled:cursor-not-allowed disabled:bg-[#f3a899]"
          >
            {saving ? '提交中...' : '确认'}
          </button>
        </div>

      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.32)]">
          <div className="flex h-[676px] w-[950px] flex-col border border-[#ececec] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between px-6 pb-2 pt-6">
              <div className="text-[18px] font-semibold text-[#2f2f2f]">选择商品</div>
              <button type="button" onClick={() => setPickerOpen(false)} className="text-[#888] hover:text-[#333]">
                <X size={18} />
              </button>
            </div>
            <div className="border-b border-[#efefef] px-6">
              <div className="flex items-end gap-7 text-[14px]">
                <button
                  type="button"
                  onClick={() => setPickerTab('select')}
                  className={`border-b-2 px-4 py-3 font-medium ${
                    pickerTab === 'select' ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-[#666]'
                  }`}
                >
                  选择商品
                </button>
                <button
                  type="button"
                  onClick={() => setPickerTab('upload')}
                  className={`border-b-2 px-1 py-3 font-medium ${
                    pickerTab === 'upload' ? 'border-[#ee4d2d] text-[#ee4d2d]' : 'border-transparent text-[#666]'
                  }`}
                >
                  上传商品列表
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden px-6 py-4">
              {pickerTab === 'select' ? (
                <>
                  <div className="grid grid-cols-[72px_210px_64px_160px_1fr] items-center gap-3 text-[14px] text-[#555]">
                    <div>分类</div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPickerDropdownOpen((prev) => (prev === 'category' ? null : 'category'))}
                        className={`flex h-10 w-full items-center justify-between border bg-white px-4 text-left text-[14px] ${
                          pickerDropdownOpen === 'category' ? 'border-[#c8c8c8] shadow-[0_2px_10px_rgba(15,23,42,0.08)]' : 'border-[#d9d9d9]'
                        } text-[#555]`}
                      >
                        <span>{selectedCategoryLabel}</span>
                        <ChevronDown size={16} className={`text-[#999] transition-transform ${pickerDropdownOpen === 'category' ? 'rotate-180' : ''}`} />
                      </button>
                      {pickerDropdownOpen === 'category' ? (
                        <div className="absolute left-0 top-[44px] z-20 flex border border-[#e6e6e6] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                          <div className="w-[210px] py-1">
                          {categoryOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onMouseEnter={() => {
                                setPickerCategoryParent(option.hasChild ? (option.value as ProductPickerCategoryParent) : null);
                              }}
                              onClick={() => {
                                if (option.hasChild) {
                                  setPickerCategoryParent(option.value as ProductPickerCategoryParent);
                                  return;
                                }
                                setPickerCategory(option.value);
                                setPickerDropdownOpen(null);
                                setPickerCategoryParent(null);
                              }}
                              className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] hover:bg-[#fafafa] ${
                                option.accent || pickerCategory === option.value ? 'text-[#ee4d2d]' : 'text-[#444]'
                              }`}
                            >
                              <span>{option.label}</span>
                              {option.hasChild ? <ChevronRight size={16} className="text-[#999]" /> : null}
                            </button>
                          ))}
                          </div>
                          {pickerCategoryParent === 'shop' ? (
                            <div className="w-[210px] border-l border-[#efefef] py-1">
                              {shopCategoryLeafOptions.length ? (
                                shopCategoryLeafOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => {
                                      setPickerCategory(option.value);
                                      setPickerDropdownOpen(null);
                                      setPickerCategoryParent(null);
                                    }}
                                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] hover:bg-[#fafafa] ${
                                      pickerCategory === option.value ? 'text-[#ee4d2d]' : 'text-[#444]'
                                    }`}
                                  >
                                    <span className="truncate">{option.label}</span>
                                  </button>
                                ))
                              ) : (
                                <div className="px-4 py-3 text-[13px] text-[#999]">当前店铺暂无可用分类</div>
                              )}
                            </div>
                          ) : null}
                          {pickerCategoryParent === 'shopee' ? (
                            <div className="w-[210px] border-l border-[#efefef] py-1">
                              <div className="px-4 py-3 text-[13px] leading-5 text-[#999]">Shopee 平台分类暂按店铺实际商品分类聚合展示，后续再接独立平台类目树。</div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="pl-4">搜索</div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPickerDropdownOpen((prev) => (prev === 'search_field' ? null : 'search_field'))}
                        className={`flex h-10 w-full items-center justify-between border bg-white px-4 text-left text-[14px] ${
                          pickerDropdownOpen === 'search_field' ? 'border-[#c8c8c8] shadow-[0_2px_10px_rgba(15,23,42,0.08)]' : 'border-[#d9d9d9]'
                        } text-[#555]`}
                      >
                        <span>{getProductPickerSearchFieldLabel(pickerSearchField)}</span>
                        <ChevronDown size={16} className={`text-[#999] transition-transform ${pickerDropdownOpen === 'search_field' ? 'rotate-180' : ''}`} />
                      </button>
                      {pickerDropdownOpen === 'search_field' ? (
                        <div className="absolute left-0 top-[44px] z-20 w-full border border-[#e6e6e6] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
                          {searchFieldOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setPickerSearchField(option.value);
                                setPickerDropdownOpen(null);
                              }}
                              className={`flex w-full items-center justify-between px-4 py-3 text-left text-[14px] hover:bg-[#fafafa] ${
                                pickerSearchField === option.value ? 'text-[#ee4d2d]' : 'text-[#444]'
                              }`}
                            >
                              <span>{option.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex h-10 items-center border border-[#d9d9d9] bg-white px-3 focus-within:border-[#ee4d2d]">
                      <input
                        value={pickerKeywordInput}
                        onChange={(event) => setPickerKeywordInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleSearchPicker();
                          }
                        }}
                        placeholder="请输入"
                        className="w-full bg-transparent text-[14px] text-[#555] outline-none placeholder:text-[#b7b7b7]"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={handleSearchPicker}
                        className="h-8 bg-[#ee4d2d] px-4 text-[14px] font-medium text-white hover:bg-[#d83f21]"
                      >
                        搜索
                      </button>
                      <button
                        type="button"
                        onClick={handleResetPicker}
                        className="h-8 border border-[#d9d9d9] bg-white px-4 text-[14px] text-[#555] hover:bg-[#fafafa]"
                      >
                        重置
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-[14px] text-[#555]">
                      <button
                        type="button"
                        onClick={() => setPickerAvailableOnly((prev) => !prev)}
                        className={`flex h-4 w-4 items-center justify-center border ${
                          pickerAvailableOnly ? 'border-[#ee4d2d] bg-[#ee4d2d]' : 'border-[#cfcfcf] bg-white'
                        }`}
                        aria-pressed={pickerAvailableOnly}
                      >
                        {pickerAvailableOnly ? <Check size={12} className="text-white" /> : null}
                      </button>
                      仅显示可参与活动的商品
                    </label>
                  </div>

                  {pickerError ? <div className="mt-4 border border-red-100 bg-red-50 px-4 py-3 text-[13px] text-red-600">{pickerError}</div> : null}

                  <div className="mt-4 flex h-[388px] flex-col overflow-hidden border border-[#efefef]">
                    <div className="grid grid-cols-[50px_1.9fr_0.7fr_0.8fr_0.8fr] items-center bg-[#fafafa] px-4 py-3 text-[14px] text-[#666]">
                      <div>
                        <button
                          type="button"
                          onClick={handleToggleAllPickerRows}
                          className={`flex h-[18px] w-[18px] items-center justify-center border ${
                            allPickerRowsChecked ? 'border-[#ee4d2d] bg-[#ee4d2d]' : 'border-[#d9d9d9] bg-white'
                          }`}
                          aria-pressed={allPickerRowsChecked}
                        >
                          {allPickerRowsChecked ? <Check size={12} className="text-white" /> : null}
                        </button>
                      </div>
                      <div>商品</div>
                      <div>销量</div>
                      <div>价格</div>
                      <div className="flex items-center gap-1">
                        库存
                        <CircleHelp size={13} className="text-[#b0b0b0]" />
                      </div>
                    </div>

                    {pickerLoading ? (
                      <div className="space-y-3 p-4">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <div key={index} className="h-12 animate-pulse bg-[#f3f3f3]" />
                        ))}
                      </div>
                    ) : pickerDisplayRows.length ? (
                      <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {pickerDisplayRows.map((row) => {
                          const key = `${row.listing_id}-${row.variant_id ?? 0}`;
                          const checked = Boolean(pickerSelections[key]);
                          const disabledRow = row.conflict || row.stock_available <= 0;
                          return (
                            <div key={key} className="grid grid-cols-[50px_1.9fr_0.7fr_0.8fr_0.8fr] items-center border-t border-[#f1f1f1] px-4 py-3 text-[14px] text-[#444]">
                              <div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!disabledRow) handleTogglePickerRow(row);
                                  }}
                                  className={`flex h-[18px] w-[18px] items-center justify-center border ${
                                    checked ? 'border-[#ee4d2d] bg-[#ee4d2d]' : 'border-[#d9d9d9] bg-white'
                                  } ${disabledRow ? 'cursor-not-allowed opacity-40' : ''}`}
                                  aria-pressed={checked}
                                  disabled={disabledRow}
                                >
                                  {checked ? <Check size={12} className="text-white" /> : null}
                                </button>
                              </div>
                              <div className="flex min-w-0 items-center gap-3 pr-4">
                                <div
                                  className="h-10 w-10 flex-shrink-0 border border-[#ececec] bg-[#f5f5f5]"
                                  style={row.image_url ? { backgroundImage: `url(${row.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                                />
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-[#333]">{row.product_name}</div>
                                  <div className="mt-1 truncate text-[12px] text-[#8a8a8a]">
                                    {row.variant_name ? `规格：${row.variant_name}` : '单规格商品'}
                                    {row.sku ? ` · SKU：${row.sku}` : ''}
                                  </div>
                                </div>
                              </div>
                              <div className="text-[#666]">-</div>
                              <div className="text-[#555]">{formatMoney(row.original_price)}</div>
                              <div className={disabledRow ? 'text-[#d14343]' : 'text-[#555]'}>
                                {row.conflict ? row.conflict_reason || '不可参与' : row.stock_available}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-[#9a9a9a]">
                        <div className="flex h-16 w-16 items-center justify-center border border-[#ededed] bg-[#fafafa] text-[#d6d6d6]">
                          <PackageOpen size={28} />
                        </div>
                        <div className="text-[14px]">未找到符合条件的商品</div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col justify-between">
                  <div className="border border-dashed border-[#e5e5e5] bg-[#fcfcfc] px-8 py-12 text-center">
                    <div className="text-[16px] font-medium text-[#333]">上传商品列表</div>
                    <div className="mt-3 text-[14px] leading-6 text-[#8f8f8f]">
                      下一步这里会接入按模板上传商品名单的流程。
                      <br />
                      当前先保留与 Shopee 官方一致的弹窗入口结构。
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-[#efefef] px-6 py-4">
              <button type="button" onClick={() => setPickerOpen(false)} className="h-9 border border-[#d9d9d9] bg-white px-5 text-[14px] text-[#555] hover:bg-[#fafafa]">
                取消
              </button>
              <button
                type="button"
                onClick={handleApplyPicker}
                disabled={pickerTab !== 'select'}
                className="h-9 bg-[#ee4d2d] px-5 text-[14px] font-medium text-white hover:bg-[#d83f21] disabled:cursor-not-allowed disabled:bg-[#f3a899]"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
