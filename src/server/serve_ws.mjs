import { duplexPair } from 'node:stream';

// causes a 'connection' event to be emitted on wsServer
// with parameters:
// ws: WebSocket
// serverRequest: ServerRequest
export function serveWebSocket({
  serverRequest,
  wsServer,
  gracefulShutdownFunc = ws => {
    ws.close();
  },
}) {
  let [ serveWsEnd, handleUpgradeEnd ] = duplexPair();
  
  handleUpgradeEnd.setNoDelay = () => {};
  
  handleUpgradeEnd.write = msg => {
    // success
    
    const headerLines = msg.split('\r\n').slice(1, -2);
    
    let headers = Object.fromEntries(
      headerLines
        .map(x => {
          const [ headerName, ...headerValues ] = x.split(': ');
          
          return [headerName.toLowerCase(), headerValues.join(': ')];
        })
    );
    
    if (!('sec-websocket-key' in serverRequest.headers)) {
      delete headers['sec-websocket-accept'];
    }
    
    delete headers.connection;
    delete headers.upgrade;
    
    serverRequest.respond(
      serveWsEnd,
      {
        ...headers,
        ':status':
          serverRequest.internal.mode == 'http1-upgrade' ?
            101 :
            200,
      },
    );
    serverRequest.bodyStream.pipe(serveWsEnd);
    
    delete handleUpgradeEnd.write;
    delete handleUpgradeEnd.end;
    
    const gracefulShutdownPromise = new Promise(r => {
      serverRequest.bodyStream.once('close', () => {
        r();
        serverRequest.server.removeGracefulShutdownPromise(gracefulShutdownPromise);
      });
    });
    
    serverRequest.server.addGracefulShutdownPromise(gracefulShutdownPromise);
  };
  
  handleUpgradeEnd.end = msg => {
    // failure
    
    const [ headerPart, ...bodyParts ] = msg.split('\r\n\r\n');
    
    const body = bodyParts.join('\r\n\r\n');
    
    const [ topLine, ...headerLines ] = headerPart.split('\r\n');
    
    const statusCode = parseInt(topLine.split(' ')[1]);
    const headers = Object.fromEntries(
      headerLines
        .map(x => {
          const [ headerName, ...headerValues ] = x.split(': ');
          
          return [headerName.toLowerCase(), headerValues.join(': ')];
        })
    );
    
    serverRequest.respond(
      body,
      {
        ...headers,
        ':status': statusCode,
      },
    );
    
    delete handleUpgradeEnd.write;
    delete handleUpgradeEnd.end;
    
    serveWsEnd.destroy();
    handleUpgradeEnd.destroy();
  };
  
  wsServer.handleUpgrade(
    {
      method: 'GET',
      headers: {
        ...serverRequest.headers,
        upgrade: 'websocket',
        'sec-websocket-key': serverRequest.headers['sec-websocket-key'] ?? 'aaaaaaaaaaaaaaaaaaaaaa==',
      },
    },
    handleUpgradeEnd,
    Buffer.alloc(0),
    ws => {
      const processedGracefulShutdownFunc = () => {
        if (gracefulShutdownFunc != null) {
          gracefulShutdownFunc(ws);
        }
      };
      
      serverRequest.server.addGracefulShutdownFunc(processedGracefulShutdownFunc);
      
      ws.on('close', () => {
        serverRequest.server.removeGracefulShutdownFunc(processedGracefulShutdownFunc);
      });
      
      wsServer.emit('connection', ws, serverRequest);
    },
  );
}
