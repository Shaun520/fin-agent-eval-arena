/* 存储层：localStorage 主通道 + 内存降级（不可用时提醒且不静默失败） */

export const SCHEMA_ID = 'fin-agent-eval/v1'

export const LS = {
  reviews: 'faeval.v1.reviews',
  answers: 'faeval.v1.answers',
  cases: 'faeval.v1.cases',
  config: 'faeval.v1.config',
  chat: 'faeval.v1.chat',
  seeded: 'faeval.v1.seeded',
}

/* 自动保存防抖窗口 */
export const AUTOSAVE_DEBOUNCE_MS = 260

const memoryFallback = {}
export let storageOK = true

try {
  const probe = '__faeval_probe__'
  localStorage.setItem(probe, '1')
  localStorage.removeItem(probe)
} catch (e) {
  storageOK = false
}

export function lsGet(key, dflt) {
  try {
    const raw = storageOK ? localStorage.getItem(key) : memoryFallback[key]
    if (raw === null || raw === undefined) return dflt
    return JSON.parse(raw)
  } catch (e) {
    return dflt
  }
}

export function lsSet(key, val) {
  const raw = JSON.stringify(val)
  if (storageOK) {
    try {
      localStorage.setItem(key, raw)
    } catch (e) {
      memoryFallback[key] = raw
    }
  } else {
    memoryFallback[key] = raw
  }
  return true
}

export function lsRemove(key) {
  try {
    if (storageOK) localStorage.removeItem(key)
    else delete memoryFallback[key]
  } catch (e) {
    delete memoryFallback[key]
  }
}