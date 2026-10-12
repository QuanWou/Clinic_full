import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const sourcePath = option('--source');
if (!sourcePath) throw new Error('Provide --source with a private payment configuration file.');
const configPath = path.join(root, '.runtime/main/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
const allowed = ['PAYOS_CLIENT_ID','PAYOS_API_KEY','PAYOS_CHECKSUM_KEY','PAYOS_BASE_URL',
  'BANK_TRANSFER_BANK_CODE','BANK_TRANSFER_BANK_NAME','BANK_TRANSFER_ACCOUNT_NUMBER','BANK_TRANSFER_ACCOUNT_NAME'];
const source = fs.readFileSync(path.resolve(sourcePath), 'utf8').replace(/^\uFEFF/, '');
let supplied = {};
if (path.extname(sourcePath).toLowerCase() === '.json') {
  const parsed = JSON.parse(source);
  supplied = parsed.payments ?? parsed;
} else {
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !allowed.includes(match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value && !value.startsWith('<')) supplied[match[1]] = value;
  }
}
const payments = {};
for (const key of allowed) {
  const value = supplied[key] ?? config.payments?.[key];
  if (typeof value === 'string' && value.trim()) payments[key] = value.trim();
}
for (const key of ['PAYOS_CLIENT_ID','PAYOS_API_KEY','PAYOS_CHECKSUM_KEY']) {
  if (!payments[key]) throw new Error(`Missing ${key} in private payment configuration.`);
}
if (!/^[0-9a-f]{64}$/i.test(payments.PAYOS_CHECKSUM_KEY)) throw new Error('Invalid PAYOS_CHECKSUM_KEY format.');
if (!config.clinic || !config.ports?.web) throw new Error('The local clinic and frontend port must be configured first.');
payments.PAYOS_BASE_URL ??= 'https://api-merchant.payos.vn';
if (new URL(payments.PAYOS_BASE_URL).origin !== 'https://api-merchant.payos.vn') throw new Error('Use the official payOS endpoint for local payment integration.');
payments.CLINIC_PAYMENTS_ENABLED = 'true';
payments.CLINIC_PAYMENTS_CLINIC_ID = config.clinic;
payments.CLINIC_PAYMENTS_PUBLIC_URL = option('--public-url') ?? `http://127.0.0.1:${config.ports.web}`;
const publicUrl = new URL(payments.CLINIC_PAYMENTS_PUBLIC_URL);
if (publicUrl.protocol !== 'https:' && !(publicUrl.protocol === 'http:' && ['127.0.0.1','localhost'].includes(publicUrl.hostname))) throw new Error('The payment public URL must be HTTPS or local loopback.');
payments.CLINIC_PAYMENTS_PUBLIC_URL = publicUrl.origin;
const backup = path.join(root, '.runtime/main/payment-config-backups', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backup, {recursive: true});
fs.copyFileSync(configPath, path.join(backup, 'config.json'));
config.payments = payments;
const temp = configPath + '.payments.tmp';
fs.writeFileSync(temp, JSON.stringify(config, null, 2) + '\n');
fs.renameSync(temp, configPath);
const bankReady = ['BANK_TRANSFER_BANK_CODE','BANK_TRANSFER_BANK_NAME','BANK_TRANSFER_ACCOUNT_NUMBER','BANK_TRANSFER_ACCOUNT_NAME'].every(k => !!payments[k]);
console.log(JSON.stringify({enabled: true, publicUrl: payments.CLINIC_PAYMENTS_PUBLIC_URL, payosConfigured: true, vnpayEnabled: false, bankTransferConfigured: bankReady, credentialsPrinted: false}, null, 2));
