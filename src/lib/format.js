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