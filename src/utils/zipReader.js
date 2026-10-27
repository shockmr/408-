// 用 JSZip 解压 .docx，读取 word/document.xml
import JSZip from 'jszip'

export async function readZipEntry(arrayBuffer, path) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const file = zip.file(path)
  if (!file) return null
  return file.async('string')
}
