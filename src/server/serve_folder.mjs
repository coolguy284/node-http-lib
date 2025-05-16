import {
  join,
  sep,
  relative,
} from 'node:path';

import {
  getProcessedPath,
  serveFile,
  serveFile_send404,
} from './serve_file.mjs';

export async function serveFolder({
  clientRequest,
  fsPathPrefix,
  serve400 = null,
  serve404 = null,
  serve416 = null,
  serve500 = null,
  pathFilter = null,
  errorReceiver = console.error,
}) {
  if (clientRequest.path == null) {
    const headers = {
      ':status': 400,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers,
      );
    } else {
      clientRequest.respond(
        `Error: unparseable URL: ${JSON.stringify(clientRequest.pathRaw)}`,
        headers,
      );
    }
    return;
  }
  
  if (clientRequest.headers[':method'] != 'GET' && clientRequest.headers[':method'] != 'HEAD') {
    const headers = {
      ':status': 405,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers,
      );
    } else {
      clientRequest.respond(
        `Error: method ${JSON.stringify(clientRequest.headers[':method'])} unknown`,
        headers,
      );
    }
    return;
  }
  
  if (sep == '\\' && clientRequest.path.includes('\\')) {
    // automatic 404 to simulate linux behavior of not having this path
    serveFile_send404({
      clientRequest,
      processedPath,
      serve404,
    });
    return;
  }
  
  const processedPath = getProcessedPath(clientRequest.path);
  
  const pathLeavesBounds = relative('.', processedPath).split('/')[0] == '..';
  
  if (pathLeavesBounds) {
    const headers = {
      ':status': 403,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers,
      );
    } else {
      clientRequest.respond(
        `Error: path ${JSON.stringify(processedPath)} leaves containing folder`,
        headers,
      );
    }
    return;
  }
  
  if (pathFilter != null && !pathFilter(processedPath)) {
    serveFile_send404({
      clientRequest,
      processedPath,
      serve404,
    });
    return;
  }
  
  const resultFsPath = join(fsPathPrefix, processedPath);
  
  await serveFile({
    clientRequest,
    fsPath: resultFsPath,
    serve400,
    serve404,
    serve416,
    serve500,
    errorReceiver,
  });
}
