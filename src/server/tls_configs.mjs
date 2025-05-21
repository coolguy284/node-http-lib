import { constants } from 'node:crypto';

// passes the Qualys SSL Labs test
export const TLS_CONFIG_NORMAL = {
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
};

/*export const TLS_CONFIG_SECURE = {
  secureOptions:
    constants.SSL_OP_NO_SSLv2 |
    constants.SSL_OP_NO_SSLv3 |
    constants.SSL_OP_NO_TLSv1 |
    constants.SSL_OP_NO_TLSv1_1 |
    constants.SSL_OP_NO_TLSv1_2,
  
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
    '@SECLEVEL=5',
  ].join(':'),
};*/
