import { readFile } from 'node:fs/promises';

import {
  serveFilesystem,
  Server,
} from './src/main.mjs';

const server = new Server({
  instances: [
    {
      mode: 'http',
      ip: 'localhost',
      port: 8080,
    },
    {
      mode: 'https',
      ip: 'localhost',
      port: 8443,
      options: {
        cert: await readFile('cert.pem'),
        key: await readFile('key.pem'),
      },
    },
    {
      mode: 'http2',
      ip: 'localhost',
      port: 8443,
      options: {
        cert: await readFile('cert.pem'),
        key: await readFile('key.pem'),
      },
    },
    {
      mode: 'http3',
      ip: 'localhost',
      port: 8443,
      options: {
        cert: await readFile('cert.pem'),
        key: await readFile('key.pem'),
      },
    },
  ],
  requestListener: async (clientRequest) => {
    if (clientRequest.pathMatch('/file/')) {
      await serveFilesystem({
        clientRequest: clientRequest.subRequest('/file/'),
        fsPath: '.',
      });
    } else if (clientRequest.pathMatch('/ws')) {
      // TODO
      await serveWS({});
    } else if (clientRequest.pathMatch('/file.txt')) {
      clientRequest.respond(`plain text ${new Date().toISOString()}`);
    } else {
      clientRequest.respond('not found', { ':status': 404 });
    }
  },
});

await server.listen();

console.log('Server active');
