const OUTPUT_MODES = {
  POP00: 'Utility',
  POP01: 'SOL',
  POP02: 'SBU'
};

function visit(value, objects, strings) {
  if (value == null) return;
  if (typeof value === 'string') {
    strings.push(value);
    return;
  }
  if (typeof value !== 'object') return;
  if (!Array.isArray(value)) objects.push(value);
  for (const child of Object.values(value)) visit(child, objects, strings);
}

function numericValue(record) {
  for (const key of ['currentValue', 'selectedValue', 'settingValue', 'paramValue', 'value']) {
    const candidate = Number(record[key]);
    if (Number.isFinite(candidate)) return candidate;
  }
  return null;
}

export function parseInverterSettings(payload) {
  const objects = [];
  const strings = [];
  visit(payload, objects, strings);
  const searchable = [...strings, JSON.stringify(payload)];

  let redischargePercent = null;
  let redischargeCommand = null;
  for (const text of searchable) {
    const match = String(text).match(/PBDC(\d{3})/i);
    if (!match) continue;
    redischargePercent = Number(match[1]);
    redischargeCommand = `PBDC${match[1]}`.toUpperCase();
    break;
  }
  if (redischargePercent == null) {
    const record = objects.find((item) => /S017|battery\s*capacity\s*redischarge|redischarge/i.test(JSON.stringify(item)));
    const candidate = record ? numericValue(record) : null;
    if (candidate != null && candidate >= 0 && candidate <= 100) redischargePercent = candidate;
  }

  let outputCommand = null;
  let outputMode = null;
  for (const text of searchable) {
    const match = String(text).match(/POP0[012]/i);
    if (!match) continue;
    outputCommand = match[0].toUpperCase();
    outputMode = OUTPUT_MODES[outputCommand];
    break;
  }
  if (!outputMode) {
    const record = objects.find((item) => /S05|output\s*(source\s*)?priority/i.test(JSON.stringify(item)));
    const text = record ? JSON.stringify(record) : '';
    const match = text.match(/\b(SBU|SOL|UTILITY)\b/i);
    if (match) outputMode = match[1].toUpperCase() === 'UTILITY' ? 'Utility' : match[1].toUpperCase();
  }

  return {
    redischarge: {
      percent: redischargePercent,
      command: redischargeCommand,
      status: redischargePercent == null ? 'not-found' : 'recognized'
    },
    output: {
      mode: outputMode,
      command: outputCommand,
      status: outputMode == null ? 'not-found' : 'recognized'
    }
  };
}
