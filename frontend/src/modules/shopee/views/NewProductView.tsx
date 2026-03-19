import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, HelpCircle, Image as ImageIcon, ImagePlus, Search, Trash2, Video, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import DateOnlyPicker from '../components/DateOnlyPicker';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';
const MAX_IMAGES = 9;

interface NewProductViewProps {
  runId: number | null;
  editingListingId: number | null;
  onBackToProducts: () => void;
}

interface DraftImage {
  id: number;
  image_url: string;
  sort_order: number;
  is_cover: boolean;
}

interface DraftDetail {
  id: number;
  title: string;
  category_id: number | null;
  category: string | null;
  gtin: string | null;
  description: string | null;
  video_url: string | null;
  cover_url: string | null;
  image_count_11: number;
  image_count_34: number;
  images_11: DraftImage[];
  images_34: DraftImage[];
  specs: Array<{ attr_key: string; attr_label: string; attr_value: string | null }>;
}

interface ListingEditVariant {
  id: number;
  variant_name: string | null;
  option_value: string;
  option_note: string | null;
  price: number;
  stock: number;
  sku: string | null;
  gtin: string | null;
  item_without_gtin: boolean;
  weight_kg: number | null;
  parcel_length_cm: number | null;
  parcel_width_cm: number | null;
  parcel_height_cm: number | null;
  image_url: string | null;
  sort_order: number;
}

interface ListingEditWholesaleTier {
  id: number;
  tier_no: number;
  min_qty: number | null;
  max_qty: number | null;
  unit_price: number | null;
}

interface ListingEditDetail {
  id: number;
  title: string;
  category_id: number | null;
  category: string | null;
  gtin: string | null;
  description: string | null;
  video_url: string | null;
  cover_url: string | null;
  price: number;
  stock_available: number;
  min_purchase_qty: number;
  max_purchase_qty: number | null;
  max_purchase_mode: 'none' | 'per_order' | 'per_time_period';
  max_purchase_period_start_date: string | null;
  max_purchase_period_end_date: string | null;
  max_purchase_period_qty: number | null;
  max_purchase_period_days: number | null;
  max_purchase_period_model: 'single' | 'recurring' | null;
  weight_kg: number | null;
  parcel_length_cm: number | null;
  parcel_width_cm: number | null;
  parcel_height_cm: number | null;
  shipping_variation_dimension_enabled: boolean;
  shipping_standard_bulk: boolean;
  shipping_standard: boolean;
  shipping_express: boolean;
  preorder_enabled: boolean;
  insurance_enabled: boolean;
  condition_label: string | null;
  schedule_publish_at: string | null;
  parent_sku: string | null;
  variants: ListingEditVariant[];
  wholesale_tiers: ListingEditWholesaleTier[];
}

interface EditBootstrapResponse {
  draft: DraftDetail;
  listing: ListingEditDetail;
}

interface SpecTemplateField {
  attr_key: string;
  attr_label: string;
  input_type: string;
  options: string[];
  is_required: boolean;
  sort_order: number;
}

interface CategoryNode {
  id: number;
  name: string;
  level: number;
  path: string;
  children: CategoryNode[];
}

interface VariationOptionRow {
  id: string;
  value: string;
  note: string;
}

interface VariationGroup {
  id: string;
  name: string;
  input: string;
  options: VariationOptionRow[];
}

interface VariationCombinationRow {
  id: string;
  variantName: string;
  optionValue: string;
  optionNote: string;
  displayValues: string[];
  primaryOptionId: string;
  secondaryOptionId?: string;
}

interface VariationDetailRow {
  sourceVariantId?: number | null;
  price: string;
  stock: string;
  sku: string;
  gtin: string;
  itemWithoutGtin: boolean;
  weightKg: string;
  parcelLengthCm: string;
  parcelWidthCm: string;
  parcelHeightCm: string;
  imageFile: File | null;
  imagePreview: string;
}

interface WholesaleTierRow {
  id: string;
  minQty: string;
  maxQty: string;
  unitPrice: string;
}

function resolveImageUrl(raw: string): string {
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `${API_BASE_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

function buildVariationId(): string {
  return `var_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function createVariationGroup(index: number): VariationGroup {
  return {
    id: buildVariationId(),
    name: `变体${index + 1}`,
    input: '',
    options: [{ id: buildVariationId(), value: '', note: '' }],
  };
}

function normalizeVariationGroups(groups: VariationGroup[]): VariationGroup[] {
  return groups.map((group, index) => ({
    ...group,
    name: `变体${index + 1}`,
  }));
}

function buildWholesaleTierId(): string {
  return `tier_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function buildDefaultVariationDetail(): VariationDetailRow {
  return {
    sourceVariantId: null,
    price: '',
    stock: '0',
    sku: '',
    gtin: '',
    itemWithoutGtin: false,
    weightKg: '',
    parcelLengthCm: '',
    parcelWidthCm: '',
    parcelHeightCm: '',
    imageFile: null,
    imagePreview: '',
  };
}

function formatDateLabel(value: string): string {
  if (!value) return '-';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}-${m}-${y}`;
}

function toLocalDateTimeText(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function formatVideoDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

async function extractVideoMetaFromFile(file: File): Promise<{ durationSec: number | null; thumbnailUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('读取视频元信息失败'));
    });

    const durationSec = Number.isFinite(video.duration) ? video.duration : null;
    video.currentTime = Math.min(0.2, Math.max((durationSec ?? 0) / 2, 0));
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 120);
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(video.videoWidth || 160, 1);
    canvas.height = Math.max(video.videoHeight || 160, 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { durationSec, thumbnailUrl: '' };
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { durationSec, thumbnailUrl: canvas.toDataURL('image/jpeg', 0.85) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function extractVideoMetaFromUrl(url: string): Promise<{ durationSec: number | null; thumbnailUrl: string }> {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('读取视频元信息失败'));
  });

  const durationSec = Number.isFinite(video.duration) ? video.duration : null;
  video.currentTime = Math.min(0.2, Math.max((durationSec ?? 0) / 2, 0));
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
    setTimeout(resolve, 120);
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(video.videoWidth || 160, 1);
  canvas.height = Math.max(video.videoHeight || 160, 1);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { durationSec, thumbnailUrl: '' };
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { durationSec, thumbnailUrl: canvas.toDataURL('image/jpeg', 0.85) };
  } catch {
    return { durationSec, thumbnailUrl: '' };
  }
}

type ShippingChannelCode = 'standard_bulk' | 'standard' | 'express';

function getShippingFeeByWeight(channel: ShippingChannelCode, weightValue: string): { fee: number | null; rangeLabel: string } {
  const weight = Number(weightValue);
  if (!Number.isFinite(weight) || weight <= 0) return { fee: null, rangeLabel: '未填写重量' };

  const feeRules: Record<ShippingChannelCode, Array<{ min: number; max: number; fee: number; label: string }>> = {
    standard_bulk: [
      { min: 1, max: 5, fee: 100, label: '1-5kg' },
      { min: 6, max: 10, fee: 180, label: '6-10kg' },
      { min: 10.000001, max: Number.POSITIVE_INFINITY, fee: 260, label: '10kg以上' },
    ],
    standard: [
      { min: 1, max: 5, fee: 35, label: '1-5kg' },
      { min: 6, max: 10, fee: 55, label: '6-10kg' },
      { min: 10.000001, max: Number.POSITIVE_INFINITY, fee: 80, label: '10kg以上' },
    ],
    express: [
      { min: 1, max: 5, fee: 29, label: '1-5kg' },
      { min: 6, max: 10, fee: 49, label: '6-10kg' },
      { min: 10.000001, max: Number.POSITIVE_INFINITY, fee: 69, label: '10kg以上' },
    ],
  };

  const matched = feeRules[channel].find((row) => weight >= row.min && weight <= row.max);
  return matched ? { fee: matched.fee, rangeLabel: matched.label } : { fee: null, rangeLabel: '超出区间' };
}

interface SearchSelectProps {
  value: string;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  onChange: (next: string) => void;
}

