import { now } from '@/lib/format'

/* 流式输出引擎：定频 ticker + delta-time 累加字符。
   不依赖 requestAnimationFrame，后台标签页 / 低帧率环境下也不会卡住。 */

export const STREAM_SPEEDS = { slow: 30, medium: 78, fast: 220, off: Infinity }
export const STREAM_TICK_MS = 24
export const STREAM_STAGGER_MS = 140 // 并列作答时各模型的起笔错峰
export const DEFAULT_STREAM = 'medium'

const timers = new Set()

export function cancelStreams() {
  timers.forEach((id) => clearInterval(id))
  timers.clear()
}

/*
 * 逐字输出到回调。
 * @param {string} full 完整文本
 * @param {object} opts { speed, delay, onUpdate(text), onDone() }
 * @returns {number|null} 定时器 id，off 模式返回 null
 */
export function streamText(full, opts = {}) {
  const { speed = DEFAULT_STREAM, delay = 0, onUpdate, onDone } = opts
  const cps = STREAM_SPEEDS[speed] === undefined ? STREAM_SPEEDS.medium : STREAM_SPEEDS[speed]

  if (!full) {
    onUpdate && onUpdate('')
    onDone && onDone()
    return null
  }
  if (!isFinite(cps) || cps <= 0) {
    onUpdate && onUpdate(full)
    onDone && onDone()
    return null
  }

  const startAt = now() + delay
  let shown = 0
  const id = setInterval(() => {
    const elapsed = (now() - startAt) / 1000
    if (elapsed <= 0) return
    const n = Math.min(full.length, Math.floor(elapsed * cps))
    if (n > shown) {
      shown = n
      onUpdate && onUpdate(full.slice(0, n))
    }
    if (n >= full.length) {
      shown = full.length
      onUpdate && onUpdate(full)
      clearInterval(id)
      timers.delete(id)
      onDone && onDone()
    }
  }, STREAM_TICK_MS)
  timers.add(id)
  return id
}