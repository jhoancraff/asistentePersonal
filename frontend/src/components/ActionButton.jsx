import { Loader2 } from 'lucide-react'

/** variant: primary | ghost | danger */
export default function ActionButton({
  variant = 'primary',
  icon: Icon,
  loading = false,
  full = false,
  className = '',
  children,
  disabled,
  ...rest
}) {
  const cls = ['btn', `btn-${variant}`, full && 'btn-full', className].filter(Boolean).join(' ')
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? (
        <Loader2 size={18} className="spin" aria-hidden="true" />
      ) : (
        Icon && <Icon size={18} aria-hidden="true" />
      )}
      {children}
    </button>
  )
}
