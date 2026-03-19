import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, X, ChevronDown } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const ACCESS_TOKEN_KEY = 'cbec_access_token';

interface MyBankAccountsViewProps {
  runId: number | null;
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

const BANK_OPTIONS = [
  '渣打银行',
  '马来亚银行',
  '联昌国际银行',
  '大众银行',
  '丰隆银行',
  'RHB 银行',
  '暹罗商业银行（SCB）',
];

export default function MyBankAccountsView({ runId }: MyBankAccountsViewProps) {
  const [rows, setRows] = useState<BankAccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [accountHolder, setAccountHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const token = useMemo(() => localStorage.getItem(ACCESS_TOKEN_KEY), []);

  const authedFetch = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    if (!token) throw new Error('未登录');
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      let detail = '请求失败';
      try {
        const data = (await res.json()) as { detail?: string };
        detail = data.detail || detail;
      } catch {
        // ignore
      }
      throw new Error(detail);
    }
    return res.json() as Promise<T>;
  };

  const loadBankAccounts = async () => {
    if (!runId || !token) return;
    setLoading(true);
    try {
      const data = await authedFetch<BankAccountsResponse>(`${API_BASE_URL}/shopee/runs/${runId}/finance/bank-accounts`);
      setRows(data.rows || []);
    } catch (err) {
      setRows([]);
      window.alert((err as Error).message || '加载银行账户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBankAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const resetForm = () => {
    setAccountHolder('');
    setBankName('');
    setAccountNo('');
    setIsDefault(false);
  };

  const openModal = () => {
    resetForm();
    setShowModal(true);
  };

  const saveBankAccount = async () => {
    if (!runId || !token) return;
    setSaving(true);
    try {
      await authedFetch<BankAccountRow>(`${API_BASE_URL}/shopee/runs/${runId}/finance/bank-accounts`, {
        method: 'POST',
        body: JSON.stringify({
          bank_name: bankName,
          account_holder: accountHolder,
          account_no: accountNo,
          is_default: isDefault,
        }),
      });
      setShowModal(false);
      await loadBankAccounts();
      window.alert('保存成功');
    } catch (err) {
      window.alert((err as Error).message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const setDefaultBank = async (accountId: number) => {
    if (!runId || !token) return;
    try {
      await authedFetch<BankAccountRow>(`${API_BASE_URL}/shopee/runs/${runId}/finance/bank-accounts/${accountId}/set-default`, {
        method: 'POST',
      });
      await loadBankAccounts();
    } catch (err) {
      window.alert((err as Error).message || '设置默认失败');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f5f5] p-6 custom-scrollbar">
      <div className="mx-auto max-w-[1600px] rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-4 text-[24px] font-semibold text-[#2f2f2f]">添加银行账户</h2>

        <div className="grid grid-cols-4 gap-4">
          <button
            type="button"
            onClick={openModal}
            className="flex flex-col items-center justify-center rounded border border-dashed border-gray-300 bg-white text-gray-400 hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
            style={{ height: 220 }}
          >
            <Plus size={32} />
            <span className="mt-4 text-[15px]">添加银行账户</span>
          </button>

          {rows.map((card) => (
            <article key={card.id} className="h-[220px] overflow-hidden rounded border border-gray-200 bg-white">
              <div className="h-[66px] bg-[#666a70] px-4 py-3 text-[16px] font-semibold text-white">{card.bank_name}</div>
              <div className="p-4">
                <div className="flex items-center gap-2 text-[12px] text-[#00b497]">
                  <CheckCircle2 size={14} />
                  <span>{card.verify_status === 'verified' ? '已检查' : '待校验'}</span>
                </div>
                <div className="mt-5 text-[30px] tracking-[2px] text-[#5e5e5e]">{card.account_no_masked}</div>
                <div className="mt-3 text-[16px] text-[#6b6b6b]">{card.account_holder}</div>
                <div className="mt-6 flex items-center gap-2">
                  {card.is_default ? (
                    <span className="rounded bg-[#e6f8f4] px-2 py-1 text-[12px] text-[#00b497]">默认</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDefaultBank(card.id)}
                      className="rounded border border-gray-200 px-2 py-1 text-[12px] text-gray-600 hover:border-[#ee4d2d] hover:text-[#ee4d2d]"
                    >
                      设为默认
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        {!loading && rows.length === 0 && <div className="mt-3 text-[13px] text-gray-400">暂无银行账户，请先创建</div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40">
          <div className="w-[580px] rounded bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[26px] font-semibold text-[#2f2f2f]">银行账户</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-[180px_1fr] items-center gap-3">
                <label className="text-right text-[14px] text-gray-700">银行卡账户姓名</label>
                <div className="relative">
                  <input
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value.slice(0, 64))}
                    className="h-10 w-full rounded border border-gray-200 px-3 text-[14px] outline-none focus:border-[#ee4d2d]"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">
                    {accountHolder.length}/64
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-[180px_1fr] items-center gap-3">
                <label className="text-right text-[14px] text-gray-700">银行名称</label>
                <div className="relative">
                  <select
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="h-10 w-full appearance-none rounded border border-gray-200 px-3 pr-8 text-[14px] outline-none focus:border-[#ee4d2d]"
                  >
                    <option value="">请选择银行</option>
                    {BANK_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div className="grid grid-cols-[180px_1fr] items-center gap-3">
                <label className="text-right text-[14px] text-gray-700">银行账号</label>
                <input
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  className="h-10 w-full rounded border border-gray-200 px-3 text-[14px] outline-none focus:border-[#ee4d2d]"
                  placeholder="请输入银行账号"
                />
              </div>

              <div className="grid grid-cols-[180px_1fr] items-center gap-3">
                <span />
                <label className="inline-flex items-center gap-2 text-[14px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="h-4 w-4 accent-[#ee4d2d]"
                  />
                  设为默认收款账户
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-9 rounded border border-gray-200 px-5 text-[14px] text-gray-700"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveBankAccount}
                className="h-9 rounded bg-[#ee4d2d] px-5 text-[14px] text-white disabled:opacity-60"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
