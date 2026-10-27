// OpenAI 兼容中转站客户端（DeepSeek 等模型经此调用）
// ⚠️ 密钥与中转站地址存在 localStorage 且随请求从浏览器直发，仅供本机自用，不要部署到公网
export const DEFAULT_BASE_URL = 'https://xh.v1api.cc/v1'
export const DEFAULT_MODEL = 'deepseek-v4-flash-none'

const KEY_STORAGE = 'llm-api-key'
const BASE_STORAGE = 'llm-base-url'
const MODEL_STORAGE = 'llm-model'

export class MissingKeyError extends Error {
  constructor() {
    super('尚未配置 API 密钥')
    this.name = 'MissingKeyError'
  }
}

export function getApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    // 隐私模式下 localStorage 不可写
  }
}

export function getBaseUrl() {
  try {
    return localStorage.getItem(BASE_STORAGE) || DEFAULT_BASE_URL
  } catch {
    return DEFAULT_BASE_URL
  }
}

export function setBaseUrl(url) {
  try {
    if (url) localStorage.setItem(BASE_STORAGE, url)
    else localStorage.removeItem(BASE_STORAGE)
  } catch {
    // 同上
  }
}

export function getModel() {
  try {
    return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

export function setModel(model) {
  try {
    if (model) localStorage.setItem(MODEL_STORAGE, model)
    else localStorage.removeItem(MODEL_STORAGE)
  } catch {
    // 同上
  }
}

// 优雅地读配置：缺密钥抛 MissingKeyError，否则返回 { apiKey, baseUrl, model }
export function getConfig() {
  const apiKey = getApiKey()
  if (!apiKey) throw new MissingKeyError()
  return { apiKey, baseUrl: getBaseUrl(), model: getModel() }
}

// 单轮非流式调用。传入 OpenAI 兼容的 request body（不含 model，这里统一注入）
// 返回完整 JSON。超时会由调用方按需处理。
export async function chatCompletion(body) {
  const { apiKey, baseUrl, model } = getConfig()
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ ...body, model }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`中转站返回 ${res.status}：${text.slice(0, 300)}`)
  }
  return res.json()
}
