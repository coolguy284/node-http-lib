import { request } from '../client/client.mjs';
import { Enum } from '../lib/enum.mjs';
import { awaitEventOrError } from '../lib/event_emitter_promise.mjs';

export const PROXY_MODE = Enum([
  'PASSTHROUGH',
  'NOT_EXPECTING_PROXIED_REQUEST',
  'NOT_EXPECTING_PROXIED_REQUEST_SILENT_FIX',
  'EXPECTING_PROXIED_REQUEST_FORWARDED_HEADER',
  'EXPECTING_PROXIED_REQUEST_X_FORWARDED_HEADERS',
]);

export async function serveProxyStaticEndpoint({
  serverRequest,
  requestParameters,
  proxyMode = PROXY_MODE.PASSTHROUGH,
  sendForwardedHeader = false,
  sendXForwardedHeaders = false,
  forwardingSendBy = false,
  forwardingSendFor = false,
  forwardingSendHost = false,
  forwardingSendProto = false,
  errorIfErrorStatusCode = false,
  gracefulShutdownFunc = ({ serverRequest, clientRequest }) => {
    serverRequest.bodyStream.destroy();
    clientRequest.bodyStream.destroy();
  },
}) {
  let processedHeaders = { ...serverRequest.headers };
  
  switch (proxyMode) {
    case PROXY_MODE.PASSTHROUGH:
      break;
    
    case PROXY_MODE.NOT_EXPECTING_PROXIED_REQUEST:
      if ('forwarded' in processedHeaders) {
        throw new Error('unexpected proxy header in request headers: forwarded');
      }
      
      if ('x-forwarded-for' in processedHeaders) {
        throw new Error('unexpected proxy header in request headers: x-forwarded-for');
      }
      
      if ('x-forwarded-host' in processedHeaders) {
        throw new Error('unexpected proxy header in request headers: x-forwarded-host');
      }
      
      if ('x-forwarded-proto' in processedHeaders) {
        throw new Error('unexpected proxy header in request headers: x-forwarded-proto');
      }
      break;
    
    case PROXY_MODE.NOT_EXPECTING_PROXIED_REQUEST_SILENT_FIX:
      delete processedHeaders['forwarded'];
      delete processedHeaders['x-forwarded-for'];
      delete processedHeaders['x-forwarded-host'];
      delete processedHeaders['x-forwarded-proto'];
      break;
    
    case PROXY_MODE.EXPECTING_PROXIED_REQUEST_FORWARDED_HEADER:
      if (!('forwarded' in processedHeaders)) {
        throw new Error('no proxy header in request headers');
      }
      delete processedHeaders['x-forwarded-for'];
      delete processedHeaders['x-forwarded-host'];
      delete processedHeaders['x-forwarded-proto'];
      break;
    
    case PROXY_MODE.EXPECTING_PROXIED_REQUEST_X_FORWARDED_HEADERS:
      if (!('x-forwarded-for' in processedHeaders)) {
        throw new Error('no proxy headers in request headers');
      }
      delete processedHeaders['forwarded'];
      break;
    
    default:
      throw new Error(`proxyMode unexpected: ${JSON.stringify(proxyMode)}`);
  }
  
  if (sendForwardedHeader || sendXForwardedHeaders) {
    let forwardedSegments = [];
    
    if (proxyMode == PROXY_MODE.EXPECTING_PROXIED_REQUEST_FORWARDED_HEADER) {
      const splitForwardedHeaders = processedHeaders['forwarded'].split(', ');
      
      let parsingFailed = false;
      
      for (const headerSegment of splitForwardedHeaders) {
        let headerSegmentMap = new Map();
        
        for (const headerSubSegment of headerSegment.split(';')) {
          const match = /^(by|for|host|proto)=.*$/s.exec(headerSubSegment);
          
          if (match == null) {
            parsingFailed = true;
            break;
          } else {
            const [ key, value ] = match.slice(1);
            
            if (key == 'proto' && (value != 'http' && value != 'https')) {
              parsingFailed = true;
              break;
            } else {
              headerSegmentMap.set(key, value);
            }
          }
        }
        
        if (headerSegmentMap.size <= 0) {
          parsingFailed = true;
        }
        
        if (parsingFailed) {
          break;
        } else {
          forwardedSegments.push(headerSegmentMap);
        }
      }
      
      if (parsingFailed) {
        forwardedSegments = [];
      }
    } else if (proxyMode == PROXY_MODE.EXPECTING_PROXIED_REQUEST_X_FORWARDED_HEADERS) {
      const ipSegments = processedHeaders['x-forwarded-for'].split(', ');
      
      for (let i = 0; i < ipSegments.length; i++) {
        const ipSegment = ipSegments[i];
        
        if (i == 0) {
          forwardedSegments.push(new Map([
            ['for', ipSegment],
            ...(
              'x-forwarded-host' in processedHeaders ?
                [['host', processedHeaders['x-forwarded-host']]] :
                []
            ),
            ...(
              'x-forwarded-proto' in processedHeaders &&
                (
                  processedHeaders['x-forwarded-proto'] == 'http' ||
                  processedHeaders['x-forwarded-proto'] == 'https'
                ) ?
                [['proto', processedHeaders['x-forwarded-proto']]] :
                []
            ),
          ]));
        } else {
          forwardedSegments.push(new Map([
            ['for', ipSegment],
          ]));
        }
      }
    }
    
    forwardedSegments.push(new Map([
      ['for', serverRequest.remoteAddress],
    ]));
    
    if (sendForwardedHeader) {
      processedHeaders['forwarded'] =
        forwardedSegments
          .map(headerSegment => {
            let processedHeaderSegment = [];
            
            if (forwardingSendBy && headerSegment.has('by')) {
              processedHeaderSegment.push(`by=${headerSegment.get('by')}`);
            }
            
            if (forwardingSendFor && headerSegment.has('for')) {
              processedHeaderSegment.push(`for=${headerSegment.get('for')}`);
            }
            
            if (forwardingSendHost && headerSegment.has('host')) {
              processedHeaderSegment.push(`host=${headerSegment.get('host')}`);
            }
            
            if (forwardingSendProto && headerSegment.has('proto')) {
              processedHeaderSegment.push(`proto=${headerSegment.get('proto')}`);
            }
            
            return processedHeaderSegment.join(';');
          })
          .join(', ');
    }
    
    if (sendXForwardedHeaders) {
      delete processedHeaders['x-forwarded-for'];
      delete processedHeaders['x-forwarded-host'];
      delete processedHeaders['x-forwarded-proto'];
      
      const firstSegment = forwardedSegments[0];
      
      if (forwardingSendFor) {
        processedHeaders['x-forwarded-for'] =
          forwardedSegments
            .map(headerSegment => headerSegment.get('for'))
            .filter(forSegment => forSegment != null)
            .join(', ');
      }
      
      if (forwardingSendHost && firstSegment.has('host')) {
        processedHeaders['x-forwarded-host'] = firstSegment.get('host');
      }
      
      if (forwardingSendProto && firstSegment.has('proto')) {
        processedHeaders['x-forwarded-proto'] = firstSegment.get('proto');
      }
    }
  } else {
    switch (proxyMode) {
      case PROXY_MODE.EXPECTING_PROXIED_REQUEST_FORWARDED_HEADER:
        delete processedHeaders['forwarded'];
        break;
      
      case PROXY_MODE.EXPECTING_PROXIED_REQUEST_X_FORWARDED_HEADERS:
        delete processedHeaders['x-forwarded-for'];
        delete processedHeaders['x-forwarded-host'];
        delete processedHeaders['x-forwarded-proto'];
        break;
    }
  }
  
  const clientRequest = await request({
    headers: processedHeaders,
    body: serverRequest.bodyStream,
    errorIfErrorStatusCode,
    ...requestParameters,
  });
  
  serverRequest.respond(
    clientRequest.bodyStream,
    clientRequest.headers,
  );
  
  const gracefulShutdownPromiseInternal = (async () => {
    const results = await Promise.allSettled([
      awaitEventOrError(serverRequest.bodyStream, ['close']),
      awaitEventOrError(clientRequest.bodyStream, ['close']),
    ]);
    
    for (const { status, reason } of results) {
      if (status == 'rejected') {
        throw reason;
      }
    }
  })();
  
  const gracefulShutdownPromise = (async () => {
    try {
      await gracefulShutdownPromiseInternal;
    } finally {
      serverRequest.server.removeGracefulShutdownPromise(gracefulShutdownPromise);
    }
  })();
  
  serverRequest.server.addGracefulShutdownPromise(gracefulShutdownPromise);
  
  if (gracefulShutdownFunc != null) {
    const processedGracefulShutdownFunc = () => {
      gracefulShutdownFunc({ serverRequest, clientRequest });
    };
    
    serverRequest.server.addGracefulShutdownFunc(processedGracefulShutdownFunc);
    
    try {
      await gracefulShutdownPromiseInternal;
    } finally {
      serverRequest.server.removeGracefulShutdownFunc(processedGracefulShutdownFunc);
    }
  }
}

export async function serveProxy({
  serverRequest,
  requestParameters,
  proxyMode,
  sendForwardedHeader,
  sendXForwardedHeaders,
  forwardingSendBy,
  forwardingByDefault,
  forwardingSendForAndBy,
  forwardingSendHost,
  forwardingSendProto,
  errorIfErrorStatusCode,
  gracefulShutdownFunc,
}) {
  let processedRequestParameters = { ...requestParameters };
  
  const pathPrefix = processedRequestParameters.pathPrefix ?? '';
  
  delete processedRequestParameters.pathPrefix;
  
  await serveProxyStaticEndpoint({
    serverRequest,
    requestParameters: {
      path: pathPrefix + serverRequest.path,
      ...requestParameters,
    },
    proxyMode,
    sendForwardedHeader,
    sendXForwardedHeaders,
    forwardingSendBy,
    forwardingByDefault,
    forwardingSendForAndBy,
    forwardingSendHost,
    forwardingSendProto,
    errorIfErrorStatusCode,
    gracefulShutdownFunc,
  });
}
