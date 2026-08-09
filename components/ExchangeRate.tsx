import React, { useState } from 'react';
import { Currency } from '../types';
import { RefreshCw, Calculator, DollarSign, ArrowRightLeft } from 'lucide-react';

interface Props {
  rate: number;
  onUpdateRate: (newRate: number) => void;
}

const ExchangeRate: React.FC<Props> = ({ rate, onUpdateRate }) => {
  const [inputRate, setInputRate] = useState<string>(rate.toString());
  const [calcAmount, setCalcAmount] = useState<string>('');
  const [calcDirection, setCalcDirection] = useState<'USD_TO_BSF' | 'BSF_TO_USD'>('USD_TO_BSF');

  const handleUpdate = () => {
    const val = parseFloat(inputRate);
    if (!isNaN(val) && val > 0) {
      onUpdateRate(val);
    }
  };

  const calculateConversion = () => {
    const val = parseFloat(calcAmount);
    if (isNaN(val)) return 0;
    if (calcDirection === 'USD_TO_BSF') return val * rate;
    return val / rate;
  };

  const quickAmounts = [1, 5, 10, 20, 50, 100];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Rate Management */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-800">Tasa del Día</h2>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
            <span className="text-blue-800 font-medium">Tasa Actual</span>
            <span className="text-2xl font-bold text-blue-700">{rate.toLocaleString('es-VE')} BsF</span>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              value={inputRate}
              onChange={(e) => setInputRate(e.target.value)}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Nueva tasa"
            />
            <button
              onClick={handleUpdate}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* Calculator */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-800">Calculadora Rápida</h2>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setCalcDirection('USD_TO_BSF')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                calcDirection === 'USD_TO_BSF' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              USD ➔ BsF
            </button>
            <button
              onClick={() => setCalcDirection('BSF_TO_USD')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                calcDirection === 'BSF_TO_USD' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              BsF ➔ USD
            </button>
          </div>

          <div className="relative">
             <input
              type="number"
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
              className="w-full pl-4 pr-12 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg"
              placeholder="Cantidad"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                {calcDirection === 'USD_TO_BSF' ? 'USD' : 'BsF'}
            </span>
          </div>

          <div className="flex items-center justify-center p-4 bg-blue-50 rounded-lg border border-blue-100">
             <ArrowRightLeft className="w-5 h-5 text-blue-400 mr-3" />
             <span className="text-2xl font-bold text-blue-800">
                {calculateConversion().toLocaleString('es-VE', { maximumFractionDigits: 2 })}
                <span className="text-sm ml-1 font-normal text-blue-600">
                    {calcDirection === 'USD_TO_BSF' ? 'BsF' : 'USD'}
                </span>
             </span>
          </div>

          {calcDirection === 'USD_TO_BSF' && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {quickAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setCalcAmount(amt.toString())}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-sm transition-colors"
                >
                  ${amt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExchangeRate;