import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';

import { ReadOnlySet } from './lib/read_only_set.mjs';
import { streamToBuffer } from './lib/stream_to_buffer.mjs';

export const VALID_REQUEST_PROTOS = new ReadOnlySet([
  'http',
  'https',
]);

export class RequestError extends Error {}
export class ResponseError extends Error {}

export function requestDelayable(requestParams, { sendHeadersImmediately = true } = {}) {
  if (typeof requestParams.proto != 'string') {
    throw new Error(`requestParams.proto not string: ${typeof requestParams.proto}`);
  }
  
  if (!VALID_REQUEST_PROTOS.has(requestParams.proto)) {
    throw new Error(`requestParams.proto not valid: ${requestParams.proto}`);
  }
  
  if ('body' in requestParams) {
    if (!(requestParams.body instanceof Uint8Array) && typeof requestParams.body != 'string') {
      throw new Error(`requestParams.body not uint8array or string: ${typeof requestParams.body}`);
    }
  }
  
  const filteredRequestParams = Object.fromEntries(
    Object.entries(requestParams)
      .filter(([ key, _ ]) => key != 'proto' && key != 'body')
  );
  
  let req;
  
  const requestPromise = new Promise((r, j) => {
    const errorListener = err => {
      let newErr = new RequestError('Error during request');
      newErr.originalErr = err;
      j(newErr);
    };
    
    let requestFunc;
    
    if (requestParams.proto == 'http') {
      requestFunc = httpRequest;
    } else {
      requestFunc = httpsRequest;
    }
    
    req = requestFunc(
      filteredRequestParams,
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async res => {
        try {
          const serverResponse = await streamToBuffer(res);
          
          if (res.statusCode == 200 || res.statusCode == 204) {
            r(serverResponse);
          } else {
            let err = new ResponseError(`Response: Error ${res.statusCode}: ${serverResponse.toString()}`);
            err.statusCode = res.statusCode;
            err.responseRaw = serverResponse;
            j(err);
            req.end();
          }
        
          req.off('error', errorListener);
        } catch (err) {
          let newErr = new ResponseError('Error during response');
          newErr.statusCode = res.statusCode;
          newErr.originalErr = err;
          j(newErr);
          req.end();
        }
      }
    );
    
    req.once('error', errorListener);
    
    if (sendHeadersImmediately) {
      req.flushHeaders();
    }
  });
  
  return {
    requestPromise,
    sendRequest: () => {
      if (requestParams.body != null) {
        req.end(requestParams.body);
      } else {
        req.end();
      }
    },
  };
}

export async function request(requestParams) {
  const { requestPromise, sendRequest } = requestDelayable(requestParams, { sendHeadersImmediately: false });
  
  sendRequest();
  
  return await requestPromise;
}
