import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const usersPage=readFileSync(new URL('../src/components/UsersPage.tsx',import.meta.url),'utf8');
const userAdmin=readFileSync(new URL('../server/userAdmin.js',import.meta.url),'utf8');
const api=readFileSync(new URL('../api/index.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/styles/app.css',import.meta.url),'utf8');

assert.match(usersPage,/function newUserIssue\(form:NewUserForm\)/);
assert.match(usersPage,/Array\.from\(form\.password\)\.length/);
assert.match(usersPage,/<form className="panel user-create-form" noValidate onSubmit=\{create\}>/);
assert.match(usersPage,/className=\{`user-create-status \$\{createIssue\?'pending':'ready'\}`\}/);
assert.match(usersPage,/aria-live="polite"/);
assert.match(usersPage,/Datos completos\. Ya puedes guardar el usuario\./);
assert.match(usersPage,/>\{busy\?'Guardando usuario…':'Guardar usuario'\}<\/button>/);
assert.doesNotMatch(usersPage,/disabled=\{busy\|\|form\.password\.length!==8\}/);
assert.match(userAdmin,/identityDb\('user_by_username',\s*\{ username \}\)/);
assert.match(userAdmin,/error\.status = 409/);
assert.match(userAdmin,/ya existe\. Puedes editarlo o restablecer su acceso/);
assert.match(api,/createUser\(parseBody\(req\),\s*actor\.user\.id\)/);
assert.match(styles,/\.user-create-status\.pending/);
assert.match(styles,/\.user-create-status\.ready/);

console.log('user creation tests: ok');
