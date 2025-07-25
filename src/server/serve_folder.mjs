import { createReadStream } from 'node:fs';
import {
  open,
  stat,
} from 'node:fs/promises';
import {
  join,
  sep,
  relative,
} from 'node:path';

import {
  ALLOWED_METHODS_STRING,
  getProcessedRequestPath,
  serveFile,
} from './serve_file.mjs';
import {
  serveFile_send400_badURL,
  serveFile_send403,
  serveFile_send404,
  serveFile_send405,
} from './serve_file_helpers.mjs';

export async function serveFolder({
  serverRequest,
  fsPathPrefix,
  includeLastModified = true,
  // returns integer seconds since unix epoch for a given true filepath
  lastModifiedOverrideFunc = null,
  // returns etag for a given true filepath
  etagFunc = null,
  additionalHeadersFunc = null,
  serve400 = null,
  serve403 = null,
  serve404 = null,
  serve405 = null,
  serve416 = null,
  serve500 = null,
  pathFilter = null,
  errorReceiver = console.error,
  // accepts optional { start, end } parameters, implements stream.Readable
  fsCreateReadStream = createReadStream,
  // implements: isFile, size, mtimeMs
  fsPromisesStat = stat,
  // implements:
  // createReadStream (accepts parameters: start, end, autoClose: true, returns stream.Readable),
  // Symbol.asyncDispose
  fsPromisesOpen = open,
}) {
  if (serverRequest.path == null) {
    await serveFile_send400_badURL({
      serverRequest,
      serve400,
    });
    return;
  }
  
  if (serverRequest.headers[':method'] == 'OPTIONS') {
    serverRequest.respond(
      null,
      {
        allow: ALLOWED_METHODS_STRING,
        ...(
          additionalHeadersFunc?.({
            requestPath: serverRequest.path,
            processedRequestPath,
            fsPath: resultFsPath,
            serverRequest,
          }) ??
          {}
        ),
      },
    );
  }
  
  if (serverRequest.headers[':method'] != 'GET' && serverRequest.headers[':method'] != 'HEAD') {
    await serveFile_send405({
      serverRequest,
      serve405,
      allowedMethodsString: ALLOWED_METHODS_STRING,
    });
    return;
  }
  
  const processedRequestPath = getProcessedRequestPath(serverRequest.path);
  
  if (sep == '\\' && serverRequest.path.includes('\\')) {
    // automatic 404 to simulate linux behavior of not having this path
    await serveFile_send404({
      serverRequest,
      processedRequestPath,
      serve404,
    });
    return;
  }
  
  const pathLeavesBounds = relative('.', processedRequestPath).split('/')[0] == '..';
  
  if (pathLeavesBounds) {
    await serveFile_send403({
      serverRequest,
      processedRequestPath,
      serve403,
    });
    return;
  }
  
  const resultFsPath = join(fsPathPrefix, processedRequestPath);
  
  if (
    pathFilter != null &&
      !pathFilter({
        requestPath: serverRequest.path,
        processedRequestPath,
        fsPath: resultFsPath,
        serverRequest,
      })
  ) {
    await serveFile_send404({
      serverRequest,
      processedRequestPath,
      serve404,
    });
    return;
  }
  
  await serveFile({
    serverRequest,
    fsPath: resultFsPath,
    includeLastModified,
    lastModifiedOverride:
      includeLastModified ?
        lastModifiedOverrideFunc?.({
          requestPath: serverRequest.path,
          processedRequestPath,
          fsPath: resultFsPath,
          serverRequest,
        }) :
        null,
    etag:
      etagFunc?.({
        requestPath: serverRequest.path,
        processedRequestPath,
        fsPath: resultFsPath,
        serverRequest,
      }),
    additionalHeaders:
      additionalHeadersFunc?.({
        requestPath: serverRequest.path,
        processedRequestPath,
        fsPath: resultFsPath,
        serverRequest,
      }) ??
      {},
    serve400,
    serve404,
    serve405,
    serve416,
    serve500,
    errorReceiver,
    fsCreateReadStream,
    fsPromisesStat,
    fsPromisesOpen,
  });
}