function SearchSelect({
  value,
  options,
  placeholder = '请选择',
  searchPlaceholder = '请输入至少2个字符',
  onChange,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return options;
    return options.filter((item) => item.toLowerCase().includes(kw));
  }, [keyword, options]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-full items-center justify-between rounded-sm border border-[#d9d9d9] bg-white px-3 text-left text-[14px] text-[#555] outline-none hover:border-[#cfcfcf]"
      >
        <span className={value ? 'text-[#555]' : 'text-[#a8a8a8]'}>{value || placeholder}</span>
        <ChevronDown size={14} className={`text-[#a8a8a8] transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[42px] z-30 rounded-sm border border-[#d9d9d9] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <div className="border-b border-[#ededed] p-2">
            <div className="flex h-8 items-center rounded-sm border border-[#d9d9d9] bg-[#fafafa] px-2">
              <Search size={13} className="text-[#b0b0b0]" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="h-full flex-1 bg-transparent px-2 text-[13px] text-[#555] outline-none"
                placeholder={searchPlaceholder}
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1 text-[14px]">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[13px] text-[#9b9b9b]">没有匹配项</div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left hover:bg-[#f7f7f7] ${value === option ? 'bg-[#fff1ec] text-[#ee4d2d]' : 'text-[#444]'}`}
                >
                  {option}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface PlainSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function PlainSelect({ value, options, onChange }: PlainSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-[420px]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-10 w-full items-center justify-between rounded-sm border bg-white px-3 text-[14px] ${
          open ? 'border-[#ee4d2d]' : 'border-[#d9d9d9]'
        }`}
      >
        <span className={value ? 'text-[#555]' : 'text-[#a8a8a8]'}>{value || '请选择'}</span>
        <ChevronDown size={14} className={`text-[#a8a8a8] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[42px] z-30 rounded-sm border border-[#d9d9d9] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          {options.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onChange(item);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-[14px] hover:bg-[#fafafa] ${
                value === item ? 'text-[#ee4d2d]' : 'text-[#444]'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
}

function pad2(num: number): string {
  return String(num).padStart(2, '0');
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) return null;
  const [datePart, timePart = '00:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map((item) => Number(item));
  const [hh, mm] = timePart.split(':').map((item) => Number(item));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
}

function formatLocalDateTime(date: Date, hour: number, minute: number): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(hour)}:${pad2(minute)}`;
}

function formatDisplayDateTime(value: string): string {
  const date = parseLocalDateTime(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initialDate = parseLocalDateTime(value) ?? new Date();
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [selectedDay, setSelectedDay] = useState<Date>(initialDate);
  const [selectedHour, setSelectedHour] = useState(initialDate.getHours());
  const [selectedMinute, setSelectedMinute] = useState(initialDate.getMinutes());

  useEffect(() => {
    if (!open) return;
    const current = parseLocalDateTime(value) ?? new Date();
    setViewYear(current.getFullYear());
    setViewMonth(current.getMonth());
    setSelectedDay(current);
    setSelectedHour(current.getHours());
    setSelectedMinute(current.getMinutes());
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const monthStart = new Date(viewYear, viewMonth, 1);
  const monthStartWeekday = monthStart.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
  const dayCells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    const dayNum = i - monthStartWeekday + 1;
    if (dayNum <= 0) {
      dayCells.push({ date: new Date(viewYear, viewMonth - 1, daysInPrevMonth + dayNum), inMonth: false });
    } else if (dayNum > daysInMonth) {
      dayCells.push({ date: new Date(viewYear, viewMonth + 1, dayNum - daysInMonth), inMonth: false });
    } else {
      dayCells.push({ date: new Date(viewYear, viewMonth, dayNum), inMonth: true });
    }
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthLabel = `${monthNames[viewMonth]}${viewYear}`;
  const weekLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const hourWheel = Array.from({ length: 7 }).map((_, idx) => (selectedHour - 3 + idx + 24) % 24);
  const minuteWheel = Array.from({ length: 7 }).map((_, idx) => (selectedMinute - 3 + idx + 60) % 60);

  const handlePanelWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.target as HTMLElement;
    if (target.closest('[data-time-wheel="hour"]')) {
      if (e.deltaY > 0) {
        setSelectedHour((prev) => (prev + 1) % 24);
      } else if (e.deltaY < 0) {
        setSelectedHour((prev) => (prev + 23) % 24);
      }
      return;
    }

    if (target.closest('[data-time-wheel="minute"]')) {
      if (e.deltaY > 0) {
        setSelectedMinute((prev) => (prev + 1) % 60);
      } else if (e.deltaY < 0) {
        setSelectedMinute((prev) => (prev + 59) % 60);
      }
    }
  };

  return (
    <div ref={rootRef} className="relative w-[420px]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-10 w-full items-center rounded-sm border bg-white px-3 text-left text-[14px] ${
          open ? 'border-[#ee4d2d]' : 'border-[#d9d9d9]'
        }`}
      >
        <Calendar size={14} className="text-[#a8a8a8]" />
        <span className={`ml-2 flex-1 ${value ? 'text-[#555]' : 'text-[#b0b0b0]'}`}>{value ? formatDisplayDateTime(value) : '请选择日期时间'}</span>
      </button>

      {open && (
        <div
          className="absolute bottom-[44px] left-0 z-40 flex w-[530px] overflow-hidden rounded-sm border border-[#d9d9d9] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          onWheelCapture={handlePanelWheel}
        >
          <div className="w-[360px] border-r border-[#ececec] p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const prev = new Date(viewYear - 1, viewMonth, 1);
                  setViewYear(prev.getFullYear());
                  setViewMonth(prev.getMonth());
                }}
                className="rounded p-1 text-[#8a8a8a] hover:bg-[#f5f5f5]"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const prev = new Date(viewYear, viewMonth - 1, 1);
                  setViewYear(prev.getFullYear());
                  setViewMonth(prev.getMonth());
                }}
                className="rounded p-1 text-[#8a8a8a] hover:bg-[#f5f5f5]"
              >
                <ChevronLeft size={14} />
              </button>
              <div className="text-[16px] font-semibold text-[#333]">{monthLabel}</div>
              <button
                type="button"
                onClick={() => {
                  const next = new Date(viewYear, viewMonth + 1, 1);
                  setViewYear(next.getFullYear());
                  setViewMonth(next.getMonth());
                }}
                className="rounded p-1 text-[#8a8a8a] hover:bg-[#f5f5f5]"
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = new Date(viewYear + 1, viewMonth, 1);
                  setViewYear(next.getFullYear());
                  setViewMonth(next.getMonth());
                }}
                className="rounded p-1 text-[#8a8a8a] hover:bg-[#f5f5f5]"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-7 text-center text-[13px] text-[#777]">
              {weekLabels.map((item) => (
                <div key={item} className="py-1">{item}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-[14px]">
              {dayCells.map((item) => {
                const isSelected =
                  item.date.getFullYear() === selectedDay.getFullYear() &&
                  item.date.getMonth() === selectedDay.getMonth() &&
                  item.date.getDate() === selectedDay.getDate();
                return (
                  <button
                    key={`${item.date.toISOString()}-${item.inMonth ? 'm' : 'x'}`}
                    type="button"
                    onClick={() => setSelectedDay(item.date)}
                    className={`mx-auto h-8 w-8 rounded-full ${
                      isSelected ? 'bg-[#ee4d2d] text-white' : item.inMonth ? 'text-[#333] hover:bg-[#f5f5f5]' : 'text-[#c5c5c5]'
                    }`}
                  >
                    {item.date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex w-[170px] flex-col p-3">
            <div className="mb-2 text-[14px] text-[#666]">时间</div>
            <div className="flex flex-1 items-start gap-2">
              <div
                data-time-wheel="hour"
                className="flex flex-1 flex-col rounded-sm border border-[#ececec]"
              >
                <button
                  type="button"
                  onClick={() => setSelectedHour((prev) => (prev + 23) % 24)}
                  className="flex h-8 items-center justify-center border-b border-[#ececec] text-[#9b9b9b] hover:bg-[#f7f7f7]"
                >
                  <ChevronUp size={14} />
                </button>
                <div className="py-1">
                  {hourWheel.map((hour) => (
                    <button
                      key={`wheel-hour-${hour}`}
                      type="button"
                      onClick={() => setSelectedHour(hour)}
                      className={`flex h-7 w-full items-center justify-center text-[14px] ${
                        hour === selectedHour ? 'font-semibold text-[#ee4d2d]' : 'text-[#9b9b9b]'
                      }`}
                    >
                      {pad2(hour)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHour((prev) => (prev + 1) % 24)}
                  className="flex h-8 items-center justify-center border-t border-[#ececec] text-[#9b9b9b] hover:bg-[#f7f7f7]"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              <div
                data-time-wheel="minute"
                className="flex flex-1 flex-col rounded-sm border border-[#ececec]"
              >
                <button
                  type="button"
                  onClick={() => setSelectedMinute((prev) => (prev + 59) % 60)}
                  className="flex h-8 items-center justify-center border-b border-[#ececec] text-[#9b9b9b] hover:bg-[#f7f7f7]"
                >
                  <ChevronUp size={14} />
                </button>
                <div className="py-1">
                  {minuteWheel.map((minute) => (
                    <button
                      key={`wheel-minute-${minute}`}
                      type="button"
                      onClick={() => setSelectedMinute(minute)}
                      className={`flex h-7 w-full items-center justify-center text-[14px] ${
                        minute === selectedMinute ? 'font-semibold text-[#ee4d2d]' : 'text-[#9b9b9b]'
                      }`}
                    >
                      {pad2(minute)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMinute((prev) => (prev + 1) % 60)}
                  className="flex h-8 items-center justify-center border-t border-[#ececec] text-[#9b9b9b] hover:bg-[#f7f7f7]"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onChange(formatLocalDateTime(selectedDay, selectedHour, selectedMinute));
                setOpen(false);
              }}
              className="mt-3 h-8 rounded bg-[#ee4d2d] text-[13px] text-white hover:bg-[#d83f21]"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewProductView({ runId, editingListingId, onBackToProducts }: NewProductViewProps) {
  const [step, setStep] = useState<'initial' | 'detail'>('initial');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [category, setCategory] = useState('');
  const [gtin, setGtin] = useState('');
  const [description, setDescription] = useState('');
  const [imageFiles11, setImageFiles11] = useState<File[]>([]);
  const [coverIndex11, setCoverIndex11] = useState(0);
  const [previewUrls11, setPreviewUrls11] = useState<string[]>([]);
  const [enable34, setEnable34] = useState(false);
  const [imageFiles34, setImageFiles34] = useState<File[]>([]);
  const [coverIndex34, setCoverIndex34] = useState(0);
  const [previewUrls34, setPreviewUrls34] = useState<string[]>([]);
  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [sourceListingId, setSourceListingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [detailEnable34, setDetailEnable34] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'basic' | 'description' | 'sales' | 'shipping' | 'others'>('basic');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryKeyword, setCategoryKeyword] = useState('');
  const [pendingL1, setPendingL1] = useState('');
  const [pendingL2, setPendingL2] = useState('');
  const [pendingL3, setPendingL3] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [specTemplates, setSpecTemplates] = useState<SpecTemplateField[]>([]);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const [categoryTreeData, setCategoryTreeData] = useState<Record<string, Record<string, string[]>>>({});
  const [categoryPathIdMap, setCategoryPathIdMap] = useState<Record<string, number>>({});
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [enableVariations, setEnableVariations] = useState(false);
  const [variationGroups, setVariationGroups] = useState<VariationGroup[]>([createVariationGroup(0)]);
  const [variationDetails, setVariationDetails] = useState<Record<string, VariationDetailRow>>({});
  const [applyAllPrice, setApplyAllPrice] = useState('');
  const [applyAllStock, setApplyAllStock] = useState('');
  const [applyAllSku, setApplyAllSku] = useState('');
  const [minPurchaseQty, setMinPurchaseQty] = useState('1');
  const [maxPurchaseMode, setMaxPurchaseMode] = useState<'none' | 'per_order' | 'per_time_period'>('none');
  const [maxPurchasePerOrderQty, setMaxPurchasePerOrderQty] = useState('');
  const [maxPurchasePeriodStartDate, setMaxPurchasePeriodStartDate] = useState('');
  const [maxPurchasePeriodQty, setMaxPurchasePeriodQty] = useState('');
  const [maxPurchasePeriodDays, setMaxPurchasePeriodDays] = useState('');
  const [maxPurchasePeriodModel, setMaxPurchasePeriodModel] = useState<'single' | 'recurring'>('single');
  const [maxPurchasePeriodEndDate, setMaxPurchasePeriodEndDate] = useState('');
  const [maxPurchaseDropdownOpen, setMaxPurchaseDropdownOpen] = useState(false);
  const [showWholesaleTable, setShowWholesaleTable] = useState(false);
  const [wholesaleTiers, setWholesaleTiers] = useState<WholesaleTierRow[]>([{ id: buildWholesaleTierId(), minQty: '', maxQty: '', unitPrice: '' }]);
  const [weightKg, setWeightKg] = useState('');
  const [parcelLength, setParcelLength] = useState('');
  const [parcelWidth, setParcelWidth] = useState('');
  const [parcelHeight, setParcelHeight] = useState('');
  const [shippingVariationDimensionEnabled, setShippingVariationDimensionEnabled] = useState(false);
  const [shippingStandardBulk, setShippingStandardBulk] = useState(false);
  const [shippingStandard, setShippingStandard] = useState(false);
  const [shippingExpress, setShippingExpress] = useState(false);
  const [preorderEnabled, setPreorderEnabled] = useState(false);
  const [insuranceEnabled, setInsuranceEnabled] = useState(false);
  const [condition, setCondition] = useState('全新');
  const [schedulePublishTime, setSchedulePublishTime] = useState('');
  const [parentSku, setParentSku] = useState('');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  const [videoThumbUrl, setVideoThumbUrl] = useState('');
  const [videoPreviewOpen, setVideoPreviewOpen] = useState(false);
  const fileInputRef11 = useRef<HTMLInputElement>(null);
  const fileInputRef34 = useRef<HTMLInputElement>(null);
  const detailFileInputRef11 = useRef<HTMLInputElement>(null);
  const detailFileInputRef34 = useRef<HTMLInputElement>(null);
  const detailVideoInputRef = useRef<HTMLInputElement>(null);
  const basicSectionRef = useRef<HTMLDivElement>(null);
  const descriptionSectionRef = useRef<HTMLDivElement>(null);
  const salesSectionRef = useRef<HTMLDivElement>(null);
  const shippingSectionRef = useRef<HTMLDivElement>(null);
  const othersSectionRef = useRef<HTMLDivElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const maxPurchaseDropdownRef = useRef<HTMLDivElement>(null);
  const isEditingMode = Boolean(editingListingId);

  const hydrateEditListing = (listing: ListingEditDetail) => {
    setSourceListingId(listing.id);
    setPrice(String(Math.max(Number(listing.price || 0), 0)));
    setStock(String(Math.max(Number(listing.stock_available || 0), 0)));
    setMinPurchaseQty(String(Math.max(Number(listing.min_purchase_qty || 1), 1)));
    setMaxPurchaseMode(listing.max_purchase_mode ?? 'none');
    setMaxPurchasePerOrderQty(listing.max_purchase_qty ? String(listing.max_purchase_qty) : '');
    setMaxPurchasePeriodStartDate(listing.max_purchase_period_start_date ?? '');
    setMaxPurchasePeriodQty(listing.max_purchase_period_qty ? String(listing.max_purchase_period_qty) : '');
    setMaxPurchasePeriodDays(listing.max_purchase_period_days ? String(listing.max_purchase_period_days) : '');
    setMaxPurchasePeriodModel(listing.max_purchase_period_model === 'recurring' ? 'recurring' : 'single');
    setMaxPurchasePeriodEndDate(listing.max_purchase_period_end_date ?? '');
    setWeightKg(listing.weight_kg !== null && listing.weight_kg !== undefined ? String(listing.weight_kg) : '');
    setParcelLength(listing.parcel_length_cm !== null && listing.parcel_length_cm !== undefined ? String(listing.parcel_length_cm) : '');
    setParcelWidth(listing.parcel_width_cm !== null && listing.parcel_width_cm !== undefined ? String(listing.parcel_width_cm) : '');
    setParcelHeight(listing.parcel_height_cm !== null && listing.parcel_height_cm !== undefined ? String(listing.parcel_height_cm) : '');
    setShippingVariationDimensionEnabled(Boolean(listing.shipping_variation_dimension_enabled));
    setShippingStandardBulk(Boolean(listing.shipping_standard_bulk));
    setShippingStandard(Boolean(listing.shipping_standard));
    setShippingExpress(Boolean(listing.shipping_express));
    setPreorderEnabled(Boolean(listing.preorder_enabled));
    setInsuranceEnabled(Boolean(listing.insurance_enabled));
    setCondition((listing.condition_label || '').trim() || '全新');
    setSchedulePublishTime(toLocalDateTimeText(listing.schedule_publish_at));
    setParentSku(listing.parent_sku ?? '');

    if ((listing.wholesale_tiers ?? []).length > 0) {
      setShowWholesaleTable(true);
      setWholesaleTiers(
        listing.wholesale_tiers
          .slice()
          .sort((a, b) => a.tier_no - b.tier_no)
          .map((tier) => ({
            id: buildWholesaleTierId(),
            minQty: tier.min_qty !== null && tier.min_qty !== undefined ? String(tier.min_qty) : '',
            maxQty: tier.max_qty !== null && tier.max_qty !== undefined ? String(tier.max_qty) : '',
            unitPrice: tier.unit_price !== null && tier.unit_price !== undefined ? String(tier.unit_price) : '',
          })),
      );
    } else {
      setShowWholesaleTable(false);
      setWholesaleTiers([{ id: buildWholesaleTierId(), minQty: '', maxQty: '', unitPrice: '' }]);
    }

    const variants = (listing.variants ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    if (variants.length === 0) {
      setEnableVariations(false);
      setVariationGroups([createVariationGroup(0)]);
      setVariationDetails({});
      return;
    }

    const hasSecondLayer = variants.some((row) => row.option_value.includes('/'));
    const nameParts = (variants[0]?.variant_name || '').split('/').map((item) => item.trim()).filter(Boolean);
    const group1Label = nameParts[0] || '变体1';
    const group2Label = hasSecondLayer ? (nameParts[1] || '变体2') : '';
    const group1Id = buildVariationId();
    const group2Id = hasSecondLayer ? buildVariationId() : '';

    const optionMap1 = new Map<string, VariationOptionRow>();
    const optionMap2 = new Map<string, VariationOptionRow>();
    const optionIdMap1 = new Map<string, string>();
    const optionIdMap2 = new Map<string, string>();

    variants.forEach((row) => {
      const optionParts = row.option_value.split('/').map((item) => item.trim());
      const noteParts = (row.option_note || '').split('/').map((item) => item.trim());
      const firstValue = optionParts[0] || '';
      const secondValue = optionParts[1] || '';
      const firstNote = noteParts[0] || '';
      const secondNote = noteParts[1] || '';

      const key1 = `${firstValue}__${firstNote}`;
      if (!optionMap1.has(key1)) {
        const id = buildVariationId();
        optionMap1.set(key1, { id, value: firstValue, note: firstNote });
        optionIdMap1.set(key1, id);
      }
      if (hasSecondLayer) {
        const key2 = `${secondValue}__${secondNote}`;
        if (!optionMap2.has(key2)) {
          const id = buildVariationId();
          optionMap2.set(key2, { id, value: secondValue, note: secondNote });
          optionIdMap2.set(key2, id);
        }
      }
    });

    const group1: VariationGroup = {
      id: group1Id,
      name: '变体1',
      input: group1Label,
      options: Array.from(optionMap1.values()),
    };
    const groups: VariationGroup[] = [group1];
    if (hasSecondLayer) {
      groups.push({
        id: group2Id,
        name: '变体2',
        input: group2Label,
        options: Array.from(optionMap2.values()),
      });
    }
    setVariationGroups(normalizeVariationGroups(groups));

    const details: Record<string, VariationDetailRow> = {};
    variants.forEach((row) => {
      const optionParts = row.option_value.split('/').map((item) => item.trim());
      const noteParts = (row.option_note || '').split('/').map((item) => item.trim());
      const key1 = `${optionParts[0] || ''}__${noteParts[0] || ''}`;
      const id1 = optionIdMap1.get(key1);
      if (!id1) return;

      let rowId = `${group1Id}:${id1}`;
      if (hasSecondLayer) {
        const key2 = `${optionParts[1] || ''}__${noteParts[1] || ''}`;
        const id2 = optionIdMap2.get(key2);
        if (!id2) return;
        rowId = `${group1Id}:${id1}__${group2Id}:${id2}`;
      }

      details[rowId] = {
        ...buildDefaultVariationDetail(),
        sourceVariantId: row.id,
        price: String(Math.max(Number(row.price || 0), 0)),
        stock: String(Math.max(Number(row.stock || 0), 0)),
        sku: row.sku || '',
        gtin: row.gtin || '',
        itemWithoutGtin: Boolean(row.item_without_gtin),
        weightKg: row.weight_kg !== null && row.weight_kg !== undefined ? String(row.weight_kg) : '',
        parcelLengthCm: row.parcel_length_cm !== null && row.parcel_length_cm !== undefined ? String(row.parcel_length_cm) : '',
        parcelWidthCm: row.parcel_width_cm !== null && row.parcel_width_cm !== undefined ? String(row.parcel_width_cm) : '',
        parcelHeightCm: row.parcel_height_cm !== null && row.parcel_height_cm !== undefined ? String(row.parcel_height_cm) : '',
        imageFile: null,
        imagePreview: row.image_url ? resolveImageUrl(row.image_url) : '',
      };
    });

    setVariationDetails(details);
    setEnableVariations(true);
  };

  const canGoNext = title.trim().length >= 2 && imageFiles11.length > 0 && !submitting;
  const categoryTree = categoryTreeData;

  useEffect(() => {
    const urls = imageFiles11.map((f) => URL.createObjectURL(f));
    setPreviewUrls11(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [imageFiles11]);

  useEffect(() => {
    const urls = imageFiles34.map((f) => URL.createObjectURL(f));
    setPreviewUrls34(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [imageFiles34]);

  useEffect(() => {
    if ((draft?.image_count_34 ?? 0) > 0) {
      setDetailEnable34(true);
    }
  }, [draft?.image_count_34]);

  useEffect(() => {
    if (!draft?.video_url) {
      setVideoDurationSec(null);
      setVideoThumbUrl('');
      setVideoPreviewOpen(false);
    }
  }, [draft?.video_url]);

  useEffect(() => {
    if (!draft?.video_url) return;
    if (videoUploading) return;
    let cancelled = false;
    extractVideoMetaFromUrl(resolveImageUrl(draft.video_url))
      .then((meta) => {
        if (cancelled) return;
        setVideoDurationSec(meta.durationSec);
        setVideoThumbUrl(meta.thumbnailUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setVideoDurationSec(null);
        setVideoThumbUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [draft?.video_url, videoUploading]);

  useEffect(() => {
    if (!draft) return;
    setCategoryId(draft.category_id ?? null);
    if (!draft.specs || draft.specs.length === 0) return;
    setSpecValues((prev) => {
      const next = { ...prev };
      draft.specs.forEach((row) => {
        next[row.attr_key] = row.attr_value ?? '';
      });
      return next;
    });
  }, [draft]);

  useEffect(() => {
    if (!runId || step !== 'detail') return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    fetch(`${API_BASE_URL}/shopee/categories/tree`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((rows: CategoryNode[] | null) => {
        if (!rows) return;
        const nextTree: Record<string, Record<string, string[]>> = {};
        const pathIdMap: Record<string, number> = {};
        rows.forEach((l1) => {
          pathIdMap[l1.path] = l1.id;
          nextTree[l1.name] = {};
          (l1.children ?? []).forEach((l2) => {
            pathIdMap[l2.path] = l2.id;
            nextTree[l1.name][l2.name] = (l2.children ?? []).map((l3) => {
              pathIdMap[l3.path] = l3.id;
              return l3.name;
            });
          });
        });
        setCategoryTreeData(nextTree);
        setCategoryPathIdMap(pathIdMap);
        if (!categoryId && category.trim()) {
          setCategoryId(pathIdMap[category.trim()] ?? null);
        }
      })
      .catch(() => undefined);
  }, [category, categoryId, runId, step]);

  useEffect(() => {
    if (!runId || step !== 'detail') return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return;
    if (!categoryId) {
      setSpecTemplates([]);
      setSpecValues({});
      return;
    }
    fetch(`${API_BASE_URL}/shopee/spec-templates?category_id=${categoryId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { fields: SpecTemplateField[] } | null) => {
        const fields = data?.fields ?? [];
        setSpecTemplates(fields);
        setSpecValues((prev) => {
          const next: Record<string, string> = {};
          fields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(prev, field.attr_key)) {
              next[field.attr_key] = prev[field.attr_key];
            } else {
              next[field.attr_key] = '';
            }
          });
          return next;
        });
      })
      .catch(() => {
        setSpecTemplates([]);
      });
  }, [categoryId, runId, step]);

  useEffect(() => {
    if (!runId || !editingListingId || step !== 'initial') return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录态已失效，请重新登录');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    fetch(`${API_BASE_URL}/shopee/runs/${runId}/products/${editingListingId}/edit-draft`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.detail || '加载商品编辑数据失败');
        }
        return res.json() as Promise<EditBootstrapResponse>;
      })
      .then((payload) => {
        setDraft(payload.draft);
        setCategoryId(payload.draft.category_id ?? null);
        setTitle(payload.draft.title);
        setCategory(payload.draft.category ?? '');
        setGtin(payload.draft.gtin ?? '');
        setDescription(payload.draft.description ?? '');
        setDetailEnable34((payload.draft.image_count_34 ?? 0) > 0);
        hydrateEditListing(payload.listing);
        setStep('detail');
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : '加载商品编辑数据失败');
      })
      .finally(() => setSubmitting(false));
  }, [editingListingId, runId, step]);

  const onPickImages = (files: FileList | null, ratio: '1:1' | '3:4') => {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).filter((file) =>
      ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes((file.type || '').toLowerCase()),
    );
    if (selected.length === 0) {
      setError('仅支持 JPG/PNG/WEBP 图片');
      return;
    }

    setError('');
    const setter = ratio === '1:1' ? setImageFiles11 : setImageFiles34;
    const inputRef = ratio === '1:1' ? fileInputRef11 : fileInputRef34;
    setter((prev) => {
      const merged = [...prev, ...selected].slice(0, MAX_IMAGES);
      if (merged.length < prev.length + selected.length) {
        setError(`${ratio} 最多上传 ${MAX_IMAGES} 张图片`);
      }
      return merged;
    });
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const removeImage = (index: number, ratio: '1:1' | '3:4') => {
    const setFiles = ratio === '1:1' ? setImageFiles11 : setImageFiles34;
    const setCover = ratio === '1:1' ? setCoverIndex11 : setCoverIndex34;
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setCover((prev) => {
      if (index < prev) return prev - 1;
      if (index === prev) return 0;
      return prev;
    });
  };

  const imageCounterText11 = useMemo(() => `(${imageFiles11.length}/${MAX_IMAGES})`, [imageFiles11.length]);
  const imageCounterText34 = useMemo(() => `(${imageFiles34.length}/${MAX_IMAGES})`, [imageFiles34.length]);

  const createDraft = async () => {
    if (!runId) {
      setError('当前对局不存在，无法创建商品草稿');
      return;
    }
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录态已失效，请重新登录');
      return;
    }

    const formData = new FormData();
    formData.append('title', title.trim());
    if (category.trim()) {
      formData.append('category', category.trim());
    }
    if (categoryId) {
      formData.append('category_id', String(categoryId));
    }
    formData.append('gtin', gtin.trim());
    formData.append('description', description.trim());
    formData.append('cover_index', String(coverIndex11));
    imageFiles11.forEach((file) => formData.append('images', file));
    formData.append('cover_index_34', String(coverIndex34));
    if (enable34) {
      imageFiles34.forEach((file) => formData.append('images_34', file));
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/product-drafts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || '创建草稿失败');
      }
      const data: DraftDetail = await res.json();
      setDraft(data);
      setCategoryId(data.category_id ?? null);
      setTitle(data.title);
      setCategory(data.category ?? '');
      setGtin(data.gtin ?? '');
      setDescription(data.description ?? '');
      setStep('detail');
      setSuccess('草稿已保存，请继续完善商品信息。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建草稿失败');
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraftFields = async () => {
    if (!runId || !draft) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) throw new Error('登录态已失效，请重新登录');

    const res = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/product-drafts/${draft.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title.trim(),
        category_id: categoryId,
        category: category.trim() || null,
        gtin: gtin.trim(),
        description: description.trim(),
        spec_values: specValues,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || '保存草稿失败');
    }
    const data: DraftDetail = await res.json();
    setDraft(data);
  };

  const publishDraft = async (statusValue: 'live' | 'unpublished' | 'keep') => {
    if (!runId || !draft) {
      setError('草稿不存在，请重新创建');
      return;
    }

    setPublishing(true);
    setError('');
    setSuccess('');
    try {
      await saveDraftFields();
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) throw new Error('登录态已失效，请重新登录');

      const formData = new FormData();
      formData.append('status_value', statusValue);
      let publishPrice = Math.max(Number(price || '0') || 0, 0);
      let publishStock = Math.max(Number(stock || '0') || 0, 0);
      if (enableVariations && activeVariationRows.length > 0) {
        const prices = activeVariationRows
          .map((row) => Math.max(Number(variationDetails[row.id]?.price || '0') || 0, 0))
          .filter((num) => Number.isFinite(num));
        const stocks = activeVariationRows
          .map((row) => Math.max(Number(variationDetails[row.id]?.stock || '0') || 0, 0))
          .filter((num) => Number.isFinite(num));
        if (prices.length > 0) publishPrice = Math.min(...prices);
        if (stocks.length > 0) publishStock = stocks.reduce((sum, val) => sum + val, 0);
      }
      formData.append('price', String(publishPrice));
      formData.append('stock_available', String(publishStock));
      formData.append('min_purchase_qty', String(Math.max(Number(minPurchaseQty || '1') || 1, 1)));
      formData.append('max_purchase_mode', maxPurchaseMode);
      if (maxPurchaseMode === 'per_order') {
        const maxQty = Number(maxPurchasePerOrderQty);
        if (Number.isFinite(maxQty) && maxQty > 0) {
          formData.append('max_purchase_qty', String(maxQty));
        }
      }
      if (maxPurchaseMode === 'per_time_period') {
        if (maxPurchasePeriodStartDate) {
          formData.append('max_purchase_period_start_date', maxPurchasePeriodStartDate);
        }
        if (maxPurchasePeriodModel === 'recurring' && maxPurchasePeriodEndDate) {
          formData.append('max_purchase_period_end_date', maxPurchasePeriodEndDate);
        }
        const periodQty = Number(maxPurchasePeriodQty);
        if (Number.isFinite(periodQty) && periodQty > 0) {
          formData.append('max_purchase_period_qty', String(periodQty));
        }
        const periodDays = Number(maxPurchasePeriodDays);
        if (Number.isFinite(periodDays) && periodDays > 0) {
          formData.append('max_purchase_period_days', String(periodDays));
        }
        formData.append('max_purchase_period_model', maxPurchasePeriodModel);
      }
      if (showWholesaleTable) {
        const tiersPayload = wholesaleTiers
          .map((tier) => ({
            min_qty: tier.minQty.trim(),
            max_qty: tier.maxQty.trim(),
            unit_price: tier.unitPrice.trim(),
          }))
          .filter((tier) => tier.min_qty || tier.max_qty || tier.unit_price);
        if (tiersPayload.length > 0) {
          formData.append('wholesale_tiers_payload', JSON.stringify(tiersPayload));
        }
      }
      const weightVal = Number(weightKg);
      if (Number.isFinite(weightVal) && weightVal > 0) {
        formData.append('weight_kg', String(weightVal));
      }
      const lenVal = Number(parcelLength);
      if (Number.isFinite(lenVal) && lenVal > 0) {
        formData.append('parcel_length_cm', String(Math.floor(lenVal)));
      }
      const widthVal = Number(parcelWidth);
      if (Number.isFinite(widthVal) && widthVal > 0) {
        formData.append('parcel_width_cm', String(Math.floor(widthVal)));
      }
      const heightVal = Number(parcelHeight);
      if (Number.isFinite(heightVal) && heightVal > 0) {
        formData.append('parcel_height_cm', String(Math.floor(heightVal)));
      }
      formData.append('shipping_variation_dimension_enabled', String(shippingVariationDimensionEnabled));
      formData.append('shipping_standard_bulk', String(shippingStandardBulk));
      formData.append('shipping_standard', String(shippingStandard));
      formData.append('shipping_express', String(shippingExpress));
      formData.append('preorder_enabled', String(preorderEnabled));
      formData.append('insurance_enabled', String(insuranceEnabled));
      formData.append('condition_label', condition);
      if (schedulePublishTime) {
        formData.append('schedule_publish_at', schedulePublishTime);
      }
      if (parentSku.trim()) {
        formData.append('parent_sku', parentSku.trim());
      }
      if (sourceListingId) {
        formData.append('source_listing_id', String(sourceListingId));
      }
      if (enableVariations && activeVariationRows.length > 0) {
        const variantFiles: File[] = [];
        const payload = activeVariationRows.map((row) => {
          const detail = variationDetails[row.id];
          let imageFileIndex: number | null = null;
          if (detail?.imageFile) {
            imageFileIndex = variantFiles.length;
            variantFiles.push(detail.imageFile);
          }
          return {
            variant_name: row.variantName,
            option_value: row.optionValue,
            option_note: row.optionNote || null,
            source_variant_id: detail?.sourceVariantId ?? null,
            price: Math.max(Number(detail?.price || '0') || 0, 0),
            stock: Math.max(Number(detail?.stock || '0') || 0, 0),
            sku: (detail?.sku || '').trim() || null,
            gtin: (detail?.gtin || '').trim() || null,
            image_url: detail?.imageFile ? null : ((detail?.imagePreview || '').trim() || null),
            item_without_gtin: Boolean(detail?.itemWithoutGtin),
            weight_kg: Number.isFinite(Number(detail?.weightKg || '')) && Number(detail?.weightKg || '') > 0
              ? Number(detail?.weightKg || '')
              : null,
            parcel_length_cm: Number.isFinite(Number(detail?.parcelLengthCm || '')) && Number(detail?.parcelLengthCm || '') > 0
              ? Math.floor(Number(detail?.parcelLengthCm || ''))
              : null,
            parcel_width_cm: Number.isFinite(Number(detail?.parcelWidthCm || '')) && Number(detail?.parcelWidthCm || '') > 0
              ? Math.floor(Number(detail?.parcelWidthCm || ''))
              : null,
            parcel_height_cm: Number.isFinite(Number(detail?.parcelHeightCm || '')) && Number(detail?.parcelHeightCm || '') > 0
              ? Math.floor(Number(detail?.parcelHeightCm || ''))
              : null,
            image_file_index: imageFileIndex,
          };
        });
        formData.append('variations_payload', JSON.stringify(payload));
        variantFiles.forEach((file) => formData.append('variant_images', file));
      }

      const res = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/product-drafts/${draft.id}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || '发布商品失败');
      }

      if (statusValue === 'keep') {
        setSuccess('商品信息已更新，正在返回我的产品...');
      } else if (statusValue === 'live') {
        setSuccess('商品已保存并发布，正在返回我的产品...');
      } else {
        setSuccess('商品已保存为未发布，正在返回我的产品...');
      }
      setTimeout(() => onBackToProducts(), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : '发布商品失败');
    } finally {
      setPublishing(false);
    }
  };

  const appendDraftAssets = async (payload: { images11?: File[]; images34?: File[]; video?: File | null }) => {
    if (!runId || !draft) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录态已失效，请重新登录');
      return;
    }

    const hasNewImages11 = (payload.images11?.length ?? 0) > 0;
    const hasNewImages34 = (payload.images34?.length ?? 0) > 0;
    const hasVideo = !!payload.video;
    if (!hasNewImages11 && !hasNewImages34 && !hasVideo) return;

    const formData = new FormData();
    payload.images11?.forEach((file) => formData.append('images', file));
    payload.images34?.forEach((file) => formData.append('images_34', file));
    if (payload.video) {
      formData.append('video', payload.video);
    }

    setUploadingAssets(true);
    setError('');
    try {
      if (payload.video) {
        const meta = await extractVideoMetaFromFile(payload.video).catch(() => ({ durationSec: null, thumbnailUrl: '' }));
        setVideoDurationSec(meta.durationSec);
        setVideoThumbUrl(meta.thumbnailUrl);
        setVideoUploading(true);
        setVideoUploadProgress(0);
      }

      let data: DraftDetail;
      if (payload.video) {
        data = await new Promise<DraftDetail>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${API_BASE_URL}/shopee/runs/${runId}/product-drafts/${draft.id}/assets`);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            setVideoUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
          };
          xhr.onload = () => {
            try {
              const parsed = JSON.parse(xhr.responseText || '{}');
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(parsed as DraftDetail);
              } else {
                reject(new Error(parsed?.detail || '追加素材失败'));
              }
            } catch {
              reject(new Error('追加素材失败'));
            }
          };
          xhr.onerror = () => reject(new Error('网络异常，上传失败'));
          xhr.send(formData);
        });
      } else {
        const res = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/product-drafts/${draft.id}/assets`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.detail || '追加素材失败');
        }
        data = await res.json();
      }
      setDraft(data);
      setSuccess('素材已更新');
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加素材失败');
    } finally {
      setVideoUploading(false);
      setUploadingAssets(false);
    }
  };

  const scrollToDetailSection = (key: 'basic' | 'description' | 'sales' | 'shipping' | 'others') => {
    setActiveDetailTab(key);
    const sectionMap = {
      basic: basicSectionRef,
      description: descriptionSectionRef,
      sales: salesSectionRef,
      shipping: shippingSectionRef,
      others: othersSectionRef,
    };
    sectionMap[key].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (step !== 'detail') return;
    const container = detailScrollRef.current;
    if (!container) return;

    const sections: Array<{ key: 'basic' | 'description' | 'sales' | 'shipping' | 'others'; ref: { current: HTMLDivElement | null } }> = [
      { key: 'basic', ref: basicSectionRef },
      { key: 'description', ref: descriptionSectionRef },
      { key: 'sales', ref: salesSectionRef },
      { key: 'shipping', ref: shippingSectionRef },
      { key: 'others', ref: othersSectionRef },
    ];

    const updateActiveTab = () => {
      const containerTop = container.getBoundingClientRect().top;
      const anchor = containerTop + 140;
      let bestKey: 'basic' | 'description' | 'sales' | 'shipping' | 'others' = 'basic';
      let bestNegativeDistance = Number.POSITIVE_INFINITY;
      let bestPositiveDistance = Number.POSITIVE_INFINITY;

      for (const item of sections) {
        const el = item.ref.current;
        if (!el) continue;
        const delta = el.getBoundingClientRect().top - anchor;
        if (delta <= 0 && Math.abs(delta) < bestNegativeDistance) {
          bestNegativeDistance = Math.abs(delta);
          bestKey = item.key;
        } else if (delta > 0 && bestNegativeDistance === Number.POSITIVE_INFINITY && delta < bestPositiveDistance) {
          bestPositiveDistance = delta;
          bestKey = item.key;
        }
      }
      setActiveDetailTab((prev) => (prev === bestKey ? prev : bestKey));
    };

    updateActiveTab();
    container.addEventListener('scroll', updateActiveTab, { passive: true });
    window.addEventListener('resize', updateActiveTab);
    return () => {
      container.removeEventListener('scroll', updateActiveTab);
      window.removeEventListener('resize', updateActiveTab);
    };
  }, [step]);

  const removeDraftImage = async (imageId: number) => {
    if (!runId || !draft) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录态已失效，请重新登录');
      return;
    }
    setUploadingAssets(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/product-drafts/${draft.id}/images/${imageId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || '删除图片失败');
      }
      const data: DraftDetail = await res.json();
      setDraft(data);
      setSuccess('图片已删除');
      if (data.image_count_34 === 0) {
        setDetailEnable34(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除图片失败');
    } finally {
      setUploadingAssets(false);
    }
  };

  const removeDraftVideo = async () => {
    if (!runId || !draft) return;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      setError('登录态已失效，请重新登录');
      return;
    }
    setUploadingAssets(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/shopee/runs/${runId}/product-drafts/${draft.id}/video`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || '删除视频失败');
      }
      const data: DraftDetail = await res.json();
      setDraft(data);
      setVideoDurationSec(null);
      setVideoThumbUrl('');
      setSuccess('视频已删除');
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除视频失败');
    } finally {
      setUploadingAssets(false);
    }
  };

  const openCategoryModal = () => {
    const roots = Object.keys(categoryTree);
    if (roots.length === 0) {
      setError('类目数据加载中，请稍后重试');
      return;
    }
    const [l1, l2, l3] = category.split(' > ').map((item) => item.trim());
    const firstL1 = l1 && categoryTree[l1] ? l1 : roots[0];
    const l2List = Object.keys(categoryTree[firstL1] ?? {});
    const firstL2 = l2 && l2List.includes(l2) ? l2 : l2List[0];
    const l3List = categoryTree[firstL1]?.[firstL2] ?? [];
    const firstL3 = l3 && l3List.includes(l3) ? l3 : l3List[0];
    setPendingL1(firstL1);
    setPendingL2(firstL2);
    setPendingL3(firstL3);
    setCategoryKeyword('');
    setCategoryModalOpen(true);
  };

  const filteredL1 = Object.keys(categoryTree).filter((item) => item.includes(categoryKeyword.trim()));
  const activeL1 = filteredL1.includes(pendingL1) ? pendingL1 : filteredL1[0] ?? '';
  const l2List = Object.keys(categoryTree[activeL1] ?? {});
  const activeL2 = l2List.includes(pendingL2) ? pendingL2 : l2List[0] ?? '';
  const l3List = categoryTree[activeL1]?.[activeL2] ?? [];
  const activeL3 = l3List.includes(pendingL3) ? pendingL3 : l3List[0] ?? '';
  const pendingCategoryPath = [activeL1, activeL2, activeL3].filter(Boolean).join(' > ');
  const hasSelectedCategory = Boolean(categoryId);
  const activeVariationGroups = useMemo(
    () =>
      variationGroups
        .map((group) => ({
          ...group,
          activeOptions: group.options.filter((option) => option.value.trim()),
        }))
        .filter((group) => group.activeOptions.length > 0),
    [variationGroups]
  );

  const activeVariationRows = useMemo<VariationCombinationRow[]>(() => {
    if (activeVariationGroups.length === 0) return [];
    if (activeVariationGroups.length === 1) {
      const [group] = activeVariationGroups;
      return group.activeOptions.map((option) => ({
        id: `${group.id}:${option.id}`,
        variantName: group.input.trim() || group.name,
        optionValue: option.value.trim(),
        optionNote: option.note.trim(),
        displayValues: [option.value.trim()],
        primaryOptionId: option.id,
      }));
    }
    const [group1, group2] = activeVariationGroups;
    const rows: VariationCombinationRow[] = [];
    group1.activeOptions.forEach((first) => {
      group2.activeOptions.forEach((second) => {
        rows.push({
          id: `${group1.id}:${first.id}__${group2.id}:${second.id}`,
          variantName: `${group1.input.trim() || group1.name}/${group2.input.trim() || group2.name}`,
          optionValue: `${first.value.trim()} / ${second.value.trim()}`,
          optionNote: [first.note.trim(), second.note.trim()].filter(Boolean).join(' / '),
          displayValues: [first.value.trim(), second.value.trim()],
          primaryOptionId: first.id,
          secondaryOptionId: second.id,
        });
      });
    });
    return rows;
  }, [activeVariationGroups]);

  const groupedVariationRows = useMemo(() => {
    if (variationGroups.length < 2) return [];
    const groupMap = new Map<string, { key: string; value: string; rowIds: string[]; rows: VariationCombinationRow[] }>();
    activeVariationRows.forEach((row) => {
      const key = row.primaryOptionId;
      const value = row.displayValues[0] || '-';
      const existing = groupMap.get(key);
      if (existing) {
        existing.rows.push(row);
        existing.rowIds.push(row.id);
      } else {
        groupMap.set(key, { key, value, rowIds: [row.id], rows: [row] });
      }
    });
    return Array.from(groupMap.values());
  }, [activeVariationRows, variationGroups.length]);

  const maxPurchaseModeOptions: Array<{ value: 'none' | 'per_order' | 'per_time_period'; label: string; desc: string }> = [
    { value: 'none', label: '不限', desc: '不设置每位买家的最高购买数量。' },
    { value: 'per_order', label: '每单限制', desc: '限制每位买家在每笔订单中的购买数量。' },
    { value: 'per_time_period', label: '时间段限制', desc: '在指定时间周期内限制每位买家的累计购买数量。' },
  ];
  const maxPurchaseModeLabel = maxPurchaseModeOptions.find((item) => item.value === maxPurchaseMode)?.label ?? '不限';

  useEffect(() => {
    if (!maxPurchaseDropdownOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!maxPurchaseDropdownRef.current) return;
      if (event.target instanceof Node && !maxPurchaseDropdownRef.current.contains(event.target)) {
        setMaxPurchaseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [maxPurchaseDropdownOpen]);

  const canApplyAllToVariations =
    activeVariationRows.length > 0 && Boolean(applyAllPrice.trim() || applyAllStock.trim() || applyAllSku.trim());
  const variationTotalWeightKg = useMemo(() => {
    if (!enableVariations || !shippingVariationDimensionEnabled) return '';
    const total = activeVariationRows.reduce((sum, row) => {
      const raw = variationDetails[row.id]?.weightKg ?? '';
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0) return sum;
      return sum + num;
    }, 0);
    if (total <= 0) return '';
    return String(total);
  }, [activeVariationRows, enableVariations, shippingVariationDimensionEnabled, variationDetails]);

  const shippingFeeWeightBasis = shippingVariationDimensionEnabled ? variationTotalWeightKg : weightKg;
  const canToggleShippingChannels = Boolean(shippingFeeWeightBasis.trim());

  useEffect(() => {
    setVariationDetails((prev) => {
      const keepIds = new Set(activeVariationRows.map((row) => row.id));
      let changed = false;
      const next: Record<string, VariationDetailRow> = {};
      Object.entries(prev as Record<string, VariationDetailRow>).forEach(([key, value]) => {
        if (keepIds.has(key)) {
          next[key] = value;
        } else {
          if (value.imagePreview) URL.revokeObjectURL(value.imagePreview);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [activeVariationRows]);

  useEffect(() => {
    return () => {
      for (const row of Object.values(variationDetails as Record<string, VariationDetailRow>)) {
        if (row.imagePreview) URL.revokeObjectURL(row.imagePreview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (step === 'detail' && draft) {
    return (
      <div ref={detailScrollRef} className="flex-1 overflow-y-auto bg-[#f5f5f5] p-6 custom-scrollbar">
        <div className="mx-auto grid max-w-[1720px] grid-cols-[360px_minmax(0,1fr)] gap-5 pb-8">
          <div className="rounded-sm border border-[#dbe4f3] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <div className="h-14 border-b border-[#dbe4f3] bg-[#edf3ff] px-5 text-[16px] font-semibold leading-[56px] text-[#2d3a4f]">
              填写建议
            </div>
            <div className="space-y-3 px-5 py-4 text-[14px] text-[#5f6875]">
              <div>✓ 至少上传 3 张商品图</div>
              <div>✓ 补充商品视频</div>
              <div>✓ 商品名称控制在 25~100 字符</div>
              <div>✓ 描述至少 100 字或添加 1 张详情图</div>
              <div>✓ 完善品牌信息</div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="rounded-sm border border-gray-200 bg-white px-4 pt-0">
              <div className="sticky top-0 z-20 -mx-4 border-b border-gray-200 bg-white px-4 pt-3">
                <div className="flex items-center gap-8 text-[14px]">
                {[
                  { key: 'basic' as const, label: '基本信息' },
                  { key: 'description' as const, label: '商品描述' },
                  { key: 'sales' as const, label: '销售信息' },
                  { key: 'shipping' as const, label: '物流' },
                  { key: 'others' as const, label: '其他' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => scrollToDetailSection(tab.key)}
                    className={`pb-3 ${activeDetailTab === tab.key ? 'border-b-2 border-[#ee4d2d] text-[#ee4d2d]' : 'text-[#60656e]'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              </div>

              <div ref={basicSectionRef} className="mt-0 rounded-sm border border-gray-200 bg-white p-5">
                <h3 className="text-[20px] font-semibold text-[#222]">基本信息</h3>

                <div className="mt-5 space-y-4 text-[14px]">
                  <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                    <div className="pt-2 text-[#4a4f57]">
                      商品图片 <span className="text-[#ee4d2d]">*</span>
                    </div>
                    <div>
                      <div className="text-[#4a4f57]">1:1 图片</div>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {draft.images_11.map((img) => (
                          <div key={`draft-11-${img.sort_order}`} className="relative h-[100px] w-[100px] overflow-hidden rounded-sm border border-[#d5d5d5]">
                            <img src={resolveImageUrl(img.image_url)} alt="商品图" className="h-full w-full object-cover" />
                            {img.is_cover && (
                              <div className="absolute bottom-0 left-0 right-0 bg-[#6c7786] py-1 text-center text-[12px] text-white">封面</div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeDraftImage(img.id)}
                              className="absolute right-1 top-1 rounded bg-black/45 p-0.5 text-white hover:bg-black/60"
                              aria-label="删除图片"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                        {draft.images_11.length < MAX_IMAGES && (
                          <button
                            type="button"
                            onClick={() => detailFileInputRef11.current?.click()}
                            className="h-[100px] w-[100px] rounded-sm border border-dashed border-[#d5d5d5] text-[#ee4d2d] hover:bg-[#fff7f5]"
                          >
                            <div className="flex h-full flex-col items-center justify-center">
                              <ImagePlus size={18} />
                              <span className="mt-1 text-[12px] leading-none">添加图片</span>
                              <span className="mt-1 text-[12px] leading-none">({draft.image_count_11}/{MAX_IMAGES})</span>
                            </div>
                          </button>
                        )}
                      </div>
                      <input
                        ref={detailFileInputRef11}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []) as File[];
                          e.currentTarget.value = '';
                          appendDraftAssets({ images11: files });
                        }}
                      />

                      <div className="mt-3 rounded-sm bg-[#f6f6f6] px-4 py-3">
                        <label className="inline-flex items-center gap-2 text-[#6c717a]">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={detailEnable34}
                            onChange={(e) => setDetailEnable34(e.target.checked)}
                            style={{ accentColor: '#ee4d2d' }}
                          />
                          <span>3:4 图片</span>
                          <span>为时尚类商品补充 3:4 图片，可提升买家浏览效果。</span>
                        </label>
                        {detailEnable34 && (
                          <div className="mt-3 flex flex-wrap gap-3">
                            {draft.images_34.map((img) => (
                              <div key={`draft-34-${img.sort_order}`} className="relative h-[122px] w-[92px] overflow-hidden rounded-sm border border-[#d5d5d5]">
                                <img src={resolveImageUrl(img.image_url)} alt="3:4商品图" className="h-full w-full object-cover" />
                                {img.is_cover && (
                                  <div className="absolute bottom-0 left-0 right-0 bg-[#6c7786] py-1 text-center text-[12px] text-white">封面</div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeDraftImage(img.id)}
                                  className="absolute right-1 top-1 rounded bg-black/45 p-0.5 text-white hover:bg-black/60"
                                  aria-label="删除图片"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                            {draft.images_34.length < MAX_IMAGES && (
                              <button
                                type="button"
                                onClick={() => detailFileInputRef34.current?.click()}
                                className="h-[122px] w-[92px] rounded-sm border border-dashed border-[#ee4d2d] text-[#ee4d2d] hover:bg-[#fff7f5]"
                              >
                                <div className="flex h-full flex-col items-center justify-center">
                                  <ImagePlus size={18} />
                                  <span className="mt-1 text-[12px] leading-none">添加图片</span>
                                  <span className="mt-1 text-[12px] leading-none">({draft.image_count_34}/{MAX_IMAGES})</span>
                                </div>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <input
                        ref={detailFileInputRef34}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []) as File[];
                          e.currentTarget.value = '';
                          appendDraftAssets({ images34: files });
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                    <div className="pt-2 text-[#4a4f57]">商品视频</div>
                    <div className="rounded-sm border border-[#e8e8e8] bg-[#fafafa] p-3">
                      <div className="flex items-start gap-3">
                        {draft.video_url ? (
                          <div className="relative h-[72px] w-[72px] overflow-hidden rounded-sm border border-[#d9d9d9] bg-white">
                            {videoThumbUrl ? (
                              <img src={videoThumbUrl} alt="视频封面" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-[#eef2f7] text-[#8ca0b3]">
                                <Video size={16} />
                              </div>
                            )}
                            <div className="absolute bottom-6 left-0 right-0 bg-black/40 py-[1px] text-center text-[11px] text-white">
                              {formatVideoDuration(videoDurationSec)}
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 flex h-6 items-center justify-center gap-2 bg-[#69707a]/85 text-white">
                              <button type="button" onClick={() => setVideoPreviewOpen(true)} className="hover:text-[#ffd8cf]" title="预览">
                                <Eye size={13} />
                              </button>
                              <span className="h-3 w-px bg-white/40" />
                              <button type="button" onClick={removeDraftVideo} className="hover:text-[#ffd8cf]" title="删除">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => detailVideoInputRef.current?.click()}
                            className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-sm border border-dashed border-[#ee4d2d] text-[#ee4d2d] hover:bg-[#fff7f5]"
                          >
                            <Video size={18} />
                            <span className="mt-1 text-[12px] leading-none">添加视频</span>
                          </button>
                        )}
                        <div className="pt-1 text-[13px] leading-5 text-[#8a8a8a]">
                          <div>• 大小不超过 30MB，分辨率不小于 1x1。</div>
                          <div>• 时长 10-60 秒，格式 MP4。</div>
                          <div>• 视频处理完成后会在商品详情中展示。</div>
                          {!videoUploading && (
                            <button
                              type="button"
                              onClick={() => detailVideoInputRef.current?.click()}
                              className="mt-1 text-[12px] text-[#ee4d2d] hover:underline"
                            >
                              {draft.video_url ? '替换视频' : '点击上传视频'}
                            </button>
                          )}
                          {videoUploading && (
                            <div className="mt-2 w-[250px]">
                              <div className="mb-1 flex items-center justify-between text-[12px] text-[#666]">
                                <span>视频上传中</span>
                                <span>{videoUploadProgress}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded bg-[#e8e8e8]">
                                <div className="h-full bg-[#ee4d2d] transition-all" style={{ width: `${videoUploadProgress}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <input
                      ref={detailVideoInputRef}
                      type="file"
                      accept="video/mp4"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        e.currentTarget.value = '';
                        if (!file) return;
                        appendDraftAssets({ video: file });
                      }}
                    />
                  </div>

                  {videoPreviewOpen && draft.video_url && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4">
                      <div className="w-[760px] max-w-full rounded bg-white p-4 shadow-xl">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-[16px] font-semibold text-[#333]">视频预览</div>
                          <button type="button" onClick={() => setVideoPreviewOpen(false)} className="text-[#888] hover:text-[#555]">
                            <X size={16} />
                          </button>
                        </div>
                        <video src={resolveImageUrl(draft.video_url)} controls className="h-auto max-h-[70vh] w-full rounded bg-black" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                    <div className="text-[#4a4f57]">
                      商品名称 <span className="text-[#ee4d2d]">*</span>
                    </div>
                    <div className="flex items-center">
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-10 w-full rounded-l-sm border border-r-0 border-[#d9d9d9] px-3 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d]"
                      />
                      <div className="flex h-10 w-24 items-center justify-center rounded-r-sm border border-[#d9d9d9] bg-[#fafafa] text-[14px] text-[#999]">
                        {title.length}/120
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                    <div className="text-[#4a4f57]">
                      类目 <span className="text-[#ee4d2d]">*</span>
                    </div>
                    <button
                      type="button"
                      onClick={openCategoryModal}
                      className="relative h-10 w-full rounded-sm border border-[#d9d9d9] bg-white px-3 text-left text-[14px] text-[#555] hover:border-[#cfcfcf]"
                    >
                      <span className={category ? 'text-[#555]' : 'text-[#a8a8a8]'}>{category || '请选择类目'}</span>
                      <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a8a8a8]" />
                    </button>
                  </div>

                  <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                    <div className="text-[#4a4f57]">GTIN</div>
                    <input
                      value={gtin}
                      onChange={(e) => setGtin(e.target.value)}
                      className="h-10 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d]"
                      placeholder="请输入 GTIN"
                    />
                  </div>
                </div>
              </div>

              {specTemplates.length > 0 && (
                <div className="mt-4 rounded-sm border border-gray-200 bg-white p-5">
                  <div className="text-[20px] font-semibold text-[#222]">规格</div>
                  <div className="mt-2 text-[13px] text-[#8a8a8a]">根据类目自动生成，请尽量完善规格信息。</div>
                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[14px]">
                    {specTemplates.map((field, index) => (
                      <div key={field.attr_key} className="grid grid-cols-[140px_1fr] items-center gap-4">
                        <div className={`text-[#4a4f57] ${index % 2 === 1 ? 'pl-12' : ''}`}>
                          {field.attr_label}
                          {field.is_required && <span className="ml-0.5 text-[#ee4d2d]">*</span>}
                        </div>
                        {field.attr_key === 'expiry_date' ? (
                          <DateOnlyPicker
                            value={specValues[field.attr_key] ?? ''}
                            onChange={(next) =>
                              setSpecValues((prev) => ({
                                ...prev,
                                [field.attr_key]: next,
                              }))
                            }
                            placeholder="请选择到期日"
                          />
                        ) : field.input_type === 'select' ? (
                          <SearchSelect
                            value={specValues[field.attr_key] ?? ''}
                            options={field.options}
                            placeholder="请选择"
                            searchPlaceholder="请输入至少2个字符"
                            onChange={(next) =>
                              setSpecValues((prev) => ({
                                ...prev,
                                [field.attr_key]: next,
                              }))
                            }
                          />
                        ) : (
                          <input
                            value={specValues[field.attr_key] ?? ''}
                            onChange={(e) =>
                              setSpecValues((prev) => ({
                                ...prev,
                                [field.attr_key]: e.target.value,
                              }))
                            }
                            className="h-10 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d]"
                            placeholder="请输入"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div ref={descriptionSectionRef} className="mt-4 rounded-sm border border-gray-200 bg-white p-5">

                <h3 className="text-[20px] font-semibold text-[#222]">商品描述</h3>
                <div className="mt-4 grid grid-cols-[140px_1fr] items-start gap-4 text-[14px]">
                  <div className="pt-2 text-[#4a4f57]">
                    商品描述 <span className="text-[#ee4d2d]">*</span>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="h-[160px] w-full rounded-sm border border-[#d9d9d9] p-3 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d]"
                    placeholder="请输入商品描述"
                    maxLength={5000}
                  />
                </div>
              </div>

              <div ref={salesSectionRef} className={`mt-4 rounded-sm border border-gray-200 px-5 py-4 ${hasSelectedCategory ? 'bg-white' : 'bg-[#fafafa]'}`}>
                <h3 className={`text-[20px] font-semibold ${hasSelectedCategory ? 'text-[#222]' : 'text-[#6b6b6b]'}`}>销售信息</h3>
                {!hasSelectedCategory ? (
                  <div className="mt-2 text-[13px] text-[#9b9b9b]">选择商品类目后可用</div>
                ) : (
                  <div className="mt-4 space-y-4 text-[14px]">
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <div className="text-[#4a4f57]">变体</div>
                      {!enableVariations ? (
                        <button
                          type="button"
                          onClick={() => setEnableVariations(true)}
                          className="h-10 w-[150px] rounded-sm border border-dashed border-[#ee4d2d] text-[#ee4d2d] hover:bg-[#fff7f5]"
                        >
                          + 启用变体
                        </button>
                      ) : (
                        <div className="min-w-0 w-full rounded-sm bg-[#f7f7f7] p-4">
                          <div className="max-w-[980px] space-y-3">
                            {variationGroups.map((group, groupIndex) => (
                              <div key={group.id} className="rounded-sm bg-[#efefef] p-4">
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="text-[16px] text-[#444]">{group.name}</div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextGroups = normalizeVariationGroups(variationGroups.filter((_, i) => i !== groupIndex));
                                      if (nextGroups.length === 0) {
                                        setEnableVariations(false);
                                        setVariationGroups([createVariationGroup(0)]);
                                        return;
                                      }
                                      setVariationGroups(nextGroups);
                                    }}
                                    className="text-[20px] text-[#999] hover:text-[#666]"
                                  >
                                    ×
                                  </button>
                                </div>
                                <input
                                  value={group.input}
                                  onChange={(e) =>
                                    setVariationGroups((prev) =>
                                      prev.map((row, i) => (i === groupIndex ? { ...row, input: e.target.value } : row))
                                    )
                                  }
                                  className="h-10 w-[520px] rounded-sm border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none focus:border-[#ee4d2d]"
                                  placeholder={groupIndex === 0 ? '例如：颜色、尺寸' : '请输入变体名称'}
                                />
                                <div className="mt-3 text-[14px] text-[#4a4f57]">
                                  选项 <span className="text-[#ee4d2d]">*</span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  {group.options.map((item, idx) => (
                                    <div key={item.id} className="flex min-w-0 items-center gap-2">
                                      <input
                                        value={item.value}
                                        onChange={(e) =>
                                          setVariationGroups((prev) =>
                                            prev.map((row, i) =>
                                              i !== groupIndex
                                                ? row
                                                : {
                                                    ...row,
                                                    options: row.options.map((opt, optionIndex) =>
                                                      optionIndex === idx ? { ...opt, value: e.target.value } : opt
                                                    ),
                                                  }
                                            )
                                          )
                                        }
                                        className="h-10 min-w-0 flex-1 rounded-sm border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none focus:border-[#ee4d2d]"
                                        placeholder={groupIndex === 0 ? '例如：红色' : '请输入'}
                                      />
                                      <input
                                        value={item.note}
                                        onChange={(e) =>
                                          setVariationGroups((prev) =>
                                            prev.map((row, i) =>
                                              i !== groupIndex
                                                ? row
                                                : {
                                                    ...row,
                                                    options: row.options.map((opt, optionIndex) =>
                                                      optionIndex === idx ? { ...opt, note: e.target.value } : opt
                                                    ),
                                                  }
                                            )
                                          )
                                        }
                                        className="h-10 min-w-0 flex-1 rounded-sm border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none focus:border-[#ee4d2d]"
                                        placeholder="补充说明（可选）"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setVariationGroups((prev) =>
                                            prev.map((row, i) =>
                                              i !== groupIndex ? row : { ...row, options: [...row.options, { id: buildVariationId(), value: '', note: '' }] }
                                            )
                                          )
                                        }
                                        className="text-[20px] leading-none text-[#ee4d2d]"
                                      >
                                        +
                                      </button>
                                      {group.options.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setVariationGroups((prev) =>
                                              prev.map((row, i) =>
                                                i !== groupIndex ? row : { ...row, options: row.options.filter((_, optionIndex) => optionIndex !== idx) }
                                              )
                                            )
                                          }
                                          className="text-[16px] text-[#999]"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>

                          {variationGroups.length < 2 && (
                            <div className="mt-4 rounded-sm bg-white p-3">
                              <button
                                type="button"
                                onClick={() => setVariationGroups((prev) => normalizeVariationGroups([...prev, createVariationGroup(prev.length)]))}
                                className="h-9 rounded-sm border border-dashed border-[#ee4d2d] px-4 text-[14px] text-[#ee4d2d]"
                              >
                                + 添加变体2
                              </button>
                            </div>
                          )}

                          <div className="mt-4">
                            <div className="mb-2 text-[14px] text-[#4a4f57]">变体列表</div>
                            <div className="flex items-center gap-2">
                              <div className="flex h-9 w-[250px] items-center rounded-sm border border-[#d9d9d9] bg-white px-2">
                                <span className="w-6 text-center text-[#999]">RM</span>
                                <input value={applyAllPrice} onChange={(e) => setApplyAllPrice(e.target.value)} className="h-full flex-1 px-2 text-[14px] outline-none" placeholder="价格" />
                              </div>
                              <input value={applyAllStock} onChange={(e) => setApplyAllStock(e.target.value)} className="h-9 w-[260px] rounded-sm border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none" placeholder="库存" />
                              <input value={applyAllSku} onChange={(e) => setApplyAllSku(e.target.value)} className="h-9 w-[260px] rounded-sm border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none" placeholder="SKU" />
                              <button
                                type="button"
                                disabled={!canApplyAllToVariations}
                                onClick={() =>
                                  setVariationDetails((prev) => {
                                    const next = { ...prev };
                                    activeVariationRows.forEach((row) => {
                                      const existing = next[row.id] ?? {
                                        ...buildDefaultVariationDetail(),
                                      };
                                      next[row.id] = {
                                        ...existing,
                                        price: applyAllPrice || existing.price,
                                        stock: applyAllStock || existing.stock,
                                        sku: applyAllSku || existing.sku,
                                      };
                                    });
                                    return next;
                                  })
                                }
                                className={`h-9 rounded-sm px-4 text-[14px] text-white transition ${
                                  canApplyAllToVariations ? 'bg-[#ee4d2d] hover:bg-[#d94426] active:bg-[#c43a1f]' : 'bg-[#d9d9d9] cursor-not-allowed'
                                }`}
                              >
                                应用到全部
                              </button>
                            </div>
                            <div className="mt-3 w-full max-w-full overflow-x-auto rounded-sm border border-[#d9d9d9]">
                              <table
                                className="w-max min-w-full table-fixed border-collapse text-[14px] text-[#555]"
                                style={{
                                  minWidth: shippingVariationDimensionEnabled ? 1480 : variationGroups.length > 1 ? 1180 : 1080,
                                }}
                              >
                                <colgroup>
                                  {variationGroups.length > 1 ? (
                                    <>
                                      <col style={{ width: '96px' }} />
                                      <col style={{ width: '96px' }} />
                                      <col style={{ width: '150px' }} />
                                      <col style={{ width: '150px' }} />
                                      {shippingVariationDimensionEnabled && (
                                        <>
                                          <col style={{ width: '90px' }} />
                                          <col style={{ width: '268px' }} />
                                        </>
                                      )}
                                      <col style={{ width: '190px' }} />
                                      <col style={{ width: '190px' }} />
                                      <col style={{ width: '190px' }} />
                                    </>
                                  ) : (
                                    <>
                                      <col style={{ width: '110px' }} />
                                      <col style={{ width: '150px' }} />
                                      <col style={{ width: '150px' }} />
                                      {shippingVariationDimensionEnabled && (
                                        <>
                                          <col style={{ width: '90px' }} />
                                          <col style={{ width: '268px' }} />
                                        </>
                                      )}
                                      <col style={{ width: '190px' }} />
                                      <col style={{ width: '190px' }} />
                                      <col style={{ width: '190px' }} />
                                    </>
                                  )}
                                </colgroup>
                                <thead>
                                  <tr className="bg-[#f5f5f5] text-[#444]">
                                    <th className="sticky left-0 z-20 border border-[#e8e8e8] bg-[#f5f5f5] px-3 py-2 text-center font-normal">{variationGroups[0]?.name || '变体1'}</th>
                                    {variationGroups.length > 1 && (
                                      <th className="border border-[#e8e8e8] px-3 py-2 text-center font-normal">{variationGroups[1]?.name || '变体2'}</th>
                                    )}
                                    <th className="border border-[#e8e8e8] px-3 py-2 text-center font-normal">价格</th>
                                    <th className="border border-[#e8e8e8] px-3 py-2 text-center font-normal">库存</th>
                                    {shippingVariationDimensionEnabled && (
                                      <>
                                        <th className="border border-[#e8e8e8] px-3 py-2 text-center font-normal">重量</th>
                                        <th className="border border-[#e8e8e8] px-3 py-2 text-center font-normal">包裹尺寸</th>
                                      </>
                                    )}
                                    <th className="border border-[#e8e8e8] px-3 py-2 text-center font-normal">SKU</th>
                                    <th className="border border-[#e8e8e8] px-3 py-2 text-center font-normal">GTIN</th>
                                    <th className="border border-[#e8e8e8] px-3 py-2 text-center font-normal">无 GTIN 的商品</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {activeVariationRows.length === 0 ? (
                                    <tr>
                                      <td
                                        colSpan={
                                          (variationGroups.length > 1 ? 7 : 6) + (shippingVariationDimensionEnabled ? 2 : 0)
                                        }
                                        className="px-3 py-3 text-[13px] text-[#9b9b9b]"
                                      >
                                        请先填写至少一个变体选项
                                      </td>
                                    </tr>
                                  ) : variationGroups.length > 1 ? (
                                    groupedVariationRows.map((group) =>
                                      group.rows.map((row, rowIndex) => {
                                        const detail = variationDetails[row.id] ?? buildDefaultVariationDetail();
                                        const groupHeadDetail = variationDetails[group.rows[0].id] ?? detail;
                                        return (
                                          <tr key={`variant-row-${row.id}`} className="bg-white">
                                            {rowIndex === 0 && (
                                              <td rowSpan={group.rows.length} className="sticky left-0 z-10 border border-[#efefef] bg-white px-2 py-3 align-middle text-[#666] text-center">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                  <div>{group.value}</div>
                                                  <label className="inline-flex cursor-pointer flex-col items-center">
                                                  <input
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/webp"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                      const file = e.target.files?.[0] ?? null;
                                                      e.currentTarget.value = '';
                                                      if (!file) return;
                                                      if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes((file.type || '').toLowerCase())) {
                                                        setError('变体图片仅支持 JPG/PNG/WEBP');
                                                        return;
                                                      }
                                                      setVariationDetails((prev) => {
                                                        const next = { ...prev };
                                                        group.rowIds.forEach((rowId) => {
                                                          const oldPreview = next[rowId]?.imagePreview || '';
                                                          if (oldPreview) URL.revokeObjectURL(oldPreview);
                                                          next[rowId] = { ...(next[rowId] ?? detail), imageFile: file, imagePreview: URL.createObjectURL(file) };
                                                        });
                                                        return next;
                                                      });
                                                    }}
                                                  />
                                                  <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-dashed border-[#ee4d2d] text-[#ee4d2d] hover:bg-[#fff7f5]">
                                                    {groupHeadDetail.imagePreview ? <img src={groupHeadDetail.imagePreview} alt="变体图" className="h-full w-full rounded-sm object-cover" /> : <ImagePlus size={16} />}
                                                  </div>
                                                  </label>
                                                </div>
                                              </td>
                                            )}
                                            <td className="border border-[#efefef] px-2 py-3 align-middle text-center text-[#666]">{row.displayValues[1] || '-'}</td>
                                            <td className="border border-[#efefef] px-3 py-3">
                                              <div className="flex h-9 w-full items-center rounded-sm border border-[#d9d9d9] px-2">
                                                <span className="w-6 text-center text-[#999]">RM</span>
                                                <input
                                                  value={detail.price}
                                                  onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, price: e.target.value } }))}
                                                  className="h-full min-w-0 flex-1 px-2 text-[14px] outline-none"
                                                  placeholder="请输入"
                                                />
                                              </div>
                                            </td>
                                            <td className="border border-[#efefef] px-3 py-3">
                                              <input
                                                value={detail.stock}
                                                onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, stock: e.target.value } }))}
                                                className="h-9 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none"
                                              />
                                            </td>
                                            {shippingVariationDimensionEnabled && (
                                              <>
                                                <td className="border border-[#efefef] px-1 py-3">
                                                  <div className="flex h-8 w-full min-w-0 items-center rounded-sm border border-[#d9d9d9] bg-white">
                                                    <input
                                                      value={detail.weightKg}
                                                      onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, weightKg: e.target.value } }))}
                                                      className="h-full min-w-0 flex-1 px-1 text-[13px] outline-none"
                                                      placeholder="输入"
                                                    />
                                                    <span className="w-7 shrink-0 border-l border-[#ececec] text-center text-[12px] text-[#999]">kg</span>
                                                  </div>
                                                </td>
                                                <td className="border border-[#efefef] px-3 py-3">
                                                  <div className="flex h-9 w-full items-center rounded-sm border border-[#d9d9d9] bg-white">
                                                    <input
                                                      value={detail.parcelLengthCm}
                                                      onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, parcelLengthCm: e.target.value } }))}
                                                      className="h-full min-w-[54px] w-0 flex-1 px-2 text-[14px] outline-none"
                                                      placeholder="长"
                                                    />
                                                    <input
                                                      value={detail.parcelWidthCm}
                                                      onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, parcelWidthCm: e.target.value } }))}
                                                      className="h-full min-w-[54px] w-0 flex-1 border-l border-[#ececec] px-2 text-[14px] outline-none"
                                                      placeholder="宽"
                                                    />
                                                    <input
                                                      value={detail.parcelHeightCm}
                                                      onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, parcelHeightCm: e.target.value } }))}
                                                      className="h-full min-w-[54px] w-0 flex-1 border-l border-[#ececec] px-2 text-[14px] outline-none"
                                                      placeholder="高"
                                                    />
                                                    <span className="inline-flex h-full items-center border-l border-[#ececec] px-2 text-[#999]">cm</span>
                                                  </div>
                                                </td>
                                              </>
                                            )}
                                            <td className="border border-[#efefef] px-3 py-3">
                                              <input
                                                value={detail.sku}
                                                onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, sku: e.target.value } }))}
                                                className="h-9 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none"
                                                placeholder="请输入"
                                              />
                                            </td>
                                            <td className="border border-[#efefef] px-3 py-3">
                                              <input
                                                value={detail.gtin}
                                                onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, gtin: e.target.value } }))}
                                                disabled={detail.itemWithoutGtin}
                                                className="h-9 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none disabled:bg-[#f7f7f7]"
                                                placeholder="请输入"
                                              />
                                            </td>
                                            <td className="border border-[#efefef] px-3 py-3 align-middle">
                                              <label className="inline-flex items-center gap-2 text-[14px] text-[#555]">
                                                <input
                                                  type="checkbox"
                                                  checked={detail.itemWithoutGtin}
                                                  onChange={(e) =>
                                                    setVariationDetails((prev) => ({
                                                      ...prev,
                                                      [row.id]: { ...detail, itemWithoutGtin: e.target.checked, gtin: e.target.checked ? '' : detail.gtin },
                                                    }))
                                                  }
                                                  style={{ accentColor: '#ee4d2d' }}
                                                />
                                                无 GTIN 的商品
                                              </label>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )
                                  ) : (
                                    activeVariationRows.map((row) => {
                                      const detail = variationDetails[row.id] ?? buildDefaultVariationDetail();
                                      return (
                                        <tr key={`variant-row-${row.id}`} className="bg-white">
                                          <td className="sticky left-0 z-10 border border-[#efefef] bg-white px-2 py-3 align-middle text-center text-[#666]">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                              <div>{row.displayValues[0] || '-'}</div>
                                              <label className="inline-flex cursor-pointer flex-col items-center">
                                              <input
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0] ?? null;
                                                  e.currentTarget.value = '';
                                                  if (!file) return;
                                                  if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes((file.type || '').toLowerCase())) {
                                                    setError('变体图片仅支持 JPG/PNG/WEBP');
                                                    return;
                                                  }
                                                  setVariationDetails((prev) => {
                                                    const oldPreview = prev[row.id]?.imagePreview || '';
                                                    if (oldPreview) URL.revokeObjectURL(oldPreview);
                                                    return {
                                                      ...prev,
                                                      [row.id]: { ...detail, imageFile: file, imagePreview: URL.createObjectURL(file) },
                                                    };
                                                  });
                                                }}
                                              />
                                              <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-dashed border-[#ee4d2d] text-[#ee4d2d] hover:bg-[#fff7f5]">
                                                {detail.imagePreview ? <img src={detail.imagePreview} alt="变体图" className="h-full w-full rounded-sm object-cover" /> : <ImagePlus size={16} />}
                                              </div>
                                              </label>
                                            </div>
                                          </td>
                                          <td className="border border-[#efefef] px-3 py-3">
                                            <div className="flex h-9 w-full items-center rounded-sm border border-[#d9d9d9] px-2">
                                              <span className="w-6 text-center text-[#999]">RM</span>
                                              <input
                                                value={detail.price}
                                                onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, price: e.target.value } }))}
                                                className="h-full min-w-0 flex-1 px-2 text-[14px] outline-none"
                                                placeholder="请输入"
                                              />
                                            </div>
                                          </td>
                                          <td className="border border-[#efefef] px-3 py-3">
                                            <input
                                              value={detail.stock}
                                              onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, stock: e.target.value } }))}
                                              className="h-9 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none"
                                            />
                                          </td>
                                          {shippingVariationDimensionEnabled && (
                                            <>
                                              <td className="border border-[#efefef] px-1 py-3">
                                                <div className="flex h-8 w-full min-w-0 items-center rounded-sm border border-[#d9d9d9] bg-white">
                                                  <input
                                                    value={detail.weightKg}
                                                    onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, weightKg: e.target.value } }))}
                                                    className="h-full min-w-0 flex-1 px-1 text-[13px] outline-none"
                                                    placeholder="输入"
                                                  />
                                                  <span className="w-7 shrink-0 border-l border-[#ececec] text-center text-[12px] text-[#999]">kg</span>
                                                </div>
                                              </td>
                                              <td className="border border-[#efefef] px-3 py-3">
                                                <div className="flex h-9 w-full items-center rounded-sm border border-[#d9d9d9] bg-white">
                                                  <input
                                                    value={detail.parcelLengthCm}
                                                    onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, parcelLengthCm: e.target.value } }))}
                                                    className="h-full min-w-[54px] w-0 flex-1 px-2 text-[14px] outline-none"
                                                    placeholder="长"
                                                  />
                                                  <input
                                                    value={detail.parcelWidthCm}
                                                    onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, parcelWidthCm: e.target.value } }))}
                                                    className="h-full min-w-[54px] w-0 flex-1 border-l border-[#ececec] px-2 text-[14px] outline-none"
                                                    placeholder="宽"
                                                  />
                                                  <input
                                                    value={detail.parcelHeightCm}
                                                    onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, parcelHeightCm: e.target.value } }))}
                                                    className="h-full min-w-[54px] w-0 flex-1 border-l border-[#ececec] px-2 text-[14px] outline-none"
                                                    placeholder="高"
                                                  />
                                                  <span className="inline-flex h-full items-center border-l border-[#ececec] px-2 text-[#999]">cm</span>
                                                </div>
                                              </td>
                                            </>
                                          )}
                                          <td className="border border-[#efefef] px-3 py-3">
                                            <input
                                              value={detail.sku}
                                              onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, sku: e.target.value } }))}
                                              className="h-9 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none"
                                              placeholder="请输入"
                                            />
                                          </td>
                                          <td className="border border-[#efefef] px-3 py-3">
                                            <input
                                              value={detail.gtin}
                                              onChange={(e) => setVariationDetails((prev) => ({ ...prev, [row.id]: { ...detail, gtin: e.target.value } }))}
                                              disabled={detail.itemWithoutGtin}
                                              className="h-9 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none disabled:bg-[#f7f7f7]"
                                              placeholder="请输入"
                                            />
                                          </td>
                                          <td className="border border-[#efefef] px-3 py-3 align-middle">
                                            <label className="inline-flex items-center gap-2 text-[14px] text-[#555]">
                                              <input
                                                type="checkbox"
                                                checked={detail.itemWithoutGtin}
                                                onChange={(e) =>
                                                  setVariationDetails((prev) => ({
                                                    ...prev,
                                                    [row.id]: { ...detail, itemWithoutGtin: e.target.checked, gtin: e.target.checked ? '' : detail.gtin },
                                                  }))
                                                }
                                                style={{ accentColor: '#ee4d2d' }}
                                              />
                                              无 GTIN 的商品
                                            </label>
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {!enableVariations && (
                      <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                        <div className="text-[#4a4f57]">价格 <span className="text-[#ee4d2d]">*</span></div>
                        <div className="flex h-10 w-[420px] items-center rounded-sm border border-[#d9d9d9]">
                          <span className="w-10 text-center text-[#999]">RM</span>
                          <input value={price} onChange={(e) => setPrice(e.target.value)} className="h-full flex-1 border-l border-[#ececec] px-3 text-[14px] outline-none focus:border-[#ee4d2d]" placeholder="请输入售价" />
                        </div>
                      </div>
                    )}
                    {!enableVariations && (
                      <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                        <div className="text-[#4a4f57]">库存 <span className="text-[#ee4d2d]">*</span></div>
                        <input value={stock} onChange={(e) => setStock(e.target.value)} className="h-10 w-[420px] rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none focus:border-[#ee4d2d]" />
                      </div>
                    )}
                    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                      <div className="pt-2 text-[#4a4f57]">最低购买数量 <span className="text-[#ee4d2d]">*</span></div>
                      <div>
                        <input value={minPurchaseQty} onChange={(e) => setMinPurchaseQty(e.target.value)} className="h-10 w-[600px] rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none focus:border-[#ee4d2d]" />
                        <div className="mt-1 text-[12px] leading-5 text-[#9b9b9b]">买家每次下单的最小购买件数。若库存小于最低购买数量，买家将无法下单。</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                      <div className="pt-2 text-[#4a4f57]">
                        最高购买数量 <HelpCircle size={13} className="inline text-[#b5b5b5]" />
                      </div>
                      <div>
                        <div ref={maxPurchaseDropdownRef} className="relative w-[600px]">
                          <button
                            type="button"
                            onClick={() => setMaxPurchaseDropdownOpen((prev) => !prev)}
                            className={`flex h-10 w-full items-center justify-between rounded-sm border bg-white px-3 text-left text-[14px] outline-none ${
                              maxPurchaseDropdownOpen ? 'border-[#ee4d2d]' : 'border-[#d9d9d9]'
                            }`}
                          >
                            <span>{maxPurchaseModeLabel}</span>
                            <ChevronDown size={14} className={`text-[#a8a8a8] transition ${maxPurchaseDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {maxPurchaseDropdownOpen && (
                            <div className="absolute left-0 right-0 top-[42px] z-30 rounded-sm border border-[#d9d9d9] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                              {maxPurchaseModeOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    setMaxPurchaseMode(option.value);
                                    setMaxPurchaseDropdownOpen(false);
                                  }}
                                  className="block w-full px-4 py-2 text-left hover:bg-[#fafafa]"
                                >
                                  <div className={`text-[14px] leading-6 ${maxPurchaseMode === option.value ? 'text-[#ee4d2d]' : 'text-[#333]'}`}>{option.label}</div>
                                  <div className="mt-0.5 text-[12px] text-[#999]">{option.desc}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {maxPurchaseMode === 'per_order' && (
                          <div className="mt-3 w-[600px] rounded-sm bg-[#f7f7f7] px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px] text-[#4a4f57]">
                                <span className="text-[#ee4d2d]">*</span> 数量
                              </span>
                              <input
                                value={maxPurchasePerOrderQty}
                                onChange={(e) => setMaxPurchasePerOrderQty(e.target.value)}
                                className="h-9 flex-1 rounded-sm border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none focus:border-[#ee4d2d]"
                                placeholder="请输入"
                              />
                            </div>
                          </div>
                        )}

                        {maxPurchaseMode === 'per_time_period' && (
                          <div className="mt-3 w-[600px] rounded-sm bg-[#f7f7f7] px-4 py-3">
                            <div className="mb-3 flex items-center gap-2">
                              <span className="w-[90px] text-[14px] text-[#4a4f57]">
                                <span className="text-[#ee4d2d]">*</span> 开始日期
                              </span>
                              <input
                                type="date"
                                value={maxPurchasePeriodStartDate}
                                onChange={(e) => setMaxPurchasePeriodStartDate(e.target.value)}
                                className="h-9 w-[240px] rounded-sm border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none focus:border-[#ee4d2d]"
                              />
                            </div>
                            <div className="mb-3 flex items-center gap-2">
                              <span className="w-[130px] whitespace-nowrap text-[14px] leading-5 text-[#4a4f57]">
                                <span className="text-[#ee4d2d]">*</span> 最高购买数量
                              </span>
                              <div className="flex h-9 items-center rounded-sm border border-[#d9d9d9] bg-white">
                                <input
                                  value={maxPurchasePeriodQty}
                                  onChange={(e) => setMaxPurchasePeriodQty(e.target.value)}
                                  className="h-full w-[120px] px-3 text-[14px] outline-none"
                                  placeholder="quantity"
                                />
                                <span className="border-l border-[#ececec] px-3 text-[#999]">for</span>
                                <input
                                  value={maxPurchasePeriodDays}
                                  onChange={(e) => setMaxPurchasePeriodDays(e.target.value)}
                                  className="h-full w-[100px] border-l border-[#ececec] px-3 text-[14px] outline-none"
                                  placeholder="days"
                                />
                              </div>
                            </div>
                            <div className="mb-3 flex items-center gap-4">
                              <span className="text-[14px] text-[#4a4f57]">周期模式</span>
                              <label className="inline-flex items-center gap-2 text-[14px] text-[#555]">
                                <input
                                  type="radio"
                                  checked={maxPurchasePeriodModel === 'single'}
                                  onChange={() => setMaxPurchasePeriodModel('single')}
                                  style={{ accentColor: '#ee4d2d' }}
                                />
                                Single Period
                              </label>
                              <label className="inline-flex items-center gap-2 text-[14px] text-[#555]">
                                <input
                                  type="radio"
                                  checked={maxPurchasePeriodModel === 'recurring'}
                                  onChange={() => setMaxPurchasePeriodModel('recurring')}
                                  style={{ accentColor: '#ee4d2d' }}
                                />
                                Recurring
                              </label>
                            </div>
                            {maxPurchasePeriodModel === 'recurring' && (
                              <div className="mb-3 flex items-center gap-2">
                                <span className="w-[90px] text-[14px] text-[#4a4f57]">
                                  <span className="text-[#ee4d2d]">*</span> 结束日期
                                </span>
                                <input
                                  type="date"
                                  value={maxPurchasePeriodEndDate}
                                  onChange={(e) => setMaxPurchasePeriodEndDate(e.target.value)}
                                  className="h-9 w-[240px] rounded-sm border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none focus:border-[#ee4d2d]"
                                />
                              </div>
                            )}
                            <div className="text-[12px] leading-5 text-[#9b9b9b]">
                              {maxPurchasePeriodModel === 'single'
                                ? `限购将于 ${formatDateLabel(maxPurchasePeriodStartDate)} 00:00 开始，每位买家每 ${maxPurchasePeriodDays || '-'} 天可购买 ${maxPurchasePeriodQty || '-'} 件。`
                                : `限购将于 ${formatDateLabel(maxPurchasePeriodStartDate)} 00:00 开始，每位买家每 ${maxPurchasePeriodDays || '-'} 天可购买 ${maxPurchasePeriodQty || '-'} 件，结束于 ${formatDateLabel(maxPurchasePeriodEndDate)} 23:59。`}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                      <div className="pt-2 text-[#4a4f57]">批发价</div>
                      <div>
                        {!showWholesaleTable ? (
                          <button
                            type="button"
                            onClick={() => setShowWholesaleTable(true)}
                            className="h-10 w-[150px] rounded-sm border border-dashed border-[#ee4d2d] text-[#ee4d2d] hover:bg-[#fff7f5]"
                          >
                            + 添加价格阶梯
                          </button>
                        ) : (
                          <div className="overflow-hidden rounded-sm border border-[#d9d9d9] bg-white">
                            <table className="w-full border-collapse text-[14px] text-[#555]">
                              <thead>
                                <tr className="bg-[#f5f5f5] text-[#444]">
                                  <th className="w-[110px] border border-[#e8e8e8] px-3 py-2 text-center font-normal">编号</th>
                                  <th className="w-[220px] border border-[#e8e8e8] px-3 py-2 text-center font-normal">最小购买量</th>
                                  <th className="w-[220px] border border-[#e8e8e8] px-3 py-2 text-center font-normal">最大购买量</th>
                                  <th className="w-[220px] border border-[#e8e8e8] px-3 py-2 text-center font-normal">单价</th>
                                  <th className="w-[80px] border border-[#e8e8e8] px-3 py-2 text-center font-normal">操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {wholesaleTiers.map((tier, index) => (
                                  <tr key={tier.id}>
                                    <td className="border border-[#efefef] px-3 py-3 text-center">价格阶梯 {index + 1}</td>
                                    <td className="border border-[#efefef] px-3 py-3">
                                      <input
                                        value={tier.minQty}
                                        onChange={(e) => setWholesaleTiers((prev) => prev.map((row) => (row.id === tier.id ? { ...row, minQty: e.target.value } : row)))}
                                        className="h-9 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none"
                                        placeholder="最小值"
                                      />
                                    </td>
                                    <td className="border border-[#efefef] px-3 py-3">
                                      <input
                                        value={tier.maxQty}
                                        onChange={(e) => setWholesaleTiers((prev) => prev.map((row) => (row.id === tier.id ? { ...row, maxQty: e.target.value } : row)))}
                                        className="h-9 w-full rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none"
                                        placeholder="最大值"
                                      />
                                    </td>
                                    <td className="border border-[#efefef] px-3 py-3">
                                      <div className="flex h-9 items-center rounded-sm border border-[#d9d9d9]">
                                        <span className="w-8 text-center text-[#999]">RMB</span>
                                        <input
                                          value={tier.unitPrice}
                                          onChange={(e) => setWholesaleTiers((prev) => prev.map((row) => (row.id === tier.id ? { ...row, unitPrice: e.target.value } : row)))}
                                          className="h-full flex-1 border-l border-[#ececec] px-3 text-[14px] outline-none"
                                          placeholder="单价"
                                        />
                                      </div>
                                    </td>
                                    <td className="border border-[#efefef] px-3 py-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setWholesaleTiers((prev) => {
                                            const next = prev.filter((row) => row.id !== tier.id);
                                            if (next.length === 0) {
                                              setShowWholesaleTable(false);
                                              return [{ id: buildWholesaleTierId(), minQty: '', maxQty: '', unitPrice: '' }];
                                            }
                                            return next;
                                          });
                                        }}
                                        className="text-[#8f8f8f] hover:text-[#555]"
                                      >
                                        删除
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                <tr>
                                  <td className="border border-[#efefef] px-3 py-3 text-center">价格阶梯 {wholesaleTiers.length + 1}</td>
                                  <td colSpan={4} className="border border-[#efefef] px-3 py-3">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setWholesaleTiers((prev) => [...prev, { id: buildWholesaleTierId(), minQty: '', maxQty: '', unitPrice: '' }])
                                      }
                                      className="h-9 rounded-sm border border-dashed border-[#ee4d2d] px-4 text-[#ee4d2d] hover:bg-[#fff7f5]"
                                    >
                                      + 添加价格阶梯
                                    </button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="mt-1 text-[12px] text-[#9b9b9b]">
                          若商品参加加购优惠或组合优惠，批发价将被隐藏。
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div ref={shippingSectionRef} className={`mt-3 rounded-sm border border-gray-200 px-5 py-4 ${hasSelectedCategory ? 'bg-white' : 'bg-[#fafafa]'}`}>
                <h3 className={`text-[20px] font-semibold ${hasSelectedCategory ? 'text-[#222]' : 'text-[#6b6b6b]'}`}>物流</h3>
                {!hasSelectedCategory ? (
                  <div className="mt-2 text-[13px] text-[#9b9b9b]">选择商品类目后可用</div>
                ) : (
                  <div className="mt-4 space-y-4 text-[14px]">
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <div className="text-[#4a4f57] leading-5">变体使用不同重量/尺寸</div>
                      <button
                        type="button"
                        onClick={() => setShippingVariationDimensionEnabled((prev) => !prev)}
                        className={`relative h-6 w-12 rounded-full transition ${shippingVariationDimensionEnabled ? 'bg-[#4dc36f]' : 'bg-[#bdbdbd]'}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${shippingVariationDimensionEnabled ? 'left-6' : 'left-0.5'}`} />
                      </button>
                    </div>

                    {!shippingVariationDimensionEnabled && (
                      <>
                        <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                          <div className="pt-2 text-[#4a4f57]">重量 <span className="text-[#ee4d2d]">*</span></div>
                          <div>
                            <div className="flex h-10 w-[220px] items-center rounded-sm border border-[#d9d9d9] bg-white">
                              <input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} className="h-full flex-1 px-3 text-[14px] outline-none" placeholder="请输入" />
                              <span className="w-10 border-l border-[#ececec] text-center text-[#999]">kg</span>
                            </div>
                            {!weightKg.trim() && <div className="mt-1 text-[12px] text-[#ee4d2d]">该字段不能为空</div>}
                          </div>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                          <div className="text-[#4a4f57]">包裹尺寸</div>
                          <div className="flex items-center gap-2">
                            <div className="relative h-10 w-[180px] rounded-sm border border-[#d9d9d9] bg-white">
                              <input value={parcelLength} onChange={(e) => setParcelLength(e.target.value)} className="h-full w-full pr-11 pl-3 text-[14px] outline-none" placeholder="长（整数）" />
                              <span className="pointer-events-none absolute right-0 top-0 flex h-full w-10 items-center justify-center border-l border-[#ececec] text-[#999]">cm</span>
                            </div>
                            <span className="text-[#bbb]">×</span>
                            <div className="relative h-10 w-[180px] rounded-sm border border-[#d9d9d9] bg-white">
                              <input value={parcelWidth} onChange={(e) => setParcelWidth(e.target.value)} className="h-full w-full pr-11 pl-3 text-[14px] outline-none" placeholder="宽（整数）" />
                              <span className="pointer-events-none absolute right-0 top-0 flex h-full w-10 items-center justify-center border-l border-[#ececec] text-[#999]">cm</span>
                            </div>
                            <span className="text-[#bbb]">×</span>
                            <div className="relative h-10 w-[180px] rounded-sm border border-[#d9d9d9] bg-white">
                              <input value={parcelHeight} onChange={(e) => setParcelHeight(e.target.value)} className="h-full w-full pr-11 pl-3 text-[14px] outline-none" placeholder="高（整数）" />
                              <span className="pointer-events-none absolute right-0 top-0 flex h-full w-10 items-center justify-center border-l border-[#ececec] text-[#999]">cm</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                      <div className="pt-2 text-[#4a4f57]">运费</div>
                      <div>
                        <div className="mb-2 text-[13px] text-[#ee4d2d]">商品至少需要启用一种物流方式，否则无法保存。</div>
                        {shippingVariationDimensionEnabled && (
                          <div className="mb-2 text-[12px] text-[#8a8a8a]">
                            运费按变体总重量计算：{shippingFeeWeightBasis ? `${shippingFeeWeightBasis} kg` : '未填写'}
                          </div>
                        )}
                        <div className="overflow-hidden rounded-sm border border-[#e6e6e6] bg-white">
                          <div className="bg-[#f6f6f6] px-4 py-3 text-[14px] font-semibold text-[#444]">标准</div>
                          {[
                            { label: '标准配送（大件）', code: 'standard_bulk' as const, value: shippingStandardBulk, set: setShippingStandardBulk },
                            { label: '标准配送（国内）', code: 'standard' as const, value: shippingStandard, set: setShippingStandard },
                          ].map((item) => (
                            <div key={item.label} className="flex items-center justify-between border-t border-[#f0f0f0] px-4 py-3">
                              <div className="flex items-center gap-3 text-[#444]">
                                <span>{item.label}</span>
                                <span className="rounded-sm border border-[#ffb7a8] px-2 py-0.5 text-[12px] text-[#ee4d2d]">平台支持</span>
                              </div>
                              <div className="flex items-center gap-4">
                                {(() => {
                                  const feeInfo = getShippingFeeByWeight(item.code, shippingFeeWeightBasis);
                                  return feeInfo.fee === null ? (
                                    <span className="text-[#999]">需重量</span>
                                  ) : (
                                      <span className="text-[#444]" title={`当前命中区间：${feeInfo.rangeLabel}`}>
                                      RMB {feeInfo.fee}
                                    </span>
                                  );
                                })()}
                                <button
                                  type="button"
                                  disabled={!canToggleShippingChannels}
                                  title={canToggleShippingChannels ? '' : shippingVariationDimensionEnabled ? '请先在变体列表填写重量（将按总重量计算）' : '请先填写重量后再启用物流方式'}
                                  onClick={() => item.set((prev) => !prev)}
                                  className={`relative h-6 w-12 rounded-full transition ${
                                    item.value ? 'bg-[#ee4d2d]' : 'bg-[#d9d9d9]'
                                  } ${canToggleShippingChannels ? '' : 'cursor-not-allowed opacity-70'}`}
                                >
                                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${item.value ? 'left-6' : 'left-0.5'}`} />
                                </button>
                              </div>
                            </div>
                          ))}

                          <div className="border-t border-[#ececec] bg-[#f6f6f6] px-4 py-3 text-[14px] font-semibold text-[#444]">快速</div>
                          <div className="flex items-center justify-between border-t border-[#f0f0f0] px-4 py-3">
                            <div className="flex items-center gap-3 text-[#444]">
                              <span>快速配送</span>
                              <span className="rounded-sm border border-[#ffb7a8] px-2 py-0.5 text-[12px] text-[#ee4d2d]">平台支持</span>
                            </div>
                            <div className="flex items-center gap-4">
                              {(() => {
                                const feeInfo = getShippingFeeByWeight('express', shippingFeeWeightBasis);
                                return feeInfo.fee === null ? (
                                  <span className="text-[#999]">需重量</span>
                                ) : (
                                  <span className="text-[#444]" title={`当前命中区间：${feeInfo.rangeLabel}`}>
                                    RMB {feeInfo.fee}
                                  </span>
                                );
                              })()}
                              <button
                                type="button"
                                disabled={!canToggleShippingChannels}
                                title={canToggleShippingChannels ? '' : shippingVariationDimensionEnabled ? '请先在变体列表填写重量（将按总重量计算）' : '请先填写重量后再启用物流方式'}
                                onClick={() => setShippingExpress((prev) => !prev)}
                                className={`relative h-6 w-12 rounded-full transition ${
                                  shippingExpress ? 'bg-[#ee4d2d]' : 'bg-[#d9d9d9]'
                                } ${canToggleShippingChannels ? '' : 'cursor-not-allowed opacity-70'}`}
                              >
                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${shippingExpress ? 'left-6' : 'left-0.5'}`} />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-[12px] leading-6 text-[#9b9b9b]">
                          物流设置仅应用于当前商品。展示的运费为基础费率，实际费用可能因地区和时段变化。
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                      <div className="pt-2 text-[#4a4f57]">预售</div>
                      <div>
                        <div className="flex items-center gap-6 text-[14px]">
                          <label className="inline-flex items-center gap-2 text-[#555]">
                            <input type="radio" checked={!preorderEnabled} onChange={() => setPreorderEnabled(false)} style={{ accentColor: '#ee4d2d' }} />
                            否
                          </label>
                          <label className="inline-flex items-center gap-2 text-[#555]">
                            <input type="radio" checked={preorderEnabled} onChange={() => setPreorderEnabled(true)} style={{ accentColor: '#ee4d2d' }} />
                            是
                          </label>
                        </div>
                        <div className="mt-2 text-[12px] text-[#9b9b9b]">默认在 2 个工作日内发货（不含公共假期与停运日）。</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-[140px_1fr] items-start gap-4">
                      <div className="pt-2 text-[#4a4f57]">配送保障服务</div>
                      <div className="rounded-sm border border-[#e6e6e6] px-4 py-3 bg-white">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[#444]">运费险</div>
                            <div className="mt-1 text-[12px] text-[#9b9b9b]">在运输过程中商品丢失或损坏时提供保障。</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setInsuranceEnabled((prev) => !prev)}
                            className={`relative h-6 w-12 rounded-full transition ${insuranceEnabled ? 'bg-[#ee4d2d]' : 'bg-[#bdbdbd]'}`}
                          >
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${insuranceEnabled ? 'left-6' : 'left-0.5'}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div ref={othersSectionRef} className={`mt-3 rounded-sm border border-gray-200 px-5 py-4 ${hasSelectedCategory ? 'bg-white' : 'bg-[#fafafa]'}`}>
                <h3 className={`text-[20px] font-semibold ${hasSelectedCategory ? 'text-[#222]' : 'text-[#6b6b6b]'}`}>其他</h3>
                {!hasSelectedCategory ? (
                  <div className="mt-2 text-[13px] text-[#9b9b9b]">选择商品类目后可用</div>
                ) : (
                  <div className="mt-4 space-y-4 text-[14px]">
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <div className="text-[#4a4f57]">商品状况</div>
                      <PlainSelect value={condition} onChange={setCondition} options={['全新', '二手-近新', '二手-良好']} />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <div className="inline-flex items-center gap-1 text-[#4a4f57]">
                        定时上架
                        <HelpCircle size={14} className="text-[#a0a0a0]" />
                      </div>
                      <DateTimePicker value={schedulePublishTime} onChange={setSchedulePublishTime} />
                    </div>
                    <div className="grid grid-cols-[140px_1fr] items-center gap-4">
                      <div className="text-[#4a4f57]">父 SKU</div>
                      <input value={parentSku} onChange={(e) => setParentSku(e.target.value)} className="h-10 w-[420px] rounded-sm border border-[#d9d9d9] px-3 text-[14px] outline-none focus:border-[#ee4d2d]" placeholder="-" />
                    </div>
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 z-20 mt-0 flex items-center justify-end gap-3 border border-[#e7e7e7] bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
                <button
                  type="button"
                  onClick={onBackToProducts}
                  className="h-9 rounded border border-[#d5d5d5] px-8 text-[14px] text-[#555] hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={publishing || uploadingAssets}
                  onClick={() => publishDraft('unpublished')}
                  className={`h-9 rounded border px-8 text-[14px] ${publishing || uploadingAssets ? 'cursor-not-allowed border-[#ebebeb] bg-[#f5f5f5] text-[#bcbcbc]' : 'border-[#d5d5d5] text-[#666] hover:bg-[#f7f7f7]'}`}
                >
                  {isEditingMode ? '下架' : '保存并下架'}
                </button>
                <button
                  type="button"
                  disabled={publishing || uploadingAssets}
                  onClick={() => publishDraft(isEditingMode ? 'keep' : 'live')}
                  className={`h-9 rounded px-8 text-[14px] text-white ${publishing || uploadingAssets ? 'cursor-not-allowed bg-[#f9b4a8]' : 'bg-[#ee4d2d] hover:bg-[#d73211]'}`}
                >
                  {publishing ? (isEditingMode ? '更新中...' : '保存中...') : (isEditingMode ? '更新' : '保存并发布')}
                </button>
              </div>
            </div>

            {uploadingAssets && <div className="text-[13px] text-[#3478f6]">素材上传中...</div>}
            {error && <div className="text-[13px] text-[#ee4d2d]">{error}</div>}
            {success && <div className="text-[13px] text-[#16a34a]">{success}</div>}
          </div>
        </div>

        {categoryModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35">
            <div className="w-[840px] rounded-sm bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div className="text-[30px] font-semibold text-[#333]">选择类目</div>
                <button type="button" onClick={() => setCategoryModalOpen(false)} className="text-[24px] text-[#999] hover:text-[#666]">
                  ×
                </button>
              </div>

              <div className="px-5 py-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="relative w-[320px]">
                    <input
                      value={categoryKeyword}
                      onChange={(e) => setCategoryKeyword(e.target.value)}
                      className="h-9 w-full rounded border border-[#d9d9d9] pl-3 pr-9 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d]"
                      placeholder="请输入类目关键词"
                    />
                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a8a8a8]" />
                  </div>
                  <div className="text-[13px] text-[#8a8a8a]">仅展示选品阶段可选类目</div>
                </div>

                <div className="grid min-h-[240px] grid-cols-3 overflow-hidden rounded border border-[#ececec]">
                  <div className="border-r border-[#ececec] bg-[#fafafa] p-3">
                    {filteredL1.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setPendingL1(item);
                          const nextL2 = Object.keys(categoryTree[item] ?? {})[0] ?? '';
                          const nextL3 = (categoryTree[item]?.[nextL2] ?? [])[0] ?? '';
                          setPendingL2(nextL2);
                          setPendingL3(nextL3);
                        }}
                        className={`mb-2 block w-full rounded px-3 py-2 text-left text-[14px] ${
                          activeL1 === item ? 'bg-[#fff1ec] text-[#ee4d2d]' : 'text-[#555] hover:bg-[#f3f3f3]'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                    {filteredL1.length === 0 && <div className="px-3 py-2 text-[13px] text-[#9a9a9a]">没有匹配类目</div>}
                  </div>
                  <div className="border-r border-[#ececec] p-3">
                    {l2List.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setPendingL2(item);
                          const nextL3 = (categoryTree[activeL1]?.[item] ?? [])[0] ?? '';
                          setPendingL3(nextL3);
                        }}
                        className={`mb-2 block w-full rounded px-3 py-2 text-left text-[14px] ${
                          activeL2 === item ? 'bg-[#fff1ec] text-[#ee4d2d]' : 'text-[#555] hover:bg-[#f3f3f3]'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <div className="p-3">
                    {l3List.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPendingL3(item)}
                        className={`mb-2 block w-full rounded px-3 py-2 text-left text-[14px] ${
                          activeL3 === item ? 'bg-[#fff1ec] text-[#ee4d2d]' : 'text-[#555] hover:bg-[#f3f3f3]'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4">
                <div className="text-[13px] text-[#8a8a8a]">当前选择：{pendingCategoryPath || '未选择'}</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCategoryModalOpen(false)}
                    className="h-9 rounded border border-[#d5d5d5] px-6 text-[14px] text-[#555] hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!pendingCategoryPath}
                    onClick={() => {
                      setCategory(pendingCategoryPath);
                      setCategoryId(categoryPathIdMap[pendingCategoryPath] ?? null);
                      setCategoryModalOpen(false);
                    }}
                    className={`h-9 rounded px-6 text-[14px] text-white ${
                      pendingCategoryPath ? 'bg-[#ee4d2d] hover:bg-[#d73211]' : 'cursor-not-allowed bg-[#f9b4a8]'
                    }`}
                  >
                    确认
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (editingListingId && step === 'initial') {
    return (
      <div className="flex-1 bg-[#f5f5f5] p-6 pb-8 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[1600px] rounded-sm border border-[#e5e5e5] bg-white p-10 text-center">
          <div className="text-[16px] font-semibold text-[#333]">正在加载商品信息...</div>
          <div className="mt-2 text-[13px] text-[#999]">将直接进入可编辑的商品详情页</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#f5f5f5] p-6 overflow-y-auto custom-scrollbar">
      <div className="mx-auto grid max-w-[1720px] grid-cols-[1fr_380px] gap-5">
        <div className="space-y-4">
          <div className="rounded-sm border border-gray-200 bg-white p-6">
            <h2 className="text-[20px] font-semibold leading-none text-[#222]">{isEditingMode ? '产品详情' : '添加新商品'}</h2>
            <p className="mt-3 text-[16px] text-[#777]">
              输入商品名称或图片后，Shopee 将智能匹配最合适的 Shopee 标准商品，并自动为你填充上架信息
            </p>
            <div className="mt-5 border-b border-gray-200" />

            <div className="mt-6">
              <div className="text-[15px] font-semibold text-[#333]">商品图片</div>
              <div className="mt-4 text-[14px] text-[#666]">
                <span className="text-[#ee4d2d]">*</span> 1:1 图片
              </div>

              <div className="mt-3 flex flex-wrap gap-3">
                {imageFiles11.map((file, index) => (
                  <button
                    key={`${file.name}-${file.size}-${index}`}
                    type="button"
                    onClick={() => setCoverIndex11(index)}
                    className={`relative h-[100px] w-[100px] overflow-hidden rounded-sm border ${
                      index === coverIndex11 ? 'border-[#387ef5]' : 'border-[#d5d5d5]'
                    }`}
                    title="点击设为封面"
                  >
                    <img src={previewUrls11[index]} alt={`预览图${index + 1}`} className="h-full w-full object-cover" />
                    {index === coverIndex11 && (
                      <div className="absolute bottom-0 left-0 right-0 bg-[#6c7786] py-1 text-center text-[12px] text-white">
                        封面
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(index, '1:1');
                      }}
                      className="absolute right-1 top-1 rounded bg-black/45 p-0.5 text-white hover:bg-black/60"
                      aria-label="删除图片"
                    >
                      <X size={12} />
                    </button>
                  </button>
                ))}

                {imageFiles11.length < MAX_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef11.current?.click()}
                    className="h-[100px] w-[100px] rounded-sm border border-dashed border-[#d5d5d5] text-[#ee4d2d] hover:bg-[#fff7f5]"
                  >
                    <div className="flex h-full flex-col items-center justify-center">
                      <ImagePlus size={20} />
                      <span className="mt-1 text-[14px] leading-none">添加图片</span>
                      <span className="mt-1 text-[14px] leading-none">{imageCounterText11}</span>
                    </div>
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef11}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => onPickImages(e.target.files, '1:1')}
              />
            </div>

            <div className="mt-6 flex h-12 items-center gap-3 rounded-sm border border-[#f0f0f0] bg-[#f6f6f6] px-4 text-[14px] text-[#888]">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={enable34}
                onChange={(e) => setEnable34(e.target.checked)}
                style={{ accentColor: '#ee4d2d' }}
              />
              <span>3:4 图片</span>
              <span>为时尚类商品补充 3:4 图片，可提升买家浏览效果。</span>
            </div>

            {enable34 && (
              <div className="mt-3 rounded-sm border border-[#f0f0f0] bg-[#f6f6f6] p-4">
                <div className="text-[14px] text-[#666]">
                  <span className="text-[#ee4d2d]">*</span> 3:4 图片
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  {imageFiles34.map((file, index) => (
                    <button
                      key={`34-${file.name}-${file.size}-${index}`}
                      type="button"
                      onClick={() => setCoverIndex34(index)}
                      className={`relative h-[122px] w-[92px] overflow-hidden rounded-sm border ${
                        index === coverIndex34 ? 'border-[#387ef5]' : 'border-[#d5d5d5]'
                      }`}
                      title="点击设为封面"
                    >
                      <img src={previewUrls34[index]} alt={`3:4 预览图${index + 1}`} className="h-full w-full object-cover" />
                      {index === coverIndex34 && (
                        <div className="absolute bottom-0 left-0 right-0 bg-[#6c7786] py-1 text-center text-[12px] text-white">
                          封面
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(index, '3:4');
                        }}
                        className="absolute right-1 top-1 rounded bg-black/45 p-0.5 text-white hover:bg-black/60"
                        aria-label="删除图片"
                      >
                        <X size={12} />
                      </button>
                    </button>
                  ))}

                  {imageFiles34.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef34.current?.click()}
                      className="h-[122px] w-[92px] rounded-sm border border-dashed border-[#d5d5d5] text-[#ee4d2d] hover:bg-[#fff7f5]"
                    >
                      <div className="flex h-full flex-col items-center justify-center">
                        <ImagePlus size={18} />
                        <span className="mt-1 text-[14px] leading-none">添加图片</span>
                        <span className="mt-1 text-[14px] leading-none">{imageCounterText34}</span>
                      </div>
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef34}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => onPickImages(e.target.files, '3:4')}
                />
              </div>
            )}

            <div className="mt-6">
              <div className="text-[15px] font-semibold text-[#333]">
                <span className="text-[#ee4d2d]">*</span> 商品名称
              </div>
              <div className="mt-3 flex items-center">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 w-full rounded-l-sm border border-r-0 border-[#d9d9d9] px-3 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d]"
                  placeholder="品牌名 + 商品类型 + 核心卖点（材质、颜色、尺寸、型号）"
                />
                <div className="flex h-10 w-20 items-center justify-center rounded-r-sm border border-[#d9d9d9] bg-[#fafafa] text-[14px] text-[#999]">
                  {title.length}/120
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[15px] font-semibold text-[#333]">商品编码</div>
              <div className="mt-3 flex items-center">
                <button
                  type="button"
                  className="inline-flex h-10 w-[122px] items-center justify-between rounded-l-sm border border-r-0 border-[#d9d9d9] bg-white px-3 text-[14px] text-[#555]"
                >
                  GTIN
                </button>
                <input
                  value={gtin}
                  onChange={(e) => setGtin(e.target.value)}
                  className="h-10 flex-1 rounded-r-sm border border-[#d9d9d9] px-3 text-[14px] text-[#555] outline-none focus:border-[#ee4d2d]"
                  placeholder="输入通用商品编码（如 UPC/EAN）以匹配标准商品"
                />
              </div>
            </div>
            {error && <div className="mt-4 text-[13px] text-[#ee4d2d]">{error}</div>}
            {success && <div className="mt-4 text-[13px] text-[#16a34a]">{success}</div>}
          </div>

          <div className="flex items-center justify-end gap-3 rounded-sm border border-gray-200 bg-white px-6 py-4">
            <button
              type="button"
              onClick={onBackToProducts}
              className="h-9 rounded border border-[#d5d5d5] px-8 text-[14px] text-[#555] hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={createDraft}
              className={`h-9 rounded px-8 text-[14px] text-white ${
                canGoNext ? 'bg-[#ee4d2d] hover:bg-[#d73211]' : 'cursor-not-allowed bg-[#f9b4a8]'
              }`}
            >
              {submitting ? '提交中...' : '下一步'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-sm border border-[#f1dfdc] bg-white">
            <div className="flex h-14 items-center gap-2 border-b border-[#f1dfdc] bg-[#fff6f4] px-4 text-[16px] font-semibold text-[#333]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#ee4d2d] text-[12px] text-white">
                📣
              </span>
              Shopee 标准商品
              <HelpCircle size={14} className="text-[#9f9f9f]" />
            </div>
            <div className="p-4">
              <div className="flex h-10 items-center justify-between rounded border border-[#ee4d2d] bg-white px-3">
                <span className="text-[14px] text-[#b5b5b5]">可通过关键词或图片搜索</span>
                <div className="flex items-center gap-3 text-[#ee4d2d]">
                  <ImageIcon size={15} />
                  <Search size={15} />
                </div>
              </div>
              <p className="mt-4 text-[14px] leading-5 text-[#666]">
                Shopee 标准商品提供平台整理的标准化信息。关联后可获得以下收益：
              </p>
              <div className="mt-3 space-y-2 text-[14px] text-[#ee4d2d]">
                <div>• 自动填充商品信息</div>
                <div>• 冷启动更快，提升上架效率</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
