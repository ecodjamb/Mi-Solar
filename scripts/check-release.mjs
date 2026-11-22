import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const contract = json('release.config.json');
const expected = contract.application.version;
const packageJson = json('package.json');
const packageLock = json('package-lock.json');
const versionFile = read('VERSION.txt').trim();
const appConfig = read('src/config.ts');
const api = read('api/index.js');
const changelog = read('CHANGELOG.md');

assert(packageJson.version === expected, `package.json=${packageJson.version}; esperado ${expected}`);
assert(packageLock.version === expected, `package-lock.json=${packageLock.version}; esperado ${expected}`);
assert(packageLock.packages?.['']?.version === expected, `package-lock raíz=${packageLock.packages?.['']?.version}; esperado ${expected}`);
assert(versionFile === expected, `VERSION.txt=${versionFile}; esperado ${expected}`);
assert(appConfig.includes(`APP_VERSION = '${expected}'`), 'src/config.ts no coincide con la versión canónica');
assert(api.includes(`version: '${expected}'`), 'api/index.js no coincide con la versión canónica');
assert(changelog.startsWith(`# Mi Solar v${expected}\n`), 'CHANGELOG.md no comienza con la versión canónica');

const localProjectFile = path.join(root, '.vercel', 'project.json');
if (fs.existsSync(localProjectFile)) {
  const localProject = JSON.parse(fs.readFileSync(localProjectFile, 'utf8'));
  assert(localProject.projectId === contract.vercel.projectId, 'El vínculo local apunta a otro proyecto Vercel');
  assert(localProject.orgId === contract.vercel.orgId, 'El vínculo local apunta a otra organización Vercel');
  assert(localProject.projectName === contract.vercel.projectName, 'El vínculo local tiene otro nombre de proyecto Vercel');
}

const alexa = contract.adjuncts.alexa;
assert(alexa.deploysApplication === false, 'Alexa nunca puede desplegar la aplicación principal');
if (fs.existsSync(path.join(root, alexa.path))) {
  const manifest = json(path.join(alexa.path, 'widget-manifest.json'));
  const widget = read(path.join(alexa.path, 'widget-show5.json'));
  const lambda = read(path.join(alexa.path, 'alexa-hosted-index.cjs'));
  assert(manifest.manifest?.version === alexa.version, `Widget=${manifest.manifest?.version}; esperado ${alexa.version}`);
  assert(widget.includes(`v${alexa.version}`), 'La vista APL no muestra la versión canónica del widget');
  assert(lambda.includes(`version: '${alexa.version}'`), 'La Lambda Alexa no usa la versión canónica del widget');
}

if (failures.length) {
  console.error('Contrato de publicación inválido:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Mi Solar v${expected} · contrato de versión correcto`);
console.log(`Vercel: ${contract.vercel.scope}/${contract.vercel.projectName}`);
console.log(`Alexa v${alexa.version} · complemento sin autoridad de despliegue`);
