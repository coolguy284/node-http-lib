import { readFile } from 'node:fs/promises';

import { WebSocketServer } from 'ws';

import {
  serveFile,
  serveFolder,
  Server,
  serveWS,
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
        cert: await readFile('cert.pem'),
        key: await readFile('key.pem'),
      },
    },
    /*{
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
    {
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
      await serveWS({
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
