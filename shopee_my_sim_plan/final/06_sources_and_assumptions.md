# 最终版 06：资料来源与参数口径

## 1. 主要公开资料（用于建模）
1. DOSM（马来西亚统计局）电商收入与ICT服务统计
- https://www.dosm.gov.my/portal-main/release-content/e-commerce-income-recorded-rm1.25-trillion-in-2022
- https://www.dosm.gov.my/portal-main/release-content/ict-services-and-e-commerce-statistics-2024

2. Sea Limited（Shopee母公司）官方财报/公告
- https://www.sea.com/investornews/sea-limited-reports-fourth-quarter-and-full-year-2025-results
- https://www.sec.gov/Archives/edgar/data/1703399/000110465926039408/tm262668d1_ex99-1.htm

3. World Bank 物流绩效（LPI）
- https://lpi.worldbank.org/international/scorecard/radar/254/C/MYS/2023/R/EAP/2023#chartarea

4. 马来西亚低价值商品税（LVG）官方页面
- https://mylvg.customs.gov.my/

5. DataReportal 马来西亚数字概况（辅助）
- https://datareportal.com/reports/digital-2026-malaysia

## 2. Shopee规则口径说明
- Shopee站内具体费率、活动规则、广告细则会动态调整。
- 设计上采用“政策参数中心”并支持版本化配置，不把费率写死在代码。
- 对无法稳定抓取的一手页面，采用“官方公告+媒体转述+可配置”三重校验策略。

## 3. 关键假设（首版）
1. 平台机制按“订单-履约-回款”标准电商闭环建模。
2. 联机对抗采用共享市场池，保证玩家决策互相影响。
3. 所有敏感数值（费率/税率/CPC）可热更新。
4. 首版以经营系统正确性优先，UI简化。

## 4. 置信度分层
- 高置信：国家统计、官方财报、官方政策页
- 中置信：行业报告与平台公开培训信息
- 低置信：二手媒体对费率细节的转述（仅作默认值，不固化）

## 5. 建议上线前补充动作
1. 以你可访问的Shopee卖家后台最新规则做最终参数校准。
2. 组织3轮封闭测试：新手、教学场景、硬核玩家。
3. 根据测试重标定：广告CPC波动、退货率、资金压力阈值。
