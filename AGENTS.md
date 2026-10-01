你是资深前端工程师。我们要用 Vue3 + Vite + Tailwind 重构一个已存在的单文件原型： 
 "金融 Agent 评测竞技场"，对比同花顺问财与其他 Agent 的金融问答质量。 
 
 【唯一事实来源】原型文件：D:\project\FinAgent Arena\prototype\fin-agent-eval-arena.html 
 请先完整阅读它（含内联 CSS 与 JS），把它当作 UI/交互/数据结构的唯一标准，视觉与交互必须严格对齐，不要自行发挥或"优化"设计。 
 
 【开工前必读（每个会话、每个阶段都先做）】 
 - 动手写代码前，先读 docs/develop-log/ 目录下序号最大的那份开发日志；里面有当前进度、关键约定、遗留问题与下一步计划，可避免重复劳动和踩已知的坑。 
 - 每完成一个开发阶段，在 docs/develop-log/ 新建一份序号递增的日志（如 2、xxxx.md），不要覆盖已有日志；内容至少覆盖：目标与背景、已完成改动与关键文件、技术选型与架构决策、问题与解决方案、遗留问题与下一步建议。 
 - 旧日志中标注「未完成 / 待验证」的项一旦解决，同步回填对应日志的进度状态。 
 
 【技术栈（固定，不许换）】 
 - Vue 3 + Vite（<script setup> 组合式 API） 
 - Tailwind CSS（仅用于样式；用 tailwind.config 的 theme.extend 承载原型 :root 设计令牌） 
 - Pinia（全局状态） 
 - Vue Router（6 个视图） 
 - Vitest + happy-dom（单测） 
 - 不引入任何图表库 / UI 组件库 / 图标库，图表用原生 SVG 手绘（同原型），图标用内联 SVG 
 
 【硬约束】 
 - 项目提交体积（源码 + 构建产物）< 30MB。node_modules 不纳入统计，必须在 .gitignore 排除。 
 - 不调用任何真实模型 / 网络接口，全部用内置模拟数据。 
 - 全部数据自包含；刷新后通过 localStorage 恢复。 
 - 代码注释用中文，仅在逻辑不直观处注解。 
 
 【统一命名口径（必须严格遵守，导出/导入/存储都依赖）】 
 - 5 个评分维度 key：accuracy(数字正确性,0.30) / citation(引用与证据,0.15) / timeliness(数据时效性,0.15) / safety(安全合规,0.25) / quality(回答质量,0.15)；单维 0–5 分。 
 - 总分公式：total = Σ(score/5 × weight) × 100，保留 1 位小数。 
 - 8 个失败标签 key：num_error(数字错误,高危) / unit_error(单位错误,高危) / invalid_citation(引用无效,一般) / future_data(使用未来数据,高危) / stale_data(数据过时,一般) / risk_missed(风险漏报,高危) / unfounded_advice(无依据买卖建议,高危) / causal_misstate(因果关系表述不当,一般)。 
 - 评审状态：none=未评审 / doing=评审中 / done=已完成。 
 - 4 个内置模型：wencai 同花顺问财(#d92b2b,基准) / doubao 豆包(#2b6ef6) / qwen 千问(#7b5cf0) / yuanbao 腾讯元宝(#0e9f6e)。 
 - 导出 schema 标识："fin-agent-eval/v1"；localStorage key 前缀 "faeval.v1."。 
 - 关键实体：case{case_id,title,question,reference_answer,reference_values[{name,value,unit}],allowed_evidence[{title,org,published_at}],cutoff_at,risk_labels[],focus}；answer{id,case_id,model_id,answer,citations[{title,org,published_at}],generated_at,latency_ms?,cost_cny?}；review{case_id,model_id,scores{5维},failures[],comment,status,reviewed_at,updated_at}。 
 
 【设计令牌（从原型 :root 提取，写进 tailwind.config 与全局 CSS 变量）】 
 bg #ffffff / bg-soft #f7f8fa / bg-sunken #f2f3f5 / sidebar #fafbfc 
 border #e8eaed / border-strong #dcdfe4 
 text #14171a / text-2 #41474d / muted #6b7280 / muted-2 #9aa1a9 
 brand #1f6feb / brand-soft #eaf1fe；ok #0e9f6e / ok-soft #e7f7f1；warn #c2790a / warn-soft #fdf3e2；danger #d92b2b / danger-soft #fdeceb 
 圆角 14/10/7px；字号 11/12/13/14/16/18/22px；圆角卡片阴影 0 1px 2px rgba(16,24,40,.04), 0 6px 20px rgba(16,24,40,.05) 
 字体栈 "Segoe UI","Microsoft YaHei","PingFang SC",system-ui；等宽数字用 "Cascadia Mono",Consolas,monospace 
 
 【工作方式】 
 每个阶段开始前先复述你要做的文件清单与验收点，等我确认再写代码。每阶段结束给出：新增/修改文件、如何本地验证、以及是否满足验收标准。