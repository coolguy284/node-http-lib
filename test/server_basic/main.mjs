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
        gracefulShutdownFunc: ws => {
          ws.close();
        },
      });
    } else if (serverRequest.path == 'file.txt') {
      serverRequest.respond(`plain text ${new Date().toISOString()}`);
    } else if (serverRequest.pathMatch('proxy_all/')) {
      const targetedInstance = INSTANCES[0];
      
      serveProxy({
        serverRequest: serverRequest.subRequest('proxy_all/'),
        requestParameters: {
          mode: targetedInstance.mode,
          host: targetedInstance.ip,
          port: targetedInstance.port,
        },
      });
    } else if (serverRequest.pathMatch('proxy_files/')) {
      const targetedInstance = INSTANCES[0];
      
      serveProxy({
        serverRequest: serverRequest.subRequest('proxy_files/'),
        requestParameters: {
          mode: targetedInstance.mode,
          host: targetedInstance.ip,
          port: targetedInstance.port,
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
