import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { TLS_CONFIG_MORE_SECURE_2 } from '../../src/main.mjs';

const TLS_OPTIONS = {
  ...TLS_CONFIG_MORE_SECURE_2,
  
  cert: await readFile(join(import.meta.dirname, 'cert.pem')),
  key: await readFile(join(import.meta.dirname, 'key.pem')),
};

export const INSTANCES = [
  {
    listenerID: 'http',
    mode: 'http',
    ip: 'localhost',
    port: 8080,
  },
  {
    listenerID: 'https',
    mode: 'https',
    ip: 'localhost',
    port: 8443,
    options: {
      ...TLS_OPTIONS,
    },
  },
  {
    listenerID: 'http2',
    mode: 'http2',
    ip: 'localhost',
    port: 8443,
    options: {
      enableConnectProtocol: true,
    },
  },
  /*{
    listenerID: 'http3',
    mode: 'http3',
    ip: 'localhost',
    port: 8443,
    options: {
      ...TLS_OPTIONS,
    },
  },*/
];
