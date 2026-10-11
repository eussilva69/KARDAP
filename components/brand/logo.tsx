/** Logo oficial (chef corredor) em versão otimizada: 400×143 px, ~50 KB. */
export function KardapLogo({ width = 132, className, alt = "Kardap" }: { width?: number; className?: string; alt?: string }) {
  return (
    <img
      src="/brand/kardap-logo.png"
      alt={alt}
      width={width}
      height={Math.round((width * 143) / 400)}
      className={className}
      decoding="async"
    />
  );
}
