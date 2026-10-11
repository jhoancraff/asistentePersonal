import { api } from './api'

const urlBase64ToUint8Array = (b64) => {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Pide permiso y registra este dispositivo para recibir notificaciones push. */
export async function activarNotificaciones() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if ((await Notification.requestPermission()) !== 'granted') return false

  const { data } = await api.get('/notificaciones/vapid-public-key/')
  if (!data.publicKey) return false

  const registration = await navigator.serviceWorker.ready
  const sub =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    }))
  await api.post('/notificaciones/suscribir/', sub.toJSON())
  return true
}
