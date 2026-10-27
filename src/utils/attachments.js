// 附件存储层：用 IndexedDB 存二进制，避免 base64 把 localStorage 的 5MB 配额撑爆。
// 状态（store）里只保留 { id, name, type, size } 元数据，文件实体在这边按 id 取。
const DB_NAME = 'study-progress-attachments'
const DB_VERSION = 1
const STORE_NAME = 'files'

let dbPromise = null

// 缺 store 的库（上次升级中断、或别的脚本建了个空库）会让应用永远拿不到表：
// open() 的版本号相同就不触发 upgradeneeded，之后所有事务都报 Object store not found。
// 这里打开后自检一次，缺表就关掉、抬版本号重开，靠 onupgradeneeded 补建。
function openDB(version = DB_VERSION) {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前浏览器不支持 IndexedDB'))
      return
    }
    const req = indexedDB.open(DB_NAME, version)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => {
      const db = req.result
      if (db.objectStoreNames.contains(STORE_NAME)) {
        resolve(db)
        return
      }
      // 自愈：关掉当前连接，用更高版本重开以触发建表
      const next = db.version + 1
      db.close()
      dbPromise = null
      openDB(next).then(resolve, reject)
    }
    req.onerror = () => reject(req.error || new Error('打开附件库失败'))
  })
  return dbPromise
}

// data:image/png;base64,xxx → Blob（迁移旧数据用）
export function dataUrlToBlob(dataUrl) {
  const str = String(dataUrl || '')
  const comma = str.indexOf(',')
  if (comma < 0) throw new Error('不是合法的 dataURL')
  const head = str.slice(0, comma)
  const body = str.slice(comma + 1)
  const mime = /:(.*?);/.exec(head)?.[1] || 'application/octet-stream'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('读取附件失败'))
    reader.readAsDataURL(blob)
  })
}

// 写入一条附件。blob 可以是 File（浏览器里 File 继承 Blob，IDB 可直接存）。
export async function putAttachment({ id, name, type, size, blob, dataUrl }) {
  const db = await openDB()
  let body = blob || null
  if (!body && dataUrl) body = dataUrlToBlob(dataUrl)
  if (!body) throw new Error('附件内容为空')
  const record = {
    id,
    name: name || '',
    type: type || '',
    size: typeof size === 'number' && size > 0 ? size : body.size || 0,
    blob: body,
    savedAt: Date.now(),
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record)
    tx.oncomplete = () => resolve(record)
    tx.onerror = () => reject(tx.error || new Error('附件写入失败'))
    tx.onabort = () => reject(tx.error || new Error('附件写入被中断'))
  })
}

export async function getAttachment(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(id)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error || new Error('附件读取失败'))
  })
}

export async function deleteAttachment(id) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error || new Error('附件删除失败'))
  })
}

export async function clearAttachments() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => reject(tx.error || new Error('附件库清空失败'))
  })
}

export async function listAttachmentIds() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAllKeys()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error || new Error('附件索引读取失败'))
  })
}

// ---------- 查看 / 下载 ----------

const PREVIEWABLE = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'bmp', 'svg']

// 取附件的可访问 URL：优先元数据里内联的 dataURL（旧数据），其次 IndexedDB。
// 返回 { url, revoke } —— 调用方在合适时机调 revoke()。
export async function resolveAttachment(att) {
  if (att?.data) return { url: att.data, revoke: () => {} }
  const record = await getAttachment(att?.id)
  if (!record?.blob) return { url: '', revoke: () => {} }
  const url = URL.createObjectURL(record.blob)
  return { url, revoke: () => URL.revokeObjectURL(url) }
}

// 图片 / PDF 新窗口预览，Word 等直接下载保存
export async function openAttachment(att) {
  const { url, revoke } = await resolveAttachment(att)
  if (!url) throw new Error('附件内容已丢失，请重新上传')
  if (PREVIEWABLE.includes(String(att.type || '').toLowerCase())) {
    window.open(url, '_blank', 'noopener')
    window.setTimeout(revoke, 60_000)
    return
  }
  const a = document.createElement('a')
  a.href = url
  a.download = att.name || 'attachment'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(revoke, 60_000)
}