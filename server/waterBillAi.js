const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

const CHARGE_ITEM = {
  type: 'object', additionalProperties: false,
  properties: {
    label: { type: 'string' }, cubicMeters: nullableNumber, amountClp: { type: 'number' },
    category: { enum: ['fixed','potable_water','sewer_collection','wastewater_treatment','tax','discount','agreement','debt','interest','adjustment','other'] }
  },
  required: ['label','cubicMeters','amountClp','category']
};

const WATER_BILL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    provider: nullableString, documentType: nullableString, invoiceNumber: nullableString, billingMonth: nullableString,
    periodStart: nullableString, periodEnd: nullableString, issueDate: nullableString, dueDate: nullableString, nextReadingDate: nullableString,
    previousReadingM3: nullableNumber, currentReadingM3: nullableNumber, readingDifferenceM3: nullableNumber,
    deductibleM3: nullableNumber, billedM3: nullableNumber,
    readingStatus: { enum: ['actual','estimated','pending','unavailable'] }, consumptionIsEstimated: { type: 'boolean' },
    amountClp: nullableNumber, customerNumber: nullableString, meterNumber: nullableString, meterBrand: nullableString, meterModel: nullableString,
    serviceAddress: nullableString, fixedChargeClp: nullableNumber, potableWaterChargeClp: nullableNumber,
    sewerCollectionChargeClp: nullableNumber, wastewaterTreatmentChargeClp: nullableNumber,
    subtotalServiceClp: nullableNumber, taxesClp: nullableNumber, otherChargesClp: nullableNumber, discountsClp: nullableNumber,
    chargeItems: { type: 'array', items: CHARGE_ITEM }, confidence: { type: 'number' }, warnings: { type: 'array', items: { type: 'string' } }
  },
  required: ['provider','documentType','invoiceNumber','billingMonth','periodStart','periodEnd','issueDate','dueDate','nextReadingDate','previousReadingM3','currentReadingM3','readingDifferenceM3','deductibleM3','billedM3','readingStatus','consumptionIsEstimated','amountClp','customerNumber','meterNumber','meterBrand','meterModel','serviceAddress','fixedChargeClp','potableWaterChargeClp','sewerCollectionChargeClp','wastewaterTreatmentChargeClp','subtotalServiceClp','taxesClp','otherChargesClp','discountsClp','chargeItems','confidence','warnings']
};

const METER_READING_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    readingM3: nullableNumber, wholeCubicMeters: nullableNumber, liters: nullableNumber,
    meterBrand: nullableString, meterNumber: nullableString, confidence: { type: 'number' },
    warnings: { type: 'array', items: { type: 'string' } }
  },
  required: ['readingM3','wholeCubicMeters','liters','meterBrand','meterNumber','confidence','warnings']
};

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const item of payload?.output || []) for (const content of item?.content || []) {
    if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
  }
  return '';
}

function validImage(image) {
  return image && typeof image.dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image.dataUrl);
}

const SPANISH_MONTHS = { ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06', JUL: '07', AGO: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12' };

function isoSpanishDate(day, month, year) {
  const numericMonth = SPANISH_MONTHS[String(month || '').toUpperCase()];
  return numericMonth ? `${year}-${numericMonth}-${day}` : null;
}

