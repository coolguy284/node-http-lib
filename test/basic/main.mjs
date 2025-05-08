import {
  serveFilesystem,
  Server,
} from '../../src/main.mjs';

const server = new Server({
  instances: [
    {
      mode: 'http',
      ip: 'localhost',
      port: 8080,
    },
    /*{
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
    },*/
  ],
  requestListener: async clientRequest => {
    console.log(`[${new Date().toISOString()}] ${clientRequest[':method']} /${clientRequest.path}`);
    
    if (clientRequest.pathMatch('file/')) {
      await serveFilesystem({
        clientRequest: clientRequest.subRequest('file/'),
        fsPathPrefix: 'files',
      });
    } else if (clientRequest.path == 'ws') {
      // TODO
      await serveWS({});
    } else if (clientRequest.path == 'file.txt') {
      clientRequest.respond(`plain text ${new Date().toISOString()}`);
    } else if (clientRequest.path == '') {
      clientRequest.respond(
`<!doctype html>
<html>
  <head>
    <title>Index</title>
  </head>
  <body>
    <ul>
      <li><a href = 'file.txt'>file.txt</a></li>
      <li><a href = 'files/'>files</a></li>
    </ul>
  </body>
</html>`,
        {
          ':status': 200,
          'content-type': 'text/html; charset=utf-8',
        },
      );
    } else {
      clientRequest.respond('not found', { ':status': 404 });
    }
  },
});

await server.listen();

console.log('Server active');
