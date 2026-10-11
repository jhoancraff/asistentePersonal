export default function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={32} strokeWidth={1.5} aria-hidden="true" />}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}
