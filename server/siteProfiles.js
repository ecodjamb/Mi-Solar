const PROFILES = {
  '96342509120972': { key: 'arrayan', label: 'El Arrayán', latitude: -33.347, longitude: -70.515, installedKwp: 8.68 },
  '96322507118828': { key: 'puerto-montt', label: 'Puerto Montt', latitude: -41.4693, longitude: -72.9424, installedKwp: 1.845 }
};

export function automationSiteProfile(deviceSn) {
  return PROFILES[String(deviceSn)] || { key: 'arrayan', label: String(deviceSn), latitude: -33.347, longitude: -70.515, installedKwp: 8.68 };
}
