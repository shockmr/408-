// 把浏览器 File 对象转成 OpenAI 兼容的 content parts。
// 图片走 image_url（base64 data URL），纯文本内联进 text，其余只报文件名。

const TEXT_EXT = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'yml', 'yaml']

// 单个文件最多内联的字符数，避免一张长文档把上下文撑爆
const MAX_TEXT_CHARS = 20000

// 图片压缩：超过此尺寸（长边像素）会缩放
const IMG_MAX_SIDE = 1024
// 压缩后的 JPEG 质量
const IMG_QUALITY = 0.8

function ext(name) {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i + 1).toLowerCase()
}

function isText(file) {
  return file.type.startsWith('text/') || TEXT_EXT.includes(ext(file.name))
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`读取 ${file.name} 失败`))
    reader.readAsDataURL(file)
  })
}

// 用 canvas 把大图片缩到 IMG_MAX_SIDE 以内，返回压缩后的 data URL
// 如果原图已经够小，直接返回原始 data URL
async function compressImageIfNeeded(file) {
  const originalUrl = await readAsDataUrl(file)

  // 非 JPEG/PNG/webp 不压缩（canvas 导出格式受限）
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
    return originalUrl
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img
      // 已经够小，直接用原图
      if (w <= IMG_MAX_SIDE && h <= IMG_MAX_SIDE) {
        resolve(originalUrl)
        return
      }
      // 按比例缩放
      const scale = Math.min(IMG_MAX_SIDE / w, IMG_MAX_SIDE / h, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      // JPEG 不支持透明，用 JPEG 导出更小
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      resolve(canvas.toDataURL(mime, IMG_QUALITY))
    }
    img.onerror = () => resolve(originalUrl) // 加载失败降级到原图
    img.src = originalUrl
  })
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`读取 ${file.name} 失败`))
    reader.readAsText(file)
  })
}

// 返回 content parts 数组。单个文件读失败时降级成一条说明，不中断整次发送。
export async function filesToParts(files) {
  const parts = []
  for (const file of files) {
    try {
      if (file.type.startsWith('image/')) {
        const url = await compressImageIfNeeded(file)
        parts.push({ type: 'text', text: `[图片：${file.name}]` })
        parts.push({ type: 'image_url', image_url: { url } })
      } else if (isText(file)) {
        const raw = await readAsText(file)
        const text = raw.length > MAX_TEXT_CHARS ? raw.slice(0, MAX_TEXT_CHARS) + '\n…（已截断）' : raw
        parts.push({ type: 'text', text: `[文件：${file.name}]\n${text}` })
      } else {
        parts.push({
          type: 'text',
          text: `[文件：${file.name}（${file.type || '未知类型'}）无法直接读取，请让用户改传图片或纯文本]`,
        })
      }
    } catch (err) {
      parts.push({ type: 'text', text: `[文件：${file.name} 读取失败：${err.message}]` })
    }
  }
  return parts
}
