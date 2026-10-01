/* 通用格式化工具（与原型同名同行为） */

export const clone = (o) => JSON.parse(JSON.stringify(o))

/* 高精度时间源：流式输出用 delta-time 累加，不依赖 requestAnimationFrame */
export function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

/* 2025-06-30 18:05 */
export function shortTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

/* 表格里用短格式：06-30 18:05 */
export function shortDay(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return iso
  const p = (n) => String(n).padStart(2, '0')
  return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

/* 导出文件名时间戳：20250630-1805 */
export function dateStamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes())
}

/* 去除空白与中英文标点，用于自由提问与参考问题的匹配 */
export function normText(s) {
  return String(s || '').replace(/[\s，。？！、,.;；:：“”‘’（）()【】\[\]《》<>—\-_]/g, '')
}

/* 数值格式化：总分保留 1 位，维度均分保留 2 位 */
export const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1)
export const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2)

/* HTML 转义（用于非 Vue 模板的字符串拼接场景，如 Markdown 导出、快照展示） */
export function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}