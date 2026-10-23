/**
 * 主計總處 ws.dgbas.gov.tw 的檔案。它的 TLS 憑證鏈缺中繼憑證（TWCA Cyber_SSL_2023），
 * Node 自己補上才能連；一般政府網站不需要這樣。
 */
import { get as httpsGet } from 'node:https';
import { rootCertificates } from 'node:tls';

import { fetchRetry } from './fetch-cache.mjs';

const twcaDer = Buffer.from(await (await fetchRetry('http://sslserver.twca.com.tw/cacert/Cyber_SSL_2023.crt')).arrayBuffer());
const twcaPem = `-----BEGIN CERTIFICATE-----\n${twcaDer.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;

/** 抓主計總處的 CSV／XML（回傳字串） */
export function fetchDgbas(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url, { ca: [...rootCertificates, twcaPem] }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`${url} → HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', (d) => chunks.push(d)).on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}
