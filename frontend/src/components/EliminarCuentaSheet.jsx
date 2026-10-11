import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import ActionButton from './ActionButton'
import BottomSheet from './BottomSheet'

/** Confirmación para eliminar una cuenta (y sus movimientos). `cuenta` nulo = cerrado. */
export default function EliminarCuentaSheet({
  cuenta,
  cuentas = [],
  movimientos = [],
  onClose,
  onEliminada,
}) {
  const [eliminando, setEliminando] = useState(false)
  const [error, setError] = useState('')

  const nMovs = cuenta ? movimientos.filter((m) => m.cuenta === cuenta.id).length : 0
  const tarjetas = cuenta ? cuentas.filter((c) => c.cuenta_madre === cuenta.id) : []

  async function confirmar() {
    setEliminando(true)
    setError('')
    try {
      await api.delete(`/finanzas/cuentas/${cuenta.id}/`)
      onEliminada()
    } catch {
      setError('No se pudo eliminar la cuenta. Intenta de nuevo.')
    } finally {
      setEliminando(false)
    }
  }

  return (
    <BottomSheet open={Boolean(cuenta)} onClose={onClose} title="Eliminar cuenta">
      <p>
        Vas a eliminar <strong>{cuenta?.nombre}</strong>
        {nMovs > 0 ? ` y sus ${nMovs} movimientos` : ''}. Esta acción no se puede deshacer.
      </p>
      {tarjetas.length > 0 && (
        <p className="muted">
          Sus {tarjetas.length === 1 ? 'tarjeta vinculada se conserva' : 'tarjetas vinculadas se conservan'},
          pero quedarán sin cuenta madre.
        </p>
      )}
      <p className="muted">
        Si solo quieres dejar de contarla en tu balance, edítala y desactívala en lugar de eliminarla.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <ActionButton variant="danger" full icon={Trash2} loading={eliminando} onClick={confirmar}>
        Eliminar definitivamente
      </ActionButton>
      <ActionButton variant="ghost" full onClick={onClose}>
        Cancelar
      </ActionButton>
    </BottomSheet>
  )
}
