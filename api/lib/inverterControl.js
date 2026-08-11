import { md5, tumRequest } from './tumcapp.js';
import { buildSettingsCommands, parseInverterSettings, settingCommandConfirmed, settingsConfirmed } from './isolarSettings.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function loginOrigin(username, password) {
  const result = await tumRequest('user/login', {
    params: { username: String(username).trim(), password: md5(password) },
    vrtKey: '', token: ''
  });
  const data = result.payload.data || {};
  const session = {
    token: data.token || result.token,
    vrtKey: data.vrtKey || data.userInfo?.vrtKey
  };
  if (!session.token || !session.vrtKey) throw new Error('El acceso automático respondió sin token o llave de validación.');
  return session;
}

export async function logoutOrigin(session) {
  if (!session?.token || !session?.vrtKey) return;
  try { await tumRequest('user/logout', { token: session.token, vrtKey: session.vrtKey }); } catch {}
}

export async function readInverterSettings(deviceSn, session) {
  const result = await tumRequest('paramSet/getParam', {
    params: { deviceSn }, token: session.token, vrtKey: session.vrtKey
  });
  session.token = result.token;
  return parseInverterSettings(result.payload.data || {});
}

export async function applyInverterTarget(deviceSn, target, session) {
  const before = await readInverterSettings(deviceSn, session);
  const commands = buildSettingsCommands(before, target);
  const commandResults = [];
  let after = before;

  for (const [slot, command] of Object.entries(commands)) {
    const changed = await tumRequest('paramSet/setParam', {
      params: { deviceSn, commands: JSON.stringify({ [slot]: command }) },
      token: session.token,
      vrtKey: session.vrtKey
    });
    session.token = changed.token;
    await sleep(5000);
    let confirmed = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      after = await readInverterSettings(deviceSn, session);
      confirmed = settingCommandConfirmed(after, slot, target);
      if (confirmed) break;
      await sleep(2000);
    }
    commandResults.push({ slot, command, accepted: true, confirmed });
    if (!confirmed) break;
  }

  if (!settingsConfirmed(after, target)) after = await readInverterSettings(deviceSn, session);
  return {
    before,
    after,
    commands,
    commandResults,
    changed: Object.keys(commands).length > 0,
    confirmed: settingsConfirmed(after, target)
  };
}
