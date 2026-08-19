const BILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    documentType: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    periodStart: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    periodEnd: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    issueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    dueDate: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    previousReading: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    currentReading: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    billedKwh: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    estimatedKwh: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    consumptionIsEstimated: { type: 'boolean' },
    readingStatus: { enum: ['actual', 'estimated', 'pending', 'unavailable'] },
    amountClp: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    customerNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    meterNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    tariffName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    invoiceNumber: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    serviceAddress: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    fixedChargeClp: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    energyChargeClp: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    transportChargeClp: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    otherChargesClp: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    taxesClp: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    chargeItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          amountClp: { type: 'number' },
          category: { enum: ['energy', 'fixed', 'transport', 'public_service', 'tax', 'discount', 'debt', 'interest', 'adjustment', 'other'] },
          includedInEnergyRate: { type: 'boolean' }
        },
        required: ['label', 'amountClp', 'category', 'includedInEnergyRate']
      }
    },
    confidence: { type: 'number' },
    warnings: { type: 'array', items: { type: 'string' } }
  },
  required: [
    'provider', 'documentType', 'periodStart', 'periodEnd', 'issueDate', 'dueDate',
    'previousReading', 'currentReading', 'billedKwh', 'estimatedKwh', 'consumptionIsEstimated', 'readingStatus', 'amountClp', 'customerNumber',
    'meterNumber', 'tariffName', 'invoiceNumber', 'serviceAddress', 'fixedChargeClp',
    'energyChargeClp', 'transportChargeClp', 'otherChargesClp', 'taxesClp', 'chargeItems', 'confidence', 'warnings'
  ]
};

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function validImage(image) {
  return image && typeof image.dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl);
}

export function validateBillImages(images) {
  if (!Array.isArray(images) || images.length < 1 || images.length > 4) throw Object.assign(new Error('Selecciona entre una y cuatro fotografías de la cuenta.'), { status: 400 });
  let totalBytes = 0;
  for (const image of images) {
    if (!validImage(image)) throw Object.assign(new Error('Una de las fotografías no tiene un formato válido.'), { status: 400 });
    const bytes = Math.floor((image.dataUrl.length - image.dataUrl.indexOf(',') - 1) * 0.75);
    if (bytes > 1_200_000) throw Object.assign(new Error('Cada fotografía debe pesar menos de 1,2 MB después de optimizarla.'), { status: 413 });
    totalBytes += bytes;
  }
  if (totalBytes > 2_800_000) throw Object.assign(new Error('Las fotografías superan el límite conjunto de 2,8 MB.'), { status: 413 });
  return images;
}

export function reconcileUtilityBill(extracted) {
  const next = { ...extracted, warnings: Array.isArray(extracted.warnings) ? [...extracted.warnings] : [] };
  const previous = Number(next.previousReading);
  const current = Number(next.currentReading);
  if (next.previousReading != null && next.currentReading != null && Number.isFinite(previous) && Number.isFinite(current)) {
    if (current < previous) {
      next.previousReading = null;
      next.currentReading = null;
      next.warnings.push('Las lecturas detectadas eran incoherentes y se descartaron para revisión manual.');
    } else {
      const difference = Number((current - previous).toFixed(3));
      if (next.billedKwh == null && next.consumptionIsEstimated !== true) next.billedKwh = difference;
      else if (next.billedKwh != null && Math.abs(Number(next.billedKwh) - difference) > Math.max(1, difference * 0.01)) {
        next.warnings.push(`La diferencia de lecturas es ${difference} kWh y no coincide con el consumo facturado detectado.`);
      }
    }
  }
  return next;
}

