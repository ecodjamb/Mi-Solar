const OUTPUT_MODES = {
  POP00: 'Utility',
  POP01: 'SOL',
  POP02: 'SBU'
};

const OUTPUT_COMMANDS = {
  Utility: 'POP00',
  SOL: 'POP01',
  SBU: 'POP02'
};

export const SETTINGS_PRESETS = Object.freeze({
  sunny: Object.freeze({ redischarge: 25, output: 'SBU' }),
  cloudy: Object.freeze({ redischarge: 50, output: 'SOL' })
});

export function buildSettingsCommands(current, target) {
  const commands = {};
  if (current?.redischarge?.percent !== target.redischarge) commands.S017 = `PBDC${String(target.redischarge).padStart(3, '0')}`;
  if (current?.output?.mode !== target.output) commands.S05 = OUTPUT_COMMANDS[target.output];
  return commands;
}

export function settingsConfirmed(settings, target) {
  return settings?.redischarge?.percent === target.redischarge && settings?.output?.mode === target.output;
}

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

function leadingNumber(value) {
  const match = String(value ?? '').match(/^\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
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
    const rawRecord = objects.find((item) => Object.hasOwn(item, 'BCRD'));
    const rawValue = rawRecord ? leadingNumber(rawRecord.BCRD) : null;
    if (rawValue != null && rawValue >= 0 && rawValue <= 100) redischargePercent = rawValue;
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
    const rawRecord = objects.find((item) => Object.hasOwn(item, 'PO'));
    const rawValue = rawRecord ? leadingNumber(rawRecord.PO) : null;
    if (rawValue != null) outputMode = ['Utility', 'SOL', 'SBU'][rawValue] || null;
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
