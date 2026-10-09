import { useMemo, type ReactNode } from 'react';
import QRCode from 'qrcode';

export function ProfileQr({ value, label }: { value: string; label: string }): ReactNode {
  const symbol = useMemo(() => QRCode.create(value, { errorCorrectionLevel: 'M' }), [value]);
  const size = symbol.modules.size;
  const extent = size + 8;
  const squares: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (symbol.modules.data[row * size + column])
        squares.push(`M${column + 4} ${row + 4}h1v1h-1z`);
    }
  }
  return (
    <svg
      viewBox={`0 0 ${extent} ${extent}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={extent} height={extent} fill="#fff" />
      <path d={squares.join('')} fill="#000" />
    </svg>
  );
}