export function reconcileWaterBill(extracted) {
  const notes = Array.isArray(extracted.warnings) ? extracted.warnings.join(' ') : '';
  const readingDates = notes.match(/LECTURA ANTERIOR\s+(\d{2})-([A-ZÁÉÍÓÚ]{3})-(\d{4}).*?LECTURA ACTUAL\s+(\d{2})-([A-ZÁÉÍÓÚ]{3})-(\d{4})/i);
  if (readingDates) {
    extracted.periodStart = isoSpanishDate(readingDates[1], readingDates[2], readingDates[3]) || extracted.periodStart;
    extracted.periodEnd = isoSpanishDate(readingDates[4], readingDates[5], readingDates[6]) || extracted.periodEnd;
  }
  const hasReadingDates = /^\d{4}-\d{2}-\d{2}$/.test(String(extracted.periodStart || '')) && /^\d{4}-\d{2}-\d{2}$/.test(String(extracted.periodEnd || ''));
  const previous = extracted.previousReadingM3 == null ? Number.NaN : Number(extracted.previousReadingM3);
  const current = extracted.currentReadingM3 == null ? Number.NaN : Number(extracted.currentReadingM3);
  const hasMeterPair = Number.isFinite(previous) && Number.isFinite(current) && current >= previous;
  extracted.readingStatus = hasReadingDates && hasMeterPair ? 'actual' : 'estimated';
  extracted.consumptionIsEstimated = !(hasReadingDates && hasMeterPair);
  if (!hasReadingDates || !hasMeterPair) {
    extracted.warnings = [...(extracted.warnings || []), 'Mi Solar clasificará el consumo como estimado porque faltan dos lecturas fechadas y verificables.'];
  }
  const total = Number(extracted.amountClp);
  const subtotal = Number(extracted.subtotalServiceClp);
  const discounts = Math.max(0, Number(extracted.discountsClp) || 0);
  const ancillary = Array.isArray(extracted.chargeItems)
    ? extracted.chargeItems.filter((item) => ['agreement','debt','interest','adjustment','other'].includes(item.category))
    : [];
  const expectedOther = total - subtotal + discounts;
  if (Number.isFinite(expectedOther) && expectedOther >= 0 && ancillary.length === 1 && Math.abs(Number(ancillary[0].amountClp) - expectedOther) > 1) {
    ancillary[0].amountClp = expectedOther;
    extracted.otherChargesClp = expectedOther;
    extracted.warnings = [...(extracted.warnings || []), 'Un cargo accesorio fue reconciliado con subtotal, descuento y total final.'];
  }
  return extracted;
}

export function validateWaterImages(images, max = 4) {
  if (!Array.isArray(images) || images.length < 1 || images.length > max) throw Object.assign(new Error(`Selecciona entre una y ${max} fotografías.`), { status: 400 });
  let totalBytes = 0;
  for (const image of images) {
    if (!validImage(image)) throw Object.assign(new Error('Una fotografía no tiene un formato válido.'), { status: 400 });
    const bytes = Math.floor((image.dataUrl.length - image.dataUrl.indexOf(',') - 1) * 0.75);
    if (bytes > 1_200_000) throw Object.assign(new Error('Cada fotografía debe pesar menos de 1,2 MB después de optimizarla.'), { status: 413 });
    totalBytes += bytes;
  }
  if (totalBytes > 2_800_000) throw Object.assign(new Error('Las fotografías superan el límite conjunto de 2,8 MB.'), { status: 413 });
  return images;
}

async function structuredVision(images, prompt, schema, schemaName, maxTokens = 2200) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('La lectura inteligente todavía no está configurada.'), { status: 503 });
  const content = [{ type: 'input_text', text: prompt }, ...images.map((image) => ({ type: 'input_image', image_url: image.dataUrl, detail: 'high' }))];
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_BILL_MODEL || 'gpt-5.4-mini', input: [{ role: 'user', content }], store: false,
      text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } }, max_output_tokens: maxTokens
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`No fue posible analizar la imagen: ${payload?.error?.message || `OpenAI HTTP ${response.status}`}`), { status: response.status === 429 ? 429 : 502 });
  const text = outputText(payload);
  if (!text) throw Object.assign(new Error('La IA no devolvió datos legibles.'), { status: 422 });
  try {
    const extracted = JSON.parse(text);
    extracted.confidence = Math.max(0, Math.min(1, Number(extracted.confidence || 0)));
    if (schemaName === 'chilean_water_bill') reconcileWaterBill(extracted);
    return { extracted, model: payload.model || process.env.OPENAI_BILL_MODEL || 'gpt-5.4-mini', responseId: payload.id || null };
  } catch {
    throw Object.assign(new Error('La IA respondió, pero el formato no fue válido.'), { status: 502 });
  }
}

