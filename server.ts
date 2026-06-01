import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { config } from "dotenv";

config(); // Cargar variables de entorno

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función de contingencia analítica local experta en bimonetarismo venezolano
function generateLocalFallbackAnalysis(timeframe: string, summary: any, exchangeRate: number | null) {
  const rate = exchangeRate || 1;
  const totalInflow = summary.totalInflow || 0;
  const totalOutflow = summary.totalOutflow || 0;
  const totalNet = summary.totalNet || 0;
  
  const inflowBsInUsd = (summary.totalInflowBsCash || 0) / rate;
  const inflowUsd = summary.totalInflowUsdCash || 0;
  const totalInflowCalculated = inflowBsInUsd + inflowUsd;
  
  const bsRatio = totalInflowCalculated > 0 ? (inflowBsInUsd / totalInflowCalculated) * 100 : 0;
  
  let status = "Saludable";
  let statusColor = "teal";
  let overview = "";
  const strengths: string[] = [];
  const risks: string[] = [];
  const recommendations: string[] = [];
  let trend = "";

  // 1. Determinar el estado y descripción global
  if (totalNet < 0) {
    status = "Atención Requerida";
    statusColor = "orange";
    if (Math.abs(totalNet) > totalInflow * 0.2) {
      status = "Crítico";
      statusColor = "red";
    }
  } else if (totalNet > totalInflow * 0.3) {
    status = "Excelente";
    statusColor = "emerald";
  } else {
    status = "Estable";
    statusColor = "blue";
  }

  // Resumen ejecutivo
  overview = `Análisis financiero bimonetario consolidado para el período de ${timeframe}. Tu negocio reporta ingresos de $${totalInflow.toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD frente a egresos totales de $${totalOutflow.toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD, consolidando un flujo neto de $${totalNet.toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD. Del total captado, el ${(100 - bsRatio).toFixed(1)}% ingresa como flujo orgánico en divisas en efectivo, mientras que el ${bsRatio.toFixed(1)}% se percibe en Bolívares. (Nota: Reporte inteligente de contingencia local optimizado debido a alta demanda temporal en los servidores de IA externos).`;

  // Fortalezas
  if (inflowUsd > 0) {
    strengths.push(`Sólido flujo orgánico de divisas en efectivo ($${inflowUsd.toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD), otorgando liquidez de confianza y alto poder de reposición.`);
  }
  if (totalNet > 0) {
    strengths.push(`Superávit neto acumulado de $${totalNet.toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD, garantizando que el negocio mantiene operaciones sustentables.`);
  } else {
    strengths.push("Alineación rápida de ventas tácticas y despachos de alta rotación para amortiguar la caída del margen operativo.");
  }
  if (bsRatio < 40) {
    strengths.push(`Baja exposición en bolívares virtuales (${bsRatio.toFixed(1)}%), disminuyendo drásticamente el impacto de la devaluación cambiaria.`);
  } else {
    strengths.push("Alta velocidad de captación en pasarelas de cobro local en bolívares, dominando el volumen de transacciones locales.");
  }

  // Riesgos
  if (totalNet < 0) {
    risks.push(`Pérdida en el flujo neto de $${totalNet.toLocaleString("es-VE", { minimumFractionDigits: 2 })} USD. El ritmo de egresos fijos y variables está sobrepasando la recaudación.`);
  }
  if (bsRatio > 40) {
    risks.push(`Exposición al riesgo cambiario: el ${bsRatio.toFixed(1)}% de las ventas son en bolívares. Un estancamiento en la rotación de estos fondos representaría una pérdida por devaluación.`);
  }
  if (summary.totalOutflowUsdCash > summary.totalInflowUsdCash) {
    risks.push(`Déficit de divisas físicas: Las salidas de dólares ($${summary.totalOutflowUsdCash.toLocaleString("es-VE", { minimumFractionDigits: 2 })}) exceden los ingresos directos ($${summary.totalInflowUsdCash.toLocaleString("es-VE", { minimumFractionDigits: 2 })}), erosionando las reservas operativas reales.`);
  }
  if (risks.length === 0) {
    risks.push("Variaciones imprevistas en los costos de reposición de inventario indexado al dólar.");
    risks.push("Costos ocultos y comisiones elevadas en operaciones de cambio de divisas.");
  }

  // Recomendaciones
  if (bsRatio > 25) {
    recommendations.push("Aplicar una regla estricta de 'Vaciado Diario' de Bolívares: convertir saldos e intermediar pagos a proveedores en bolívares a primera hora del día.");
  }
  recommendations.push("Negociar con proveedores estratégicos un esquema de pagos calendarizados o descuentos por pronto pago en divisas para retener flujo.");
  if (totalNet < 0) {
    recommendations.push("Congelar gastos discrecionales inmediatos y reestructurar deudas de inventarios de baja rotación.");
  }
  recommendations.push("Mantener un monitoreo continuo de precios en punto de venta con indexación automática a la tasa de cambio de referencia de Banco Central de Venezuela.");

  // Tendencia
  if (totalNet > 0 && bsRatio < 40) {
    trend = "Alcista y Consolidada: Se proyecta estabilidad con incremento continuo en el fondo líquido de divisas con bajo nivel de devaluación en tus reservas.";
  } else if (totalNet < 0) {
    trend = "A la baja con Alerta Operativa: Existe presión sobre el capital de trabajo de la firma. Se requiere corrección en la estructura corporativa de egresos.";
  } else {
    trend = "Neutral con Sesgo Vigilante: Flujo estable pero muy influenciado por la agilidad y velocidad de rotación de tus posiciones en moneda local.";
  }

  return {
    status,
    statusColor,
    overview,
    strengths,
    risks,
    recommendations,
    trend
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use((req, res, next) => {
    console.log(`[Express] Request received: ${req.method} ${req.url}`);
    next();
  });

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

      const safeSummary = {
        totalInflowUsdCash: Number(summary.totalInflowUsdCash || 0),
        totalInflowBsCash: Number(summary.totalInflowBsCash || 0),
        totalOutflowUsdCash: Number(summary.totalOutflowUsdCash || 0),
        totalOutflowBsCash: Number(summary.totalOutflowBsCash || 0),
        totalInflow: Number(summary.totalInflow || 0),
        totalOutflow: Number(summary.totalOutflow || 0),
        totalNetUsdCash: Number(summary.totalNetUsdCash || 0),
        totalNetBsCash: Number(summary.totalNetBsCash || 0),
        totalNet: Number(summary.totalNet || 0),
        totalOutflowUsdCash: Number(summary.totalOutflowUsdCash || 0)
      };

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
        - Ingresos (Inflow) en Dólares Efectivo: $${safeSummary.totalInflowUsdCash.toFixed(2)}
        - Ingresos (Inflow) en Bolívares Efectivo: ${safeSummary.totalInflowBsCash.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs (Equivalente a $${(safeSummary.totalInflowBsCash / (exchangeRate || 1)).toFixed(2)} USD)
        - Egresos (Outflow) en Dólares Efectivo: $${safeSummary.totalOutflowUsdCash.toFixed(2)}
        - Egresos (Outflow) en Bolívares Efectivo: ${safeSummary.totalOutflowBsCash.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs (Equivalente a $${(safeSummary.totalOutflowBsCash / (exchangeRate || 1)).toFixed(2)} USD)
        - Total General de Ingresos (Convertido a USD): $${safeSummary.totalInflow.toFixed(2)}
        - Total General de Salidas (Convertido a USD): $${safeSummary.totalOutflow.toFixed(2)}
        - Flujo Neto en dólares puros: $${safeSummary.totalNetUsdCash.toFixed(2)}
        - Flujo Neto en bolívares puros: ${safeSummary.totalNetBsCash.toLocaleString("es-VE", { minimumFractionDigits: 2 })} Bs (Equivalente a $${(safeSummary.totalNetBsCash / (exchangeRate || 1)).toFixed(2)} USD)
        - Flujo Neto de Caja total (Combinado y expresado Equivalente en USD): $${safeSummary.totalNet.toFixed(2)}

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

      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
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
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
        if (response) {
          break; // Success, break models loop
        }
      }

      if (!response) {
        console.warn("Todos los intentos con Gemini fallaron o están bajo alta demanda (503). Utilizando generador analítico financiero de contingencia local.");
        const fallbackResult = generateLocalFallbackAnalysis(timeframe, safeSummary, exchangeRate);
        return res.json(fallbackResult);
      }

      const resultText = response.text || "{}";
      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.error("Error en analyze-financials:", error);
      
      const errorStr = String(error.message || error);
      let friendlyError = "Error interno al ejecutar el análisis con Inteligencia Artificial.";
      
      if (errorStr.includes("503") || errorStr.includes("UNAVAILABLE") || errorStr.includes("high demand") || errorStr.includes("temporary")) {
        friendlyError = "El servicio de Inteligencia Artificial (Gemini) está experimentando una alta demanda temporal en sus servidores. Por favor, espere 5 segundos e intente de nuevo haciendo clic en 'Generar Reporte'.";
      } else if (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("limit")) {
        friendlyError = "Se ha alcanzado el límite de peticiones de la Inteligencia Artificial temporalmente. Por favor, espere un minuto antes de volver a intentarlo.";
      } else if (errorStr.includes("API Key") || errorStr.includes("API_KEY")) {
        friendlyError = "La API Key de Gemini no se encuentra configurada en sus secretas o está mal escrita. Por favor verifique el panel de secretos.";
      } else if (errorStr.includes("JSON")) {
        friendlyError = "No se pudo interpretar el análisis estructurado del modelo. Por favor, vuelva a intentarlo.";
      } else {
        friendlyError = `Aviso del servicio: ${errorStr}`;
      }

      res.status(500).json({ error: friendlyError });
    }
  });

  // Conectar Vite como Middleware de desarrollo
  try {
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
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    }).on("error", (err: any) => {
      console.error("SERVER BIND ERROR (e.g. EADDRINUSE):", err);
    });
  } catch (error) {
    console.error("CRITICAL ERROR INITIALIZING VITE MIDDLEWARE:", error);
  }
}

startServer().catch((error) => {
  console.error("CRITICAL FATAL UNHANDLED SERVER EXCEPTION:", error);
});
