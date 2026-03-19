import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Search, ChevronDown, Download, ListFilter } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

type FlowDirection = 'all' | 'in' | 'out';

interface FinanceOverview {
  wallet_balance: number;
  total_income: number;
  today_income: number;
  transaction_count: number;
}

interface TransactionRow {
  id: number;
  order_id: number | null;
  order_no: string | null;
  buyer_name: string | null;
  entry_type: string;
  direction: 'in' | 'out';
  amount: number;
  balance_after: number;
  status: string;
  remark: string | null;
  credited_at: string;
}

interface TransactionsResponse {
  page: number;
  page_size: number;
  total: number;
  rows: TransactionRow[];
}

interface MyBalanceViewProps {
  runId: number | null;
  onOpenBankAccounts?: () => void;
}

interface BankAccountRow {
  id: number;
  bank_name: string;
  account_holder: string;
  account_no_masked: string;
  currency: string;
  is_default: boolean;
  verify_status: string;
  created_at: string;
}

interface BankAccountsResponse {
  total: number;
  rows: BankAccountRow[];
}

interface WithdrawResponse {
  wallet_balance: number;
  withdraw_rm: number;
  credited_rmb: number;
  exchange_rate: number;
  ledger_id: number;
  cash_adjustment_id: number;
  credited_at: string;
}

