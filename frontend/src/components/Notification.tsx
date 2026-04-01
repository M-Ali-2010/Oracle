import { useEffect } from 'react'
import useNotificationStore from '../stores/useNotificationStore'

const NotificationList = () => {
  const { notifications, set: setNotificationStore } = useNotificationStore((s) => s)
  const reversed = [...notifications].reverse()

  return (
    <div className="pointer-events-none fixed bottom-6 right-4 z-50 flex flex-col gap-2 sm:right-6">
      {reversed.map((n, idx) => (
        <Notification
          key={`${n.message}${idx}`}
          type={n.type}
          message={n.message}
          description={n.description}
          txid={n.txid}
          onHide={() => {
            setNotificationStore((state: any) => {
              const ri = reversed.length - 1 - idx
              state.notifications = [
                ...notifications.slice(0, ri),
                ...notifications.slice(ri + 1),
              ]
            })
          }}
        />
      ))}
    </div>
  )
}

const icons = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-emerald-400">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-rose-400">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-blue-400">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
}

const borderColor: Record<string, string> = {
  success: 'border-emerald-500/30',
  error: 'border-rose-500/30',
  info: 'border-blue-500/30',
}

const Notification = ({ type, message, description, txid, onHide }: any) => {

  useEffect(() => {
    const id = setTimeout(onHide, 6000)
    return () => clearTimeout(id)
  }, [onHide])

  return (
    <div
      className={`pointer-events-auto w-80 overflow-hidden rounded-2xl border ${borderColor[type] ?? 'border-white/10'} bg-[#0F1420]/95 shadow-2xl backdrop-blur-xl`}
      style={{ animation: 'slideIn 0.25s ease-out' }}
    >
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex-shrink-0">{icons[type] ?? icons.info}</span>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{message}</div>

          {description && (
            <p className="mt-0.5 truncate text-xs text-slate-400">
              {description}
            </p>
          )}

          {txid && (
            <a
              href={`https://solscan.io/tx/${txid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {txid.slice(0, 8)}…{txid.slice(-8)}
            </a>
          )}
        </div>

        <button
          onClick={onHide}
          className="mt-0.5 flex-shrink-0 text-slate-600 transition hover:text-slate-300"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M18 6 6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default NotificationList