/** tone: accent | violet | success | danger | muted */
export default function Badge({ tone = 'accent', icon: Icon, children, className = '' }) {
  return (
    <span className={`badge badge-${tone} ${className}`.trim()}>
      {Icon && <Icon size={12} strokeWidth={2.4} aria-hidden="true" />}
      {children}
    </span>
  )
}
