import { duplexPair } from 'node:stream';

// causes a 'connection' event to be emitted on wsServer
// with parameters:
// ws: WebSocket
// clientRequest: ClientRequest
export function serveWebSocket({
  clientRequest,
  wsServer,
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
    
    if (clientRequest.internal.mode == 'http' || clientRequest.internal.mode == 'https') {
      clientRequest.respond(
        serveWsEnd,
        {
          ...headers,
          ':status': 101,
        },
      );
      clientRequest.streamReadable.pipe(serveWsEnd);
    } else {
      delete headers['sec-websocket-accept'];
      clientRequest.respond(
        serveWsEnd,
        {
          ...headers,
          ':status': 200,
        },
      );
      clientRequest.streamReadable.pipe(serveWsEnd);
    }
    
    delete handleUpgradeEnd.write;
    delete handleUpgradeEnd.end;
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
    
    clientRequest.respond(
      body,
      {
        ...headers,
        ':status': statusCode,
      },
    );
    
    serveWsEnd.destroy();
    handleUpgradeEnd.destroy();
    delete handleUpgradeEnd.write;
    delete handleUpgradeEnd.end;
  };
  
  wsServer.handleUpgrade(
    {
      method: 'GET',
      headers: {
        ...clientRequest.headers,
        upgrade: 'websocket',
        'sec-websocket-key': clientRequest.headers['sec-websocket-key'] ?? 'aaaaaaaaaaaaaaaaaaaaaa==',
      },
    },
    handleUpgradeEnd,
    Buffer.alloc(0),
    ws => {
      wsServer.emit('connection', ws, clientRequest);
    },
  );
}
