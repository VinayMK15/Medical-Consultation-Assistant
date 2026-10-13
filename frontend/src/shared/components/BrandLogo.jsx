import React from 'react';

/**
 * BrandLogo — Official MedAssist brand logo component.
 *
 * Props:
 *  - size: 'sm' (h-8 w-8), 'md' (h-10 w-10, default), 'lg' (h-12 w-12), 'xl' (h-14 w-14)
 *  - variant:
 *      'mark' (default) -> standalone crisp logo mark (location pin + pulse + cross + road)
 *      'badge'          -> logo mark enclosed in a sleek rounded squircle
 *      'full'           -> full horizontal logo (mark + stylized brand text)
 *  - theme: 'color' (default) | 'white' (for dark surfaces)
 *  - className: additional container classes
 */
export default function BrandLogo({
  size = 'md',
  variant = 'mark',
  theme = 'color',
  className = '',
  alt = 'MedAssist Logo',
}) {
  const sizeMap = {
    xs: 'h-8 w-8',
    sm: 'h-10 w-10',
    md: 'h-12 w-12',
    lg: 'h-14 w-14',
    xl: 'h-16 w-16',
    '2xl': 'h-20 w-20',
  };

  const dimensionClass = sizeMap[size] || sizeMap.md;
  const isWhite = theme === 'white';
  const logoSrc = isWhite ? '/logo-mark-white.png' : '/logo-mark.png';

  if (variant === 'badge') {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-blue-500 to-blue-600 p-1.5 shadow-sm shadow-blue-500/20 ring-1 ring-blue-600/10 ${dimensionClass} ${className}`}
      >
        <img
          src={isWhite ? '/logo-mark-white.png' : '/logo-mark-white.png'}
          alt={alt}
          className="h-full w-full object-contain drop-shadow"
          loading="eager"
        />
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className={`flex items-center gap-2.5 ${className}`}>
        <img
          src={logoSrc}
          alt={alt}
          className={`${dimensionClass} shrink-0 object-contain drop-shadow-sm`}
          loading="eager"
        />
        <span className="text-lg font-bold tracking-tight text-slate-950 leading-tight">
          MedAssist
        </span>
      </div>
    );
  }

  // Default: standalone mark
  return (
    <div className={`flex shrink-0 items-center justify-center ${dimensionClass} ${className}`}>
      <img
        src={logoSrc}
        alt={alt}
        className="h-full w-full object-contain transition-transform duration-200 hover:scale-105 drop-shadow-sm"
        loading="eager"
      />
    </div>
  );
}
