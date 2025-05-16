import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import mime from 'mime';

export function getProcessedPath(clientRequestPath) {
  let processedPath = clientRequestPath;
  
  if (processedPath == '' || processedPath.endsWith('/')) {
    processedPath += 'index.html';
  }
  
  return processedPath;
}

async function awaitFileStreamReady(fileStream) {
  return await new Promise((r, j) => {
    const successListener = () => {
      r();
      fileStream.off('error', errorListener);
    };
    
    const errorListener = err => {
      j(err);
      fileStream.off('ready', successListener);
    };
    
    fileStream.once('error', errorListener);
    fileStream.once('ready', successListener);
  });
}

// https://stackoverflow.com/a/66164189
const TEXTUAL_APPLICATION_TYPES = new Set([
  'json', 'ld+json', 'x-httpd-php', 'x-sh', 'x-csh', 'xml',
]);
function mimeTypeIsText(mimeType) {
  if (mimeType == null) {
    return false;
  } else if (mimeType.startsWith('text/')) {
    return true;
  } else if (mimeType.endsWith('-xml')) {
    return true;
  } else if (mimeType.startsWith('application/')) {
    let applicationSubType = mimeType.slice('application/'.length);
    return TEXTUAL_APPLICATION_TYPES.has(applicationSubType);
  } else {
    return false;
  }
}

export async function serveFile({
  clientRequest,
  fsPath,
  serve400 = null,
  serve404 = null,
  serve416 = null,
  serve500 = null,
  errorReceiver = console.error,
}) {
  const processedPath = getProcessedPath(clientRequest.path);
  
  try {
    const stats = await stat(fsPath);
    
    if (!stats.isFile()) {
      serveFile_send404({
        clientRequest,
        processedPath,
        serve404,
      });
      return;
    }
    
    if ('range' in clientRequest.headers) {
      const match = /^(\w+)=((?:\d*-\d*, )*\d*-\d*)$/.exec(clientRequest.headers.range);
      
      if (match == null) {
        serveFile_send400({
          clientRequest,
          processedPath,
          serve400,
        });
        return;
      }
      
      const [ unit, rangeString ] = match.slice(1);
      
      if (unit != 'bytes') {
        serveFile_send400({
          clientRequest,
          processedPath,
          serve400,
        });
        return;
      }
      
      const ranges =
        rangeString
          .split(', ')
          .map(range => {
            const [ startString, endString ] = /^(\d*)-(\d*)$/.exec(range).slice(1);
            
            return {
              start: startString != '' ? parseInt(startString) : null,
              end: endString != '' ? parseInt(endString) : null,
            };
          });
      
      if (ranges.length > 1) {
        // reject multipart range requests for now
        serveFile_send416({
          clientRequest,
          processedPath,
          serve416,
        });
        return;
      }
      
      for (const { start, end } of ranges) {
        if (start == null && end == null) {
          // invalid
          serveFile_send400({
            clientRequest,
            processedPath,
            serve400,
          });
          return;
        } else if (start == null && end != null) {
          // check that suffix length is permissible
          if (end > stats.size) {
            serveFile_send416({
              clientRequest,
              processedPath,
              serve416,
            });
            return;
          }
        } else if (start != null && end == null) {
          // check if start is in range
          if (start >= stats.size) {
            serveFile_send416({
              clientRequest,
              processedPath,
              serve416,
            });
            return;
          }
        } else if (start != null && end != null) {
          // check if start & end are in range
          if (start >= stats.size || end >= stats.size) {
            serveFile_send416({
              clientRequest,
              processedPath,
              serve416,
            });
            return;
          }
          
          // check that end > start
          if (end < start) {
            serveFile_send416({
              clientRequest,
              processedPath,
              serve416,
            });
            return;
          }
        }
      }
    }
    
    const mimeType = mime.getType(processedPath);
    
    let contentType;
    if (mimeType == null) {
      contentType = 'application/octet-stream';
    } else if (mimeTypeIsText(mimeType)) {
      contentType = `${mimeType}; charset=utf-8`;
    } else {
      contentType = mimeType;
    }
    
    const headers = {
      ':status': 200,
      'accept-ranges': 'bytes',
      'content-type': contentType,
      'content-length': stats.size,
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers,
      );
    } else {
      const fileStream = createReadStream(fsPath);
      await awaitFileStreamReady(fileStream);
      
      clientRequest.respond(
        fileStream,
        headers,
      );
    }
  } catch (err) {
    if (err.code == 'ENOENT') {
      serveFile_send404({
        clientRequest,
        processedPath,
        serve404,
      });
    } else {
      if (errorReceiver != null) {
        errorReceiver(err);
      }
      
      serveFile_send500({
        clientRequest,
        processedPath,
        serve500,
      });
    }
  }
}
