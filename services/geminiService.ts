import { GoogleGenAI } from "@google/genai";
import { StoreData } from "../types";

const apiKey = process.env.API_KEY || '';

// Initialize the client only if the key is available, but handle it gracefully in the function
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const analyzeStoreData = async (data: StoreData, query: string): Promise<string> => {
  if (!ai) {
    return "API Key no configurada. Por favor verifica las variables de entorno.";
  }

  try {
    // Prepare a summary of the data to avoid token limits if data is huge
    // For this app, we'll assume manageable data size or truncate
    const salesSummary = data.sales.slice(-50).map(s => ({
      date: new Date(s.timestamp).toLocaleDateString(),
      totalUSD: s.totalUSD,
      method: s.paymentMethod,
      items: s.items.map(i => `${i.quantity}x ${i.name}`).join(', ')
    }));

    const inventorySummary = data.inventory.map(p => ({
      name: p.name,
      stock: p.stock,
      category: p.category
    }));

    const context = `
      Eres un asistente experto en negocios para una tienda minorista en Venezuela.
      
      Datos actuales del negocio:
      - Tasa de Cambio actual: ${data.exchangeRate} BsF/USD
      - Inventario (Resumen): ${JSON.stringify(inventorySummary)}
      - Últimas 50 Ventas: ${JSON.stringify(salesSummary)}

      Responde a la siguiente pregunta del usuario basándote en estos datos.
      Sé conciso, profesional y útil. Si te piden sugerencias, sé estratégico.
      
      Pregunta: ${query}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: context,
    });

    return response.text || "No se pudo generar una respuesta.";
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return "Ocurrió un error al consultar a la IA. Inténtalo de nuevo.";
  }
};