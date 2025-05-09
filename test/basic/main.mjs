import { constants } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { WebSocketServer } from 'ws';

import {
  serveFile,
  serveFolder,
  Server,
  serveWebSocket,
} from '../../src/main.mjs';

const wsServer = new WebSocketServer({ noServer: true });

wsServer.on('connection', ws => {
  ws.on('message', msg => {
    ws.send(`recv ${new Date().toISOString()}; ${msg}`);
  });
});

const server = new Server({
  instances: [
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
      },
    },
    {
      listenerID: 'http2',
      mode: 'http2',
      ip: 'localhost',
      port: 8443,
      options: {
        // can omit, as first server with this ip/port combination will set the TLS options
        //cert: await readFile('cert.pem'),
        //key: await readFile('key.pem'),
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
  ],
  requestListener: async clientRequest => {
    console.log(
      `[${new Date().toISOString()}] ${clientRequest.listenerID} ${clientRequest.ipFamily} [${clientRequest.remoteAddress}]:${clientRequest.remotePort} ${clientRequest.headers[':method']} /${clientRequest.path}`
    );
    
    if (clientRequest.pathIsHostname) {
      clientRequest.respond('Error: connect requests unsupported', { ':status': 405 });
      return;
    }
    
    if (clientRequest.pathMatch('files/')) {
      await serveFolder({
        clientRequest: clientRequest.subRequest('files/'),
        fsPathPrefix: 'files',
      });
    } else if (clientRequest.path == 'ws') {
      serveWebSocket({
        clientRequest,
        wsServer,
      });
    } else if (clientRequest.path == 'file.txt') {
      clientRequest.respond(`plain text ${new Date().toISOString()}`);
    } else if (clientRequest.path == '') {
      await serveFile({
        clientRequest,
        fsPath: 'index.html',
      });
    } else {
      clientRequest.respond('Error: path not found', { ':status': 404 });
    }
  },
});

await server.listen();

console.log('Server active');
