import { Plus } from 'lucide-react'

export default function Fab({ label, onClick, icon: Icon = Plus }) {
  return (
    <button type="button" className="fab" onClick={onClick} aria-label={label}>
      <Icon size={26} aria-hidden="true" />
    </button>
  )
}
