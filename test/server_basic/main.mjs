import { WebSocketServer } from 'ws';

import {
  serveFile,
  serveFolder,
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

const server = new Server({
  instances: INSTANCES,
  requestListener: async serverRequest => {
    console.log(
      `[${new Date().toISOString()}] ${serverRequest.listenerID} ${serverRequest.ipFamily} [${serverRequest.remoteAddress}]:${serverRequest.remotePort} ${serverRequest.headers[':method']} /${serverRequest.path}`
    );
    
    if (serverRequest.pathIsHostname) {
      serverRequest.respond('Error: connect requests unsupported', { ':status': 405 });
      return;
    }
    
    if (serverRequest.pathMatch('files/')) {
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
    } else if (serverRequest.path == '') {
      await serveFile({
        serverRequest,
        fsPath: 'index.html',
      });
    } else {
      serverRequest.respond('Error: path not found', { ':status': 404 });
    }
  },
});

await server.listen();

console.log('Server active');
