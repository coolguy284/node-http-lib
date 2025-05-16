import { constants } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const TLS_OPTIONS = {
  secureOptions:
    constants.SSL_OP_NO_SSLv2 |
    constants.SSL_OP_NO_SSLv3 |
    constants.SSL_OP_NO_TLSv1 |
    constants.SSL_OP_NO_TLSv1_1,
  
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
    'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
    'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
    'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256',
    'TLS_ECDHE_RSA_WITH_ARIA_256_GCM_SHA384',
    'TLS_ECDHE_RSA_WITH_ARIA_128_GCM_SHA256',
    '@STRENGTH',
  ].join(':'),
  
  cert: await readFile('cert.pem'),
  key: await readFile('key.pem'),
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
      cert: await readFile('cert.pem'),
      key: await readFile('key.pem'),
    },
  },*/
];
