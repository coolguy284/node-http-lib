import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

import { ClientResponse } from './client_response.mjs';
import { createDisposableIfNull } from '../lib/create_disposable.mjs';
import { awaitEventOrError } from '../lib/event_emitter_promise.mjs';
import { multiStream } from '../lib/multi_stream.mjs';
import { RequestSession } from './request_session.mjs';

export async function request({
  mode,
  session = null,
  host,
  port = null,
  path,
  headers = {},
  body = null,
  options = {},
  // only has significance in http1:
  sendHeadersImmediately = true,
  errorIfErrorStatusCode = true,
}) {
  let clientResponse;
  
  switch (mode) {
    case 'http':
    case 'https': {
      let processedHeaders = { ...headers };
      delete processedHeaders[':scheme'];
      
      if (':authority' in processedHeaders) {
        processedHeaders.host = headers[':authority'];
        delete processedHeaders[':authority'];
      }
      
      if (processedHeaders[':method'] == 'CONNECT' && ':protocol' in processedHeaders) {
        processedHeaders[':method'] = 'GET';
        processedHeaders.upgrade = processedHeaders[':protocol'];
        delete processedHeaders[':protocol'];
        processedHeaders.connection = 'keep-alive, Upgrade';
      }
      
      const processedMethod = processedHeaders[':method'];
      
      delete processedHeaders[':method'];
      
      const requestFunc = mode == 'http' ? httpRequest : httpsRequest;
      
      const clientRequest = requestFunc({
        host,
        port,
        path: `/${path}`,
        method: processedMethod,
        headers: processedHeaders,
        ...options,
      });
      
      if (sendHeadersImmediately) {
        clientRequest.flushHeaders();
      }
      
      if (body != null) {
        if (body instanceof Readable) {
          body.pipe(clientRequest);
        } else {
          clientRequest.end(body);
        }
      } else {
        clientRequest.end();
      }
      
      const { eventName, args } = await awaitEventOrError(clientRequest, ['response', 'upgrade', 'connect']);
      
      const [ response, ...otherArgs ] = args;
      
      let responseHeaders = {
        ':status': response.statusCode,
        ...response.headers,
      };
      
      delete responseHeaders.connection;
      delete responseHeaders['keep-alive'];
      delete responseHeaders['transfer-encoding'];
      
      switch (eventName) {
        case 'response': {
          clientResponse = new ClientResponse({
            headers: responseHeaders,
            bodyStream: response,
          });
          break;
        }
        
        case 'upgrade':
        case 'connect': {
          const [ socket, head ] = otherArgs;
          
          if (eventName == 'upgrade') {
            if (responseHeaders[':status'] == 101) {
              responseHeaders[':status'] = 200;
            }
            
            delete responseHeaders.upgrade;
          }
          
          clientResponse = new ClientResponse({
            headers: responseHeaders,
            bodyStream: multiStream([
              head,
              socket,
            ]),
          });
          
          body.unpipe(clientRequest);
          body.pipe(socket);
          break;
        }
        
        default:
          throw new Error(`default awaitEventOrError case not possible: ${eventName}`);
      }
      break;
    }
    
    case 'http2': {
      using workingSession = createDisposableIfNull(session, () => new RequestSession());
      
      const connection = await workingSession.get().createOrGetHttp2Session({
        host,
        port: port ?? 443,
        options,
      });
      
      let processedHeaders = {
        ':path': `/${path}`,
        ...headers,
      };
      
      delete processedHeaders.connection;
      delete processedHeaders['keep-alive'];
      delete processedHeaders['transfer-encoding'];
      
      const stream = connection.request(processedHeaders, options);
      
      if (body != null) {
        if (body instanceof Readable) {
          body.pipe(stream);
        } else {
          stream.end(body);
        }
      } else {
        stream.end();
      }
      
      const { args: [ responseHeaders, _ ] } = await awaitEventOrError(stream, ['response']);
      
      clientResponse = new ClientResponse({
        headers: responseHeaders,
        bodyStream: stream,
      });
      break;
    }
    
    default:
      throw new Error(`mode unrecognized: ${JSON.stringify(mode)}`);
  }
  
  if (errorIfErrorStatusCode && clientResponse.headers[':status'] >= 400 && clientResponse.headers[':status'] <= 599) {
    let err = new Error(`Error code ${clientResponse.headers[':status']} in response`);
    err.clientResponse = clientResponse;
    throw err;
  }
  
  return clientResponse;
}
