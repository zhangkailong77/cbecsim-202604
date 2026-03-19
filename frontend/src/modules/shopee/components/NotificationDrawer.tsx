import { RefreshCw, ChevronRight, Package } from 'lucide-react';

interface NotificationDrawerProps {
  open: boolean;
  loading: boolean;
  orders: NotificationOrder[];
}

export interface NotificationOrder {
  id: number;
  orderNo: string;
  buyerName: string;
  amountText: string;
  createdAtText: string;
  countdownText: string;
}

export default function NotificationDrawer({ open, loading, orders }: NotificationDrawerProps) {
  const hasOrders = orders.length > 0;

  return (
    <aside
      className={`h-full border-l border-gray-200 bg-white transition-[width] duration-300 ease-out ${
        open ? 'w-[350px]' : 'w-0'
      }`}
    >
      <div className={`${open ? 'opacity-100' : 'opacity-0 pointer-events-none'} h-full transition-opacity duration-200`}>
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
            <h3 className="text-[30px] font-bold leading-none text-[#ee4d2d] tracking-tight">通知</h3>
            <div className="flex items-center gap-3 text-gray-400">
              <RefreshCw size={15} />
              <button type="button" className="hover:text-[#ee4d2d]">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 text-[13px]">
            <span className="font-semibold text-[#ee4d2d]">待处理发货通知</span>
            <span className="text-gray-500">共 {orders.length} 条</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2">
            {loading ? (
              <div className="h-full flex items-center justify-center text-[13px] text-gray-400">通知加载中...</div>
            ) : hasOrders ? (
              orders.map((item) => (
                <article key={item.id} className="rounded-md px-2 py-2.5 hover:bg-[#fff7f4] transition-colors border-b border-gray-100 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <Package size={13} className="text-[#ee4d2d] mt-0.5" />
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-semibold text-[#2f2f2f] leading-snug">
                        订单待处理：{item.orderNo}
                      </h4>
                      <p className="mt-1 text-[12px] leading-snug text-gray-600">
                        买家：{item.buyerName} · 金额：{item.amountText}
                      </p>
                      <p className="mt-1 text-[12px] leading-snug text-gray-500">{item.countdownText}</p>
                      <p className="mt-1 text-[11px] text-gray-400">下单时间：{item.createdAtText}</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-[13px] text-gray-400">暂无待处理订单通知</div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
