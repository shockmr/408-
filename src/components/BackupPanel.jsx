import { useRef, useState } from 'react'
import Icon from './Icon'
import {
  exportJSON,
  importJSON,
  resetState,
  readBackupRaw,
  usePersistError,
  clearPersistError,
} from '../store'
import { clearAttachments } from '../utils/attachments'

const today = () => new Date().toLocaleDateString('sv-SE').replaceAll('-', '')

// 数据备份与恢复。纯前端应用的唯一保险栓：
// 导出 JSON 存到手机/网盘，换浏览器或误操作后能整包恢复。
export default function BackupPanel({ onClose }) {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState(null)
  const err = usePersistError()

  const notify = (text, error = false) => setMsg({ text, error })

  const download = () => {
    try {
      const json = exportJSON()
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `考研进度备份-${today()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      const kb = (blob.size / 1024).toFixed(1)
      notify(`已导出备份（${kb} KB）。建议另存到网盘或聊天软件里。`)
    } catch (e) {
      notify(`导出失败：${e.message}`, true)
    }
  }

  const onPick = async (file) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      notify('文件超过 20MB，可能不是进度备份文件', true)
      return
    }
    if (!confirm('导入会用备份文件整体替换当前数据，当前数据会先自动备份。确定继续？')) return
    try {
      const text = await file.text()
      const r = importJSON(text)
      notify(r.ok ? `导入成功（${file.name}）` : `导入失败：${r.error}`, !r.ok)
    } catch (e) {
      notify(`读取文件失败：${e.message}`, true)
    }
  }

  const restoreBackup = () => {
    const raw = readBackupRaw()
    if (!raw) {
      notify('没有可用的自动备份', true)
      return
    }
    if (!confirm('用自动备份覆盖当前数据？当前数据会先备份为新的快照。')) return
    const r = importJSON(raw)
    notify(r.ok ? '已从自动备份恢复' : `恢复失败：${r.error}`, !r.ok)
  }

  const dangerReset = async () => {
    if (!confirm('重置会清空所有数据（含章节目录附件），回到初始状态。确定继续？')) return
    if (!confirm('再确认一次：此操作不可撤销，建议先导出备份。')) return
    // 清数据前先把现状导出一份，给用户留一条退路
    try {
      const json = exportJSON()
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `重置前备份-${today()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      // 导出失败也继续，用户已两次确认
    }
    await clearAttachments().catch(() => {})
    clearPersistError()
    resetState()
    notify('已重置为初始数据（重置前的数据已尝试下载为备份文件）')
  }

  const btn =
    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 cursor-pointer'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="数据备份与恢复">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
          <Icon name="download" className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">数据备份与恢复</h2>
          <button
            onClick={onClose}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="关闭"
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            所有数据都存在这台设备的浏览器里，换设备、清理浏览器数据都会丢。定期导出备份是唯一可靠的保险。
          </p>

          {err && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
              ⚠ {err.message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={download} className={`${btn} justify-center bg-blue-600 text-white hover:bg-blue-700`}>
              <Icon name="download" className="w-4 h-4" />
              导出备份
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className={`${btn} justify-center border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
            >
              <Icon name="file" className="w-4 h-4" />
              导入备份
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files?.[0])
              e.target.value = ''
            }}
          />

          {msg && (
            <div
              role="status"
              aria-live="polite"
              className={`px-3 py-2 rounded-lg text-xs leading-relaxed ${msg.error ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}
            >
              {msg.error ? '✗ ' : '✓ '}
              {msg.text}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <button
              onClick={restoreBackup}
              className={`${btn} w-full justify-center border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
            >
              从自动备份恢复（版本升级/导入前的快照）
            </button>
            <button onClick={dangerReset} className={`${btn} w-full justify-center text-rose-600 hover:bg-rose-50`}>
              <Icon name="trash" className="w-4 h-4" />
              重置全部数据
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}