export async function extractWaterBill(images) {
  validateWaterImages(images, 4);
  return structuredVision(images, `Analiza todas las imágenes como páginas de una sola boleta chilena de agua potable, normalmente Aguas Andinas. Extrae solo información visible y consolida páginas repetidas. Usa fechas ISO YYYY-MM-DD y montos CLP sin separadores.

billingMonth identifica el mes comercial de esta única boleta y debe usar formato YYYY-MM-01. Derívalo del mes de emisión o del mes de la lectura actual; cada mes tiene una boleta independiente. El período periodStart/periodEnd es distinto: representa exactamente el intervalo entre los campos rotulados LECTURA ANTERIOR y LECTURA ACTUAL. Nunca uses emisión, vencimiento, último pago ni próxima lectura como intervalo de lecturas. Interpreta sin ambigüedad los meses españoles: ENE=01, FEB=02, MAR=03, ABR=04, MAY=05, JUN=06, JUL=07, AGO=08, SEP=09, OCT=10, NOV=11, DIC=12. Por ejemplo, 17-ENE-2026 es 2026-01-17 y jamás julio. En números chilenos, un punto entre miles es separador de miles: "7.876 m3" significa 7876 m3, no 7.876. previousReadingM3 y currentReadingM3 son lecturas acumuladas. readingDifferenceM3 es su diferencia visible. deductibleM3 son m3 ya cobrados mediante estimaciones de boletas mensuales anteriores. billedM3 es el consumo finalmente facturado en esta boleta: diferencia menos esos consumos estimados cuando corresponda. No confundas estos valores ni distribuyas billedM3 entre todos los meses del intervalo.

  Decide el tipo de consumo por evidencia, no por apariencia: solo usa readingStatus='actual' y consumptionIsEstimated=false cuando existan las fechas de LECTURA ANTERIOR y LECTURA ACTUAL junto con ambos valores acumulados del medidor. Si falta cualquiera de esas cuatro evidencias, usa readingStatus='estimated' y consumptionIsEstimated=true, aunque la boleta muestre m³ facturados. Si hay lecturas reales separadas por varios meses y la empresa descuenta consumos estimados ya cobrados, sigue siendo una lectura real conciliada: conserva deductibleM3 y billedM3 tal como aparecen. Nunca bloquees por datos faltantes.

Registra en chargeItems cada cargo o descuento que compone el total, conservando su nombre: cargo fijo, agua potable, recolección de aguas servidas, tratamiento, impuestos cobrados aparte, descuentos, convenios, deuda, intereses, ajustes y otros. No repitas en chargeItems las líneas de resumen SUBTOTAL, TOTAL SERVICIO, TOTAL VENTA, TOTAL IVA o TOTAL A PAGAR. Los descuentos deben ser negativos. Los campos resumidos no deben mezclar convenio/deuda con el costo del servicio. Si el documento dice explícitamente "El IVA de esta Boleta es $X", taxesClp debe ser exactamente X aunque esté incluido dentro del subtotal y no se sume nuevamente al total. otherChargesClp agrupa cargos no incluidos en los campos específicos, sin duplicarlos. discountsClp debe ser el total positivo de las rebajas. amountClp es siempre el total final a pagar. meterNumber debe provenir solo del campo rotulado "Número de medidor"; no confundas RUTA, MEC ni número de cuenta con el medidor.

Revisa la coherencia aritmética entre lecturas, diferencia, descuentos, consumo facturado, subtotales y total. Si un dato no es legible, usa null y explica en warnings. confidence entre 0 y 1.`, WATER_BILL_SCHEMA, 'chilean_water_bill');
}

export async function extractWaterMeterReading(image) {
  validateWaterImages([image], 1);
  return structuredVision([image], `Lee exclusivamente el visor numérico de un medidor de agua. Los dígitos negros representan metros cúbicos enteros; los dígitos rojos representan litros y son decimales del metro cúbico. Devuelve wholeCubicMeters con los dígitos negros, liters con los rojos si son legibles, y readingM3 como wholeCubicMeters + liters/1000. Ejemplo: negro 0410 y rojo 19 equivale a 410.019 m3. No confundas números impresos del medidor, serie, etiquetas o relojes pequeños con la lectura. Si el visor no es legible, devuelve null y una advertencia; nunca inventes.`, METER_READING_SCHEMA, 'water_meter_reading', 900);
}