function formatMoney(amount: number) {
  return `RM ${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function mapEntryType(entryType: string) {
  if (entryType === 'income_from_order') return '订单回款';
  if (entryType === 'adjustment') return '调整';
  if (entryType === 'withdrawal') return '提现';
  return entryType || '-';
}

function mapFlow(direction: string) {
  return direction === 'in' ? '收入' : '支出';
}

function mapStatus(status: string) {
  if (status === 'completed') return '已完成';
  if (status === 'pending') return '处理中';
  if (status === 'voided') return '已作废';
  return status || '-';
}

function monthlyRangeText() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return `${first.toLocaleDateString()} - ${now.toLocaleDateString()}`;
}

export default function MyBalanceView({ runId, onOpenBankAccounts }: MyBalanceViewProps) {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [defaultBank, setDefaultBank] = useState<BankAccountRow | null>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [flowDirection, setFlowDirection] = useState<FlowDirection>('all');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  const token = useMemo(() => localStorage.getItem(ACCESS_TOKEN_KEY), []);

  const authedFetch = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error('missing token');
    const nextHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (init?.body !== undefined) nextHeaders['Content-Type'] = 'application/json';
    const res = await fetch(url, {
      ...init,
      headers: {
        ...nextHeaders,
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<T>;
  };

  const loadOverview = async () => {
    if (!runId || !token) return;
    const data = await authedFetch<FinanceOverview>(`${API_BASE_URL}/shopee/runs/${runId}/finance/overview`);
    setOverview(data);
  };

  const loadRows = async () => {
    if (!runId || !token) return;
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      direction: flowDirection,
    });
    if (keyword.trim()) params.set('keyword', keyword.trim());

    setLoading(true);
    try {
      const data = await authedFetch<TransactionsResponse>(
        `${API_BASE_URL}/shopee/runs/${runId}/finance/transactions?${params.toString()}`,
      );
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const loadDefaultBank = async () => {
    if (!runId || !token) return;
    const data = await authedFetch<BankAccountsResponse>(`${API_BASE_URL}/shopee/runs/${runId}/finance/bank-accounts`);
    const selected = (data.rows || []).find((row) => row.is_default) || (data.rows || [])[0] || null;
    setDefaultBank(selected);
  };

  const withdrawPreviewRmb = useMemo(() => {
    const num = Number(withdrawAmount || 0);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Number((num * 1.74).toFixed(2));
  }, [withdrawAmount]);

  const handleSubmitWithdraw = async () => {
    if (!runId) return;
    const amount = Number(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setWithdrawError('请输入大于 0 的提现金额');
      return;
    }
    if ((overview?.wallet_balance ?? 0) <= 0) {
      setWithdrawError('当前余额不足，无法提现');
      return;
    }
    if (amount > (overview?.wallet_balance ?? 0)) {
      setWithdrawError('提现金额不能超过当前可提现余额');
      return;
    }

    setWithdrawSubmitting(true);
    setWithdrawError('');
    try {
      await authedFetch<WithdrawResponse>(`${API_BASE_URL}/shopee/runs/${runId}/finance/withdraw`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount.toFixed(2)) }),
      });
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      await Promise.all([loadOverview(), loadRows()]);
      alert('提现成功，已转入工作台资金。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '提现失败，请稍后重试';
      setWithdrawError(message);
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  useEffect(() => {
    void loadOverview();
    void loadDefaultBank();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, flowDirection, keyword, page, pageSize]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f5f5] p-6 custom-scrollbar">
      <div className="mx-auto max-w-[1600px] space-y-3">
        <section className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-[17px] font-semibold text-[#2f2f2f]">余额总览</h2>
          <div className="mt-3 grid grid-cols-[1fr_340px] gap-0 overflow-hidden rounded border border-gray-200">
            <div className="px-5 py-5">
              <div className="text-[14px] text-gray-600">钱包余额</div>
              <div className="mt-2 flex items-center gap-4">
                <div className="text-[38px] font-semibold text-[#2f2f2f]">{formatMoney(overview?.wallet_balance ?? 0)}</div>
                <button
                  type="button"
                  onClick={() => {
                    setShowWithdrawModal(true);
                    setWithdrawAmount('');
                    setWithdrawError('');
                  }}
                  className="h-8 rounded bg-[#ee4d2d] px-4 text-[13px] text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!defaultBank || (overview?.wallet_balance ?? 0) <= 0}
                >
                  提现
                </button>
              </div>
            </div>
            <div className="border-l border-gray-200 px-5 py-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-[#2f2f2f]">我的银行卡</h3>
                <button type="button" onClick={onOpenBankAccounts} className="text-[13px] text-[#2b6adf]">
                  更多
                </button>
              </div>
              {defaultBank ? (
                <>
                  <div className="mt-3 text-[13px] text-[#2b6adf]">
                    {defaultBank.bank_name}（{defaultBank.account_no_masked}）
                  </div>
                  <div className="mt-1 text-[12px] text-gray-500">
                    {defaultBank.is_default ? '默认账户' : '收款账户'} · {defaultBank.verify_status === 'verified' ? '已验证' : '待校验'}
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-3 text-[13px] text-gray-500">未绑定银行账户</div>
                  <button type="button" onClick={onOpenBankAccounts} className="mt-1 text-[12px] text-[#2b6adf]">
                    去添加银行账户
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-[17px] font-semibold text-[#2f2f2f]">资金工具</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffe7dd] text-[20px]">🧧</div>
                <div>
                  <div className="text-[15px] font-semibold text-[#2f2f2f]">卖家轻松现金</div>
                  <div className="text-[12px] text-gray-500">可用于店铺短期周转，提升资金弹性</div>
                </div>
              </div>
              <button type="button" className="h-8 rounded border border-[#ee4d2d] px-4 text-[13px] text-[#ee4d2d]">开通</button>
            </div>
            <div className="flex items-center justify-between rounded border border-gray-200 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffe7dd] text-[20px]">⚡</div>
                <div>
                  <div className="text-[15px] font-semibold text-[#2f2f2f]">快速支付</div>
                  <div className="text-[12px] text-gray-500">订单发货当天即可加速到账</div>
                </div>
              </div>
              <button type="button" className="h-8 rounded border border-[#ee4d2d] px-4 text-[13px] text-[#ee4d2d]">开通</button>
            </div>
          </div>
        </section>

        <section className="rounded border border-gray-200 bg-white p-4">
          <h2 className="text-[17px] font-semibold text-[#2f2f2f]">最近交易</h2>

          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-4 text-[13px]">
              <span className="w-[140px] text-gray-600">交易创建时间</span>
              <button type="button" className="inline-flex h-8 items-center gap-2 rounded border border-gray-200 px-3 text-gray-700">
                <CalendarDays size={14} />
                <span>本月内</span>
                <span>{monthlyRangeText()}</span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
            </div>

            <div className="flex items-center gap-4 text-[13px]">
              <span className="w-[140px] text-gray-600">资金流向</span>
              <div className="inline-flex overflow-hidden rounded border border-[#ee4d2d]">
                <button
                  type="button"
                  onClick={() => {
                    setFlowDirection('all');
                    setPage(1);
                  }}
                  className={`h-8 px-4 ${flowDirection === 'all' ? 'bg-[#ee4d2d] text-white' : 'bg-white text-[#ee4d2d]'}`}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFlowDirection('in');
                    setPage(1);
                  }}
                  className={`h-8 border-l border-[#ee4d2d] px-4 ${flowDirection === 'in' ? 'bg-[#ee4d2d] text-white' : 'bg-white text-[#ee4d2d]'}`}
                >
                  收入
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFlowDirection('out');
                    setPage(1);
                  }}
                  className={`h-8 border-l border-[#ee4d2d] px-4 ${flowDirection === 'out' ? 'bg-[#ee4d2d] text-white' : 'bg-white text-[#ee4d2d]'}`}
                >
                  支出
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[13px]">
              <span className="w-[140px] text-gray-600">店铺类型</span>
              <label className="inline-flex items-center gap-2 text-gray-700">
                <input type="radio" defaultChecked className="h-3 w-3 accent-[#ee4d2d]" />
                本地店铺
              </label>
              <label className="inline-flex items-center gap-2 text-gray-700">
                <input type="radio" className="h-3 w-3 accent-[#ee4d2d]" />
                跨境店铺
              </label>
            </div>

            <div className="flex items-center gap-4 text-[13px]">
              <span className="w-[140px] text-gray-600">交易类型</span>
              <div className="flex flex-wrap gap-4 text-gray-700">
                <label className="inline-flex items-center gap-2"><input type="checkbox" defaultChecked className="h-3 w-3 accent-[#ee4d2d]" />订单回款</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" defaultChecked className="h-3 w-3 accent-[#ee4d2d]" />调整</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" defaultChecked className="h-3 w-3 accent-[#ee4d2d]" />余额支付</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" defaultChecked className="h-3 w-3 accent-[#ee4d2d]" />订单退款</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" defaultChecked className="h-3 w-3 accent-[#ee4d2d]" />提现</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" defaultChecked className="h-3 w-3 accent-[#ee4d2d]" />快速支付</label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="h-8 rounded border border-gray-200 px-4 text-[13px] text-gray-700">
                重置
              </button>
              <button
                type="button"
                onClick={() => {
                  setKeyword(keywordInput.trim());
                  setPage(1);
                }}
                className="h-8 rounded border border-[#ee4d2d] px-4 text-[13px] text-[#ee4d2d]"
              >
                应用
              </button>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-[13px]">
              <div className="text-[#2f2f2f]">
                <span className="text-[28px] font-semibold">{total}</span> 笔交易
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setKeyword(keywordInput.trim());
                        setPage(1);
                      }
                    }}
                    placeholder="搜索订单号"
                    className="h-8 w-[180px] rounded border border-gray-200 pl-7 pr-2 text-[12px] outline-none focus:border-[#ee4d2d]"
                  />
                </div>
                <button type="button" className="inline-flex h-8 items-center gap-1 rounded border border-gray-200 px-3 text-[12px] text-gray-700">
                  <Download size={13} />
                  导出
                </button>
                <button type="button" className="inline-flex h-8 items-center rounded border border-gray-200 px-2 text-gray-500">
                  <ListFilter size={13} />
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded border border-gray-200">
              <table className="w-full text-[13px]">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium">日期</th>
                    <th className="px-3 py-3 text-left font-medium">类型 / 描述</th>
                    <th className="px-3 py-3 text-left font-medium">订单号</th>
                    <th className="px-3 py-3 text-left font-medium">资金流向</th>
                    <th className="px-3 py-3 text-left font-medium">金额</th>
                    <th className="px-3 py-3 text-left font-medium">状态</th>
                    <th className="px-3 py-3 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                        {loading ? '加载中...' : '暂无交易记录'}
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-3 py-3 text-gray-600">{formatDate(row.credited_at)}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#2f2f2f]">{mapEntryType(row.entry_type)}</div>
                        <div className="text-[12px] text-gray-400">{row.remark || '-'}</div>
                      </td>
                      <td className="px-3 py-3 text-[#2b6adf]">{row.order_no || '-'}</td>
                      <td className="px-3 py-3 text-gray-700">{mapFlow(row.direction)}</td>
                      <td className={`px-3 py-3 font-semibold ${row.direction === 'in' ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                        {row.direction === 'in' ? '+' : '-'}
                        {formatMoney(row.amount)}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{mapStatus(row.status)}</td>
                      <td className="px-3 py-3 text-gray-500">{'>'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {showWithdrawModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-[460px] rounded-xl bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-semibold text-[#2f2f2f]">提现到工作台</h3>
              <button
                type="button"
                onClick={() => {
                  if (withdrawSubmitting) return;
                  setShowWithdrawModal(false);
                }}
                className="text-[20px] leading-none text-gray-400"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3 text-[13px]">
              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-gray-500">默认银行卡</div>
                <div className="mt-1 text-[#2f2f2f]">
                  {defaultBank ? `${defaultBank.bank_name}（${defaultBank.account_no_masked}）` : '未设置默认银行卡'}
                </div>
              </div>
              <div className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
                <span className="text-gray-500">可提现余额</span>
                <span className="font-semibold text-[#2f2f2f]">{formatMoney(overview?.wallet_balance ?? 0)}</span>
              </div>
              <div>
                <label className="mb-1 block text-gray-600">提现金额（RM）</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder="请输入提现金额"
                  className="h-10 w-full rounded border border-gray-200 px-3 outline-none focus:border-[#ee4d2d]"
                />
              </div>
              <div className="flex items-center justify-between rounded border border-gray-200 bg-[#fff7f4] px-3 py-2">
                <span className="text-gray-500">预计转入工作台</span>
                <span className="font-semibold text-[#ee4d2d]">RMB {withdrawPreviewRmb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="text-[12px] text-gray-500">汇率：1 RM = 1.74 RMB</div>
              {withdrawError && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-600">{withdrawError}</div>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                disabled={withdrawSubmitting}
                className="h-9 rounded border border-gray-200 px-4 text-[13px] text-gray-700 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitWithdraw()}
                disabled={withdrawSubmitting || !defaultBank}
                className="h-9 rounded bg-[#ee4d2d] px-4 text-[13px] text-white disabled:opacity-50"
              >
                {withdrawSubmitting ? '提交中...' : '确认提现'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
