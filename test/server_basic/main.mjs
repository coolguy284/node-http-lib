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
      });
    } else if (serverRequest.path == 'file.txt') {
      serverRequest.respond(`plain text ${new Date().toISOString()}`);
    } else if (serverRequest.pathMatch('proxy_files/')) {
      await serveProxy({
        serverRequest: serverRequest.subRequest('proxy_files/'),
        requestParameters: {
          mode: INSTANCES[0].mode,
          host: INSTANCES[0].ip,
          port: INSTANCES[0].port,
          pathPrefix: 'files/',
        },
      });
    } else if (serverRequest.pathMatch('proxy_all_http/')) {
      await serveProxy({
        serverRequest: serverRequest.subRequest('proxy_all_http/'),
        requestParameters: {
          mode: INSTANCES[0].mode,
          host: INSTANCES[0].ip,
          port: INSTANCES[0].port,
        },
      });
    } else if (serverRequest.pathMatch('proxy_all_https/')) {
      await serveProxy({
        serverRequest: serverRequest.subRequest('proxy_all_https/'),
        requestParameters: {
          mode: INSTANCES[1].mode,
          host: INSTANCES[1].ip,
          port: INSTANCES[1].port,
        },
      });
    } else if (serverRequest.pathMatch('proxy_all_http2/')) {
      await serveProxy({
        serverRequest: serverRequest.subRequest('proxy_all_http2/'),
        requestParameters: {
          mode: INSTANCES[2].mode,
          host: INSTANCES[2].ip,
          port: INSTANCES[2].port,
        },
      });
    } /*else if (serverRequest.pathMatch('proxy_all_http3/')) {
      await serveProxy({
        serverRequest: serverRequest.subRequest('proxy_all_http3/'),
        requestParameters: {
          mode: INSTANCES[3].mode,
          host: INSTANCES[3].ip,
          port: INSTANCES[3].port,
        },
      });
    }*/ else {
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
