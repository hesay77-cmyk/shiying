// Chrome Web Store API v2 for Ruxget releases: check the item's status, upload a store package, submit it for review.
// The service-account key stays outside the repository (default E:\ai\.server-access\cws-service-account.json).
//
//   node scripts/store-publish.cjs status
//   node scripts/store-publish.cjs upload <Ruxget-x.y.z-Chrome-store.zip>
//   node scripts/store-publish.cjs submit --yes        (only after the owner has confirmed this submission)
//
// Environment: RUXGET_CWS_PUBLISHER (publisher ID from the developer dashboard), RUXGET_CWS_KEY (key file),
// RUXGET_CWS_ITEM (item ID; default: the Ruxget extension).
// Listing text, screenshots and privacy answers are not part of this API; they are changed in the dashboard.
const fs = require('node:fs'), crypto = require('node:crypto');
const KEY = process.env.RUXGET_CWS_KEY || 'E:\\ai\\.server-access\\cws-service-account.json';
const ITEM = process.env.RUXGET_CWS_ITEM || 'nlhoddnpmoakgikfpdmdkjmahcaokbcl';
const PUBLISHER = process.env.RUXGET_CWS_PUBLISHER || '';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const API = 'https://chromewebstore.googleapis.com';

const b64url = value => Buffer.from(value).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function token() {
  const key = JSON.parse(fs.readFileSync(KEY, 'utf8'));
  if (key.type !== 'service_account' || !key.private_key || !key.client_email) throw new Error('Not a service-account key: ' + KEY);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({alg: 'RS256', typ: 'JWT'})) + '.' +
    b64url(JSON.stringify({iss: key.client_email, scope: SCOPE, aud: key.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000}));
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key);
  const response = await fetch(key.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + b64url(signature)})
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Token request failed: ' + response.status + ' ' + JSON.stringify(data));
  return {access: data.access_token, email: key.client_email};
}

async function call(access, method, path, body, contentType) {
  const response = await fetch(API + path, {method, headers: {Authorization: 'Bearer ' + access, ...(contentType ? {'Content-Type': contentType} : {})}, body});
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {raw: text.slice(0, 2000)}; }
  if (!response.ok) throw new Error(method + ' ' + path + ' → ' + response.status + ' ' + JSON.stringify(data));
  return data;
}

(async () => {
  const [command, arg, flag] = process.argv.slice(2);
  const {access, email} = await token();
  console.log('Signed in as ' + email);
  if (command === 'token') return;
  if (!PUBLISHER) throw new Error('Set RUXGET_CWS_PUBLISHER to the publisher ID from the developer dashboard');
  const name = '/v2/publishers/' + encodeURIComponent(PUBLISHER) + '/items/' + encodeURIComponent(ITEM);
  if (command === 'status') {
    console.log(JSON.stringify(await call(access, 'GET', name + ':fetchStatus'), null, 2));
  } else if (command === 'upload') {
    if (!arg || !fs.existsSync(arg)) throw new Error('Give the store zip to upload');
    const zip = fs.readFileSync(arg);
    const result = await call(access, 'POST', '/upload' + name + ':upload?uploadType=media', zip, 'application/zip');
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'submit') {
    if (arg !== '--yes' && flag !== '--yes') throw new Error('Submitting for review needs --yes (only after the owner confirmed)');
    console.log(JSON.stringify(await call(access, 'POST', name + ':publish', JSON.stringify({blockOnWarnings: true}), 'application/json'), null, 2));
  } else {
    throw new Error('Commands: token | status | upload <zip> | submit --yes');
  }
})().catch(error => { console.error(String(error.message || error)); process.exit(1); });
