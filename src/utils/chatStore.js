// 会话记忆：对话内容存 sessionStorage，刷新页面不丢（关掉标签页才清）。
// 只存可见文本，不存 _apiContent / _apiMessages 这类大对象与内部状态。
const CHAT_KEY = 'study-progress-chat'
const CHAT_LIMIT = 80 // 最多保留最近 80 条，避免会话存储膨胀

export function loadChat() {
  try {
    const raw = sessionStorage.getItem(CHAT_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter((m) => m && typeof m.id === 'number' && m.role)
  } catch {
    return []
  }
}

export function saveChat(messages) {
  try {
    const slim = messages.slice(-CHAT_LIMIT).map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text || '',
      // 确认卡只留最终结果，重放时不再显示待确认按钮
      calls: m.calls?.map((c) => ({ summary: c.summary, state: c.state, result: c.result })),
    }))
    sessionStorage.setItem(CHAT_KEY, JSON.stringify(slim))
  } catch {
    // 存不下就算了，不能影响对话
  }
}

export function clearChatStorage() {
  try {
    sessionStorage.removeItem(CHAT_KEY)
  } catch {
    // 同上
  }
}

// 恢复出来的消息没有 _apiContent（图片等），这里补一条文本说明，
// 避免历史里的图片轮次在重放时变成「（上传了文件）」的空对话。
export function hydrateChat(messages) {
  return messages.map((m) => {
    if (m.role !== 'user' || !m.files?.length) return m
    return { ...m, _apiContent: undefined }
  })
}