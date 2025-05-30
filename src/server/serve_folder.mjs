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
  includeLastModified = true,
  // returns integer seconds since unix epoch for a given true filepath
  lastModifiedOverrideFunc = null,
  // returns etag for a given true filepath
  etagFunc = null,
  additionalHeaders = {},
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
    includeLastModified,
    lastModifiedOverride: includeLastModified ? lastModifiedOverrideFunc?.(resultFsPath) : null,
    etag: etagFunc?.(resultFsPath),
    additionalHeaders,
    serve400,
    serve404,
    serve416,
    serve500,
    errorReceiver,
    fsCreateReadStream,
    fsPromisesStat,
    fsPromisesOpen,
  });
}
