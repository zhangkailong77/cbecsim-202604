import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type WheelEvent } from 'react';

interface DateTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputWidthClassName?: string;
  popupPlacement?: 'top' | 'bottom';
  minValue?: string;
  maxValue?: string;
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

export default function DateTimePicker({
  value,
  onChange,
  placeholder = '请选择日期时间',
  inputWidthClassName = 'w-[420px]',
  popupPlacement = 'top',
  minValue,
  maxValue,
}: DateTimePickerProps) {
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
  const minDateTime = parseLocalDateTime(minValue);
  const maxDateTime = parseLocalDateTime(maxValue);
  const minDayStart = minDateTime ? new Date(minDateTime.getFullYear(), minDateTime.getMonth(), minDateTime.getDate(), 0, 0, 0, 0) : null;
  const maxDayStart = maxDateTime ? new Date(maxDateTime.getFullYear(), maxDateTime.getMonth(), maxDateTime.getDate(), 0, 0, 0, 0) : null;
  const candidateDateTime = new Date(
    selectedDay.getFullYear(),
    selectedDay.getMonth(),
    selectedDay.getDate(),
    selectedHour,
    selectedMinute,
    0,
    0,
  );
  const confirmDisabled =
    (minDateTime !== null && candidateDateTime.getTime() < minDateTime.getTime()) ||
    (maxDateTime !== null && candidateDateTime.getTime() > maxDateTime.getTime());

  const handlePanelWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest('[data-time-wheel="hour"]')) {
      if (event.deltaY > 0) {
        setSelectedHour((prev) => (prev + 1) % 24);
      } else if (event.deltaY < 0) {
        setSelectedHour((prev) => (prev + 23) % 24);
      }
      return;
    }
    if (target.closest('[data-time-wheel="minute"]')) {
      if (event.deltaY > 0) {
        setSelectedMinute((prev) => (prev + 1) % 60);
      } else if (event.deltaY < 0) {
        setSelectedMinute((prev) => (prev + 59) % 60);
      }
    }
  };

  const popupPositionClass = popupPlacement === 'bottom' ? 'top-[44px]' : 'bottom-[44px]';

  return (
    <div ref={rootRef} className={`relative ${inputWidthClassName}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex h-10 w-full items-center rounded-sm border bg-white px-3 text-left text-[14px] ${
          open ? 'border-[#ee4d2d]' : 'border-[#d9d9d9]'
        }`}
      >
        <Calendar size={14} className="text-[#a8a8a8]" />
        <span className={`ml-2 flex-1 ${value ? 'text-[#555]' : 'text-[#b0b0b0]'}`}>{value ? formatDisplayDateTime(value) : placeholder}</span>
      </button>

      {open && (
        <div
          className={`absolute left-0 z-40 flex w-[530px] overflow-hidden rounded-sm border border-[#d9d9d9] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] ${popupPositionClass}`}
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
                const dayStart = new Date(item.date.getFullYear(), item.date.getMonth(), item.date.getDate(), 0, 0, 0, 0);
                const dayDisabled =
                  (minDayStart !== null && dayStart.getTime() < minDayStart.getTime()) ||
                  (maxDayStart !== null && dayStart.getTime() > maxDayStart.getTime());
                return (
                  <button
                    key={`${item.date.toISOString()}-${item.inMonth ? 'm' : 'x'}`}
                    type="button"
                    onClick={() => {
                      if (!dayDisabled) setSelectedDay(item.date);
                    }}
                    disabled={dayDisabled}
                    className={`mx-auto h-8 w-8 rounded-full ${
                      dayDisabled
                        ? 'cursor-not-allowed text-[#e0e0e0]'
                        : isSelected
                          ? 'bg-[#ee4d2d] text-white'
                          : item.inMonth
                            ? 'text-[#333] hover:bg-[#f5f5f5]'
                            : 'text-[#c5c5c5]'
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
              <div data-time-wheel="hour" className="flex flex-1 flex-col rounded-sm border border-[#ececec]">
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
              <div data-time-wheel="minute" className="flex flex-1 flex-col rounded-sm border border-[#ececec]">
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
                if (confirmDisabled) return;
                onChange(formatLocalDateTime(selectedDay, selectedHour, selectedMinute));
                setOpen(false);
              }}
              disabled={confirmDisabled}
              className="mt-3 h-8 rounded bg-[#ee4d2d] text-[13px] text-white hover:bg-[#d83f21] disabled:cursor-not-allowed disabled:bg-[#f3a899]"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
