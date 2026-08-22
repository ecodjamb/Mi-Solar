const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

const RECEIPT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    amountClp: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    date: nullableString, institution: nullableString, operationType: nullableString,
    senderName: nullableString, recipientName: nullableString,
    operationId: nullableString, currency: { type: 'string' }, merchant: nullableString,
    detail: nullableString, visibleText: nullableString,
    confidence: { type: 'number' }, warnings: { type: 'array', items: { type: 'string' } }
  },
  required: ['amountClp','date','institution','operationType','senderName','recipientName','operationId','currency','merchant','detail','visibleText','confidence','warnings']
};

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) for (const content of item?.content || []) {
    if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
  }
  return '';
}

export function validateFinancialImage(image) {
  if (!image || typeof image.dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl)) {
    throw Object.assign(new Error('Selecciona una fotografía JPG, PNG o WebP.'), { status: 400 });
  }
  const bytes = Math.floor((image.dataUrl.length - image.dataUrl.indexOf(',') - 1) * 0.75);
  if (bytes < 1 || bytes > 1_450_000) throw Object.assign(new Error('La fotografía debe pesar menos de 1,45 MB.'), { status: 413 });
  return image;
}

export async function extractFinancialReceipt(image) {
  validateFinancialImage(image);
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('La lectura inteligente no está configurada.'), { status: 503 });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_BILL_MODEL || 'gpt-5.4-mini', store: false,
      input: [{ role: 'user', content: [
        { type: 'input_text', text: `Analiza esta fotografía como comprobante financiero familiar chileno: boleta, factura, transferencia, depósito o pago. Extrae solamente información visible. La IA propone campos, no valida autenticidad. Usa fecha ISO YYYY-MM-DD. amountClp es un entero en pesos chilenos; interpreta puntos como separadores de miles. Identifica emisor y receptor sin inventarlos. institution es el banco, comercio o institución visible. operationType debe ser una descripción breve como compra, transferencia, depósito o pago. merchant es el comercio si existe. detail resume el concepto en español para una rendición infantil y fácil de entender. operationId es el número de operación visible. currency debe ser CLP salvo evidencia expresa. visibleText conserva un resumen breve del texto útil. Si falta algo devuelve null y agrega advertencia. confidence entre 0 y 1.` },
        { type: 'input_image', image_url: image.dataUrl, detail: 'high' }
      ] }],
      text: { format: { type: 'json_schema', name: 'family_finance_receipt', strict: true, schema: RECEIPT_SCHEMA } },
      max_output_tokens: 1100
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`No fue posible analizar el comprobante: ${payload?.error?.message || `OpenAI HTTP ${response.status}`}`), { status: response.status === 429 ? 429 : 502 });
  const text = outputText(payload);
  if (!text) throw Object.assign(new Error('La IA no devolvió una propuesta legible.'), { status: 422 });
  try {
    const extracted = JSON.parse(text);
    extracted.amountClp = extracted.amountClp == null ? null : Math.max(0, Math.round(Number(extracted.amountClp)));
    extracted.confidence = Math.max(0, Math.min(1, Number(extracted.confidence || 0)));
    return { extracted, model: payload.model || process.env.OPENAI_BILL_MODEL || 'gpt-5.4-mini', responseId: payload.id || null };
  } catch {
    throw Object.assign(new Error('La respuesta inteligente no tuvo un formato válido.'), { status: 502 });
  }
}
