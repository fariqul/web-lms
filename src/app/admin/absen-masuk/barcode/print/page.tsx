'use client';

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { staffAttendanceAPI } from '@/services/api';
import { Loader2 } from 'lucide-react';

export default function BarcodePrintPage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    staffAttendanceAPI
      .getBarcodeToken()
      .then((res) => {
        const t = res.data.data.barcode_token;
        setToken(t);
        // Auto-print setelah token siap
        setTimeout(() => {
          window.print();
        }, 300);
      })
      .catch(() => {
        setError(true);
      });
  }, []);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #fff; color: #000; font-family: Arial, sans-serif; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          svg { display: block !important; visibility: visible !important; }
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#fff',
        }}
      >
        {/* Loading */}
        {!token && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <Loader2
              className="animate-spin"
              style={{ width: 48, height: 48, color: '#0d9488' }}
            />
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Memuat barcode…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p style={{ color: '#dc2626', fontSize: '1rem' }}>
            Gagal memuat barcode. Tutup tab ini dan coba lagi.
          </p>
        )}

        {/* Barcode */}
        {token && (
          <>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
                SMA Negeri 15 Makassar
              </p>
              <p style={{ fontSize: '1rem', color: '#475569', marginTop: '0.25rem' }}>
                Absen Masuk Guru &amp; Staff
              </p>
            </div>

            {/* QR Code */}
            <div
              style={{
                padding: '1.5rem',
                background: '#fff',
                border: '2px solid #e2e8f0',
                borderRadius: '1rem',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                marginBottom: '1.25rem',
              }}
            >
              <QRCodeSVG value={token} size={280} level="M" includeMargin={false} />
            </div>

            {/* Instruksi */}
            <div style={{ textAlign: 'center', maxWidth: '340px' }}>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                Arahkan kamera ke barcode ini melalui menu Absen Masuk di aplikasi LMS
              </p>
            </div>

            {/* Tombol print manual (no-print) */}
            <button
              className="no-print"
              onClick={() => window.print()}
              style={{
                marginTop: '2rem',
                padding: '0.75rem 2rem',
                background: '#0d9488',
                color: '#fff',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Print Sekarang
            </button>
          </>
        )}
      </div>
    </>
  );
}
