import {
  join,
  sep,
  relative,
} from 'node:path';

import {
  getProcessedPath,
  serveFile,
} from './serve_file.mjs';
import {
  serveFile_send400_badURL,
  serveFile_send403,
  serveFile_send404,
  serveFile_send405,
} from './serve_file_helpers.mjs';

export async function serveFolder({
  clientRequest,
  fsPathPrefix,
  serve400 = null,
  serve403 = null,
  serve404 = null,
  serve405 = null,
  serve416 = null,
  serve500 = null,
  pathFilter = null,
  errorReceiver = console.error,
}) {
  if (clientRequest.path == null) {
    await serveFile_send400_badURL({
      clientRequest,
      serve400,
    });
    return;
  }
  
  if (clientRequest.headers[':method'] != 'GET' && clientRequest.headers[':method'] != 'HEAD') {
    await serveFile_send405({
      clientRequest,
      serve405,
    });
    return;
  }
  
  if (sep == '\\' && clientRequest.path.includes('\\')) {
    // automatic 404 to simulate linux behavior of not having this path
    await serveFile_send404({
      clientRequest,
      processedPath,
      serve404,
    });
    return;
  }
  
  const processedPath = getProcessedPath(clientRequest.path);
  
  const pathLeavesBounds = relative('.', processedPath).split('/')[0] == '..';
  
  if (pathLeavesBounds) {
    await serveFile_send403({
      clientRequest,
      processedPath,
      serve403,
    });
    return;
  }
  
  if (pathFilter != null && !pathFilter(processedPath)) {
    await serveFile_send404({
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
