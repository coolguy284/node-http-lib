import { WebSocketServer } from 'ws';

import {
  serveFile,
  serveFolder,
  serveProxy,
  Server,
  serveWebSocket,
} from '../../src/main.mjs';

import { INSTANCES } from './server_config.mjs';

const wsServer = new WebSocketServer({ noServer: true });

wsServer.on('connection', ws => {
  ws.on('message', msg => {
    ws.send(`recv ${new Date().toISOString()}; ${msg}`);
  });
});

const PROXY_TARGET_INSTANCE = INSTANCES[0];

await using server = new Server({
  instances: INSTANCES,
  requestListener: async serverRequest => {
    console.log(
      `[${new Date().toISOString()}] ${serverRequest.listenerID} ${serverRequest.ipFamily} [${serverRequest.remoteAddress}]:${serverRequest.remotePort} ${serverRequest.headers[':method']} /${serverRequest.path}`
    );
    
    if (serverRequest.pathIsHostname) {
      serverRequest.respond('Error: connect requests unsupported', { ':status': 405 });
      return;
    }
    
    if (serverRequest.path == '') {
      await serveFile({
        serverRequest,
        fsPath: 'index.html',
      });
    } else if (serverRequest.pathMatch('files/')) {
      await serveFolder({
        serverRequest: serverRequest.subRequest('files/'),
        fsPathPrefix: 'files',
      });
    } else if (serverRequest.path == 'ws') {
      serveWebSocket({
        serverRequest,
        wsServer,
      });
    } else if (serverRequest.path == 'file.txt') {
      serverRequest.respond(`plain text ${new Date().toISOString()}`);
    } else if (serverRequest.pathMatch('proxy_all/')) {
      await serveProxy({
        serverRequest: serverRequest.subRequest('proxy_all/'),
        requestParameters: {
          mode: PROXY_TARGET_INSTANCE.mode,
          host: PROXY_TARGET_INSTANCE.ip,
          port: PROXY_TARGET_INSTANCE.port,
        },
      });
    } else if (serverRequest.pathMatch('proxy_files/')) {
      await serveProxy({
        serverRequest: serverRequest.subRequest('proxy_files/'),
        requestParameters: {
          mode: PROXY_TARGET_INSTANCE.mode,
          host: PROXY_TARGET_INSTANCE.ip,
          port: PROXY_TARGET_INSTANCE.port,
          pathPrefix: 'files/',
        },
      });
    } else {
      serverRequest.respond('Error: path not found', { ':status': 404 });
    }
  },
});

await server.listen();

console.log('Server active');

await new Promise(r => {
  process.once('SIGINT', () => r());
});

console.log('Server closing');
