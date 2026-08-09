import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X } from 'lucide-react';

interface Props {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const BarcodeScanner: React.FC<Props> = ({ onScanSuccess, onClose }) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Prevent double initialization in strict mode
    if (initializedRef.current) return;
    initializedRef.current = true;

    // Use a slight timeout to ensure DOM is ready and clear previous instances if any
    const timer = setTimeout(() => {
        const scanner = new Html5QrcodeScanner(
        "reader",
        { 
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
        },
        /* verbose= */ false
        );

        scannerRef.current = scanner;

        scanner.render(
        (decodedText) => {
            // Success callback
            onScanSuccess(decodedText);
            // Don't manually clear here to avoid race conditions with unmount, allow parent to close
        },
        (errorMessage) => {
            // Error callback (ignore for cleaner logs)
        }
        );
    }, 100);

    // Cleanup
    return () => {
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
            scannerRef.current.clear().catch(err => console.warn("Scanner clear error:", err));
        } catch (e) {
            console.warn("Scanner cleanup failed", e);
        }
      }
      initializedRef.current = false;
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
      <div className="bg-white rounded-xl overflow-hidden w-full max-w-md relative animate-fade-in shadow-2xl">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800">Escanear Código</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        {/* Container for the scanner - White background to ensure text is visible */}
        <div className="p-4 bg-white min-h-[350px] flex flex-col justify-center">
            {/* Custom Styles to hide ugly default buttons from library */}
            <style>{`
                #reader__dashboard_section_csr span { display: none !important; }
                #reader__dashboard_section_swaplink { display: none !important; }
            `}</style>
          <div id="reader" className="w-full"></div>
        </div>

        <div className="p-4 text-center text-sm text-slate-500 bg-slate-50 border-t border-slate-100">
          Apunta la cámara al código de barras del producto.
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;