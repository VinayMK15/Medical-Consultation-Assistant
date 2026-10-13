import React from 'react';

export default function Card({ children, className = '', ...props }) {
  return (
    <div
      className={['rounded-2xl border border-slate-200 bg-white p-6 shadow-sm', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', ...props }) {
  return (
    <div className={['mb-4', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '', ...props }) {
  return (
    <h3
      className={['text-lg font-bold text-slate-900', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '', ...props }) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
