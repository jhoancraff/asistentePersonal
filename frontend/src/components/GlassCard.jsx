export default function GlassCard({
  as: Tag = 'div',
  glow = false,
  elevated = false,
  className = '',
  children,
  ...rest
}) {
  const cls = ['glass', glow && 'glow', elevated && 'elevated', className].filter(Boolean).join(' ')
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  )
}