export async function extractUtilityBill(images) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('La lectura inteligente todavía no está configurada.'), { status: 503 });
  validateBillImages(images);
  const content = [{
    type: 'input_text',
    text: `Analiza todas las imágenes como páginas de una sola cuenta eléctrica chilena. Extrae únicamente información visible y consolida datos repetidos entre páginas. No inventes. Usa fechas ISO YYYY-MM-DD. periodStart y periodEnd deben salir del "período de lectura", "monto del período" o equivalente, nunca de la fecha de emisión o vencimiento. Revisa visualmente ambas fechas una segunda vez y comprueba que el intervalo final sea coherente (habitualmente entre 20 y 45 días); si no lo es, vuelve a leer la imagen y deja una advertencia. Los valores de periodStart/periodEnd y el texto de warnings deben coincidir entre sí. Los montos deben ser números en pesos chilenos sin separadores. billedKwh es exclusivamente el consumo de energía facturado del período, no una lectura ni un precio. amountClp es el total final a pagar, aunque incluya deuda, intereses, repactaciones, ajustes o descuentos.

Para previousReading y currentReading busca específicamente la sección "Mi consumo en el mes actual" y la tabla "Lecturas (kWh)": previousReading corresponde a la fila "Anterior" y currentReading a la fila "Actual". No confundas estos valores con el número de medidor, número de cliente, consumo del período ni fechas. Interpreta formato chileno: el punto separa miles y la coma separa decimales; por ejemplo 44.846,000 significa 44846.000 kWh. Comprueba que currentReading - previousReading coincida aproximadamente con el consumo visible bajo las lecturas; si no coincide, vuelve a leer y advierte. Si una lectura no se ve, devuelve null; jamás la inventes.

energyChargeClp es exclusivamente el cargo variable de electricidad o energía efectivamente consumida durante el período (por ejemplo, "Electricidad consumida"). transportChargeClp es la suma de transporte, transmisión o distribución de esa energía. Estos dos valores forman la base analítica del valor por kWh. Excluye cargo fijo, administración, servicio público, IVA/impuestos, intereses, deuda anterior, repactaciones, convenios, ajustes, redondeos y descuentos. No uses el total a pagar ni un subtotal general. Si no puedes identificar con certeza alguno, devuelve null y adviértelo.

Si la boleta indica consumo estimado, lectura pendiente o una cantidad de kWh asumida por la compañía, registra esa cantidad en estimatedKwh, marca consumptionIsEstimated=true y usa readingStatus='estimated' o 'pending'. billedKwh debe contener solo un consumo facturado que la boleta presente como real; si no existe, devuelve null. Si hay lecturas reales y consumo real, consumptionIsEstimated=false y readingStatus='actual'. Nunca impidas la extracción porque las lecturas estén pendientes: conserva siempre monto final, período y todos los cargos visibles.

En chargeItems registra cada cargo, descuento, impuesto, deuda, repactación, interés y ajuste visible con su texto original. Usa amountClp negativo para descuentos o abonos que aparezcan restando. includedInEnergyRate debe ser true únicamente para las líneas de energía y transporte que forman energyChargeClp + transportChargeClp; para todas las demás debe ser false. fixedChargeClp, otherChargesClp y taxesClp son resúmenes informativos; otherChargesClp debe excluir energía, transporte, cargo fijo e impuestos para evitar duplicarlos. Si un campo no se ve con certeza, devuelve null y explica el motivo en warnings. confidence debe estar entre 0 y 1.`
  }, ...images.map((image) => ({ type: 'input_image', image_url: image.dataUrl, detail: 'high' }))];
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_BILL_MODEL || 'gpt-5.4-mini',
      input: [{ role: 'user', content }],
      store: false,
      text: { format: { type: 'json_schema', name: 'chilean_electricity_bill', strict: true, schema: BILL_SCHEMA } },
      max_output_tokens: 1800
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI HTTP ${response.status}`;
    throw Object.assign(new Error(`No fue posible leer la cuenta: ${message}`), { status: response.status === 429 ? 429 : 502 });
  }
  const text = outputText(payload);
  if (!text) throw Object.assign(new Error('La IA no devolvió datos legibles para esta cuenta.'), { status: 422 });
  try {
    const extracted = reconcileUtilityBill(JSON.parse(text));
    extracted.confidence = Math.max(0, Math.min(1, Number(extracted.confidence || 0)));
    return { extracted, model: payload.model || process.env.OPENAI_BILL_MODEL || 'gpt-5.4-mini', responseId: payload.id || null };
  } catch {
    throw Object.assign(new Error('La IA respondió, pero el formato de los datos no fue válido.'), { status: 502 });
  }
}
