import { constants } from 'node:crypto';

export const TLS_CONFIG_UNENCRYPTED_WARNING_INSECURE = {
  ciphers: [
    'NULL',
    'ENULL',
  ],
  
  sessionResumptionWithID: true,
};

// passes the Qualys SSL Labs test
// also requires sending header:
// 'strict-transport-security': 'max-age=31536000', // 1 year
export const TLS_CONFIG_NORMAL = {
  secureOptions:
    constants.SSL_OP_NO_SSLv2 |
    constants.SSL_OP_NO_SSLv3 |
    constants.SSL_OP_NO_TLSv1 |
    constants.SSL_OP_NO_TLSv1_1,
  
  ciphers: [
    constants.defaultCoreCipherList, // contains many ciphers separated by ':' iirc
    '!TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256',
    '!TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384',
    '!ECDHE-ECDSA-AES256-SHA384',
    '!ECDHE-ECDSA-AES256-SHA',
    '!ECDHE-ECDSA-AES128-SHA256',
    '!ECDHE-ECDSA-AES128-SHA',
    '!TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA',
    '!TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA',
    '!TLS_RSA_WITH_AES_256_GCM_SHA384',
    '!TLS_RSA_WITH_AES_256_CCM_8',
    '!TLS_RSA_WITH_AES_256_CCM',
    '!TLS_RSA_WITH_ARIA_256_GCM_SHA384',
    '!TLS_RSA_WITH_AES_128_GCM_SHA256',
    '!TLS_RSA_WITH_AES_128_CCM_8',
    '!TLS_RSA_WITH_AES_128_CCM',
    '!TLS_RSA_WITH_ARIA_128_GCM_SHA256',
    '!TLS_RSA_WITH_AES_256_CBC_SHA256',
    '!TLS_RSA_WITH_AES_128_CBC_SHA256',
    '!TLS_RSA_WITH_AES_256_CBC_SHA',
    '!TLS_RSA_WITH_AES_128_CBC_SHA',
    '@STRENGTH',
  ].join(':'),
  
  sessionResumptionWithID: true,
};

export const TLS_CONFIG_MORE_SECURE_1 = {
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
  ].join(':'),
  
  sessionResumptionWithID: true,
};

export const TLS_CONFIG_MORE_SECURE_2 = {
  secureOptions:
    constants.SSL_OP_NO_SSLv2 |
    constants.SSL_OP_NO_SSLv3 |
    constants.SSL_OP_NO_TLSv1 |
    constants.SSL_OP_NO_TLSv1_1 |
    constants.SSL_OP_NO_TLSv1_2,
  
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
    'TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256',
    'TLS_ECDHE_RSA_WITH_ARIA_256_GCM_SHA384',
    '@STRENGTH',
    '@SECLEVEL=3',
  ].join(':'),
  
  sessionResumptionWithID: true,
};
