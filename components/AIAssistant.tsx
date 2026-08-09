import React, { useState } from 'react';
import { StoreData } from '../types';
import { analyzeStoreData } from '../services/geminiService';
import { Sparkles, Send, Bot } from 'lucide-react';

interface Props {
  storeData: StoreData;
}

const AIAssistant: React.FC<Props> = ({ storeData }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResponse('');
    
    const answer = await analyzeStoreData(storeData, query);
    setResponse(answer);
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[600px]">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-blue-600" />
        <h2 className="font-bold text-slate-800">Asistente Inteligente</h2>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {!response && !loading && (
          <div className="text-center text-slate-400 mt-20">
            <Bot className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-slate-500">¿En qué puedo ayudarte hoy?</p>
            <p className="text-sm">Pregunta sobre ventas, inventario o sugerencias para tu negocio.</p>
            
            <div className="mt-8 flex flex-wrap gap-2 justify-center">
              <button onClick={() => setQuery("Resumen de ventas de hoy")} className="bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full text-sm text-slate-600 transition-colors">Resumen de ventas</button>
              <button onClick={() => setQuery("¿Qué producto tiene menos existencias?")} className="bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full text-sm text-slate-600 transition-colors">Bajo inventario</button>
              <button onClick={() => setQuery("Sugiere una estrategia de precios")} className="bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full text-sm text-slate-600 transition-colors">Estrategia</button>
            </div>
          </div>
        )}

        {loading && (
           <div className="flex items-center justify-center h-full">
              <div className="animate-pulse flex flex-col items-center">
                 <div className="h-4 w-4 bg-blue-600 rounded-full mb-2 animate-bounce"></div>
                 <p className="text-blue-600 font-medium">Analizando datos...</p>
              </div>
           </div>
        )}

        {response && (
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                <div className="flex items-start gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg text-blue-700 mt-1">
                        <Bot className="w-5 h-5" />
                    </div>
                    <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-line">
                        {response}
                    </div>
                </div>
            </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 bg-white">
        <div className="flex gap-2 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            placeholder="Ej: ¿Cuánto vendimos en total hoy?"
            className="flex-1 pl-4 pr-12 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button 
            onClick={handleAsk}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-300 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;