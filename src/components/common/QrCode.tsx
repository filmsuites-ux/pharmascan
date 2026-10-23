import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  text: string;
  size?: number;
  className?: string;
}

export const QrCode: React.FC<QrCodeProps> = ({ text, size = 180, className = '' }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      color: {
        dark: '#020617',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (isMounted) setDataUrl(url);
      })
      .catch((err) => {
        console.error('Failed to generate QR Code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [text, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-slate-800 animate-pulse rounded-xl flex items-center justify-center text-xs text-slate-500 ${className}`}
      >
        Loading QR...
      </div>
    );
  }

  return (
    <div className={`p-2 bg-white rounded-2xl shadow-md inline-block ${className}`}>
      <img
        src={dataUrl}
        alt={`QR code for ${text}`}
        width={size}
        height={size}
        className="block rounded-lg"
      />
    </div>
  );
};
