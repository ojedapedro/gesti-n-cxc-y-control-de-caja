import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { config } from "dotenv";

config(); // Cargar variables de entorno

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // API del Análisis Financiero Inteligencia Artificial
  app.post("/api/ai/analyze-financials", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "API Key de Gemini no configurada. Por favor, asegúrese de agregarla en el panel de secretos de AI Studio." 
        });
      }

      const { timeframe, summary, dailyFlows, exchangeRate } = req.body;
      if (!summary || !dailyFlows) {
        return res.status(400).json({ error: "Faltan datos financieros requeridos." });
      }

      console.log("Iniciando análisis financiero con Gemini...");
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });

      const prompt = `
        Analiza el flujo de caja del siguiente periodo de tiempo: ${timeframe}.
        Tasa de Cambio actual de referencia: ${exchangeRate || "No establecida"} Bs/USD.
        
        Resumen de Datos del Periodo Seleccionado:
        - Ingresos (Inflow) en Dólares Efectivo: $${summary.totalInflowUsdCash.toFixed(2)}
        - Ingresos (Inflow) en Bolívares Efectivo: ${summary.totalInflowBsCash.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs (Equivalente a $${(summary.totalInflowBsCash / (exchangeRate || 1)).toFixed(2)} USD)
        - Egresos (Outflow) en Dólares Efectivo: $${summary.totalOutflowUsdCash.toFixed(2)}
        - Egresos (Outflow) en Bolívares Efectivo: ${summary.totalOutflowBsCash.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs (Equivalente a $${(summary.totalOutflowBsCash / (exchangeRate || 1)).toFixed(2)} USD)
        - Total General de Ingresos (Convertido a USD): $${summary.totalInflow.toFixed(2)}
        - Total General de Salidas (Convertido a USD): $${summary.totalOutflow.toFixed(2)}
        - Flujo Neto en dólares puros: $${summary.totalNetUsdCash.toFixed(2)}
        - Flujo Neto en bolívares puros: ${summary.totalNetBsCash.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs (Equivalente a $${(summary.totalNetBsCash / (exchangeRate || 1)).toFixed(2)} USD)
        - Flujo Neto de Caja total (Combinado y expresado Equivalente en USD): $${summary.totalNet.toFixed(2)}

        Desglose de flujos diarios (muestra resumida de los movimientos):
        ${JSON.stringify(dailyFlows.slice(0, 20))}

        Contexto importante del negocio:
        Estamos en Venezuela, con un mercado caracterizado por una economía bimonetaria. El flujo de efectivo físico (USD) es muy valorado por su estabilidad pero tiene costos logísticos y de cambio. El flujo de Bolívares Efectivo (Bs) es altamente voluble dada la inflación imperante y el ajuste constante de la tasa de cambio oficial e informal. Un flujo con un alto saldo acumulado o inactivo de Bolívares Efectivo representa un riesgo de pérdida cambiaria si no se rota velozmente (pagando a proveedores, cambiando a divisa o comprando existencias/mercancía de alta rotación).

        Determina de forma inteligente:
        1. El estado global de salud de liquidez del negocio (ej. "Excelente", "Saludable", "Estable", "Atención Requerida", "Crítico") con su respectivo color representativo para alerta (emerald, listados como "emerald", "teal", "blue", "orange", "red").
        2. Breve evaluación analítica global del flujo recopilado en el periodo.
        3. Principales fortalezas detectadas (2 o 3 puntos claros).
        4. Riesgos, pérdidas o vulnerabilidades a vigilar (2 o 3 puntos claros).
        5. Sugerencias operacionales y recomendaciones financieras estratégicas del día a día (3 o 4 puntos de acción específicos).
        6. Proyección u orientación de la tendencia esperada para el flujo de caja del negocio a corto plazo.
      `;

      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
      let response = null;
      let lastError = null;

      for (const modelName of modelsToTry) {
        let attempts = 2;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            console.log(`Llamando a Gemini (${modelName}), intento ${attempt} de ${attempts}...`);
            response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction: "Eres un asesor de economía empresarial y analista de tesorería experto en el mercado de comercio minorista y mayorista venezolano. Das consejos sumamente precisos, pragmáticos e inteligentes sobre liquidez, retención de bolívares frente al dólar y control de egresos. Tu respuesta debe ser EXCLUSIVAMENTE en formato JSON estructurado válido según el esquema indicado.",
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    status: { type: Type.STRING },
                    statusColor: { type: Type.STRING },
                    overview: { type: Type.STRING },
                    strengths: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    risks: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    recommendations: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    trend: { type: Type.STRING }
                  },
                  required: ["status", "statusColor", "overview", "strengths", "risks", "recommendations", "trend"]
                }
              },
            });
            break; // Success, break attempts loop
          } catch (err: any) {
            lastError = err;
            console.warn(`Error con el modelo ${modelName} (intento ${attempt}):`, err.message || err);
            if (attempt < attempts) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }
        if (response) {
          break; // Success, break models loop
        }
      }

      if (!response) {
        throw lastError || new Error("No se pudo obtener respuesta de ningún modelo de Gemini.");
      }

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.error("Error en analyze-financials:", error);
      res.status(500).json({ error: error.message || "Error interno al ejecutar el análisis con Inteligencia Artificial." });
    }
  });

  // Conectar Vite como Middleware de desarrollo
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
