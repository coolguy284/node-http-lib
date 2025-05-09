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
  serve404 = null,
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
      'content-type': contentType,
      'content-length': stats.size,
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers
      );
    } else {
      const fileStream = createReadStream(fsPath);
      await awaitFileStreamReady(fileStream);
      
      clientRequest.respond(
        fileStream,
        headers
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

export function serveFile_send404({ clientRequest, processedPath, serve404 }) {
  if (serve404 != null) {
    serve404({
      clientRequest,
    });
  } else {
    const headers = {
      ':status': 404,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers
      );
    } else {
      clientRequest.respond(
        `Error: file ${JSON.stringify(processedPath)} not found`,
        headers
      );
    }
  }
}

export function serveFile_send500({ clientRequest, processedPath, serve500 }) {
  if (serve500 != null) {
    serve500({
      clientRequest,
    });
  } else {
    const headers = {
      ':status': 500,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers
      );
    } else {
      clientRequest.respond(
        `Error: an internal server error occurred trying to access the file ${JSON.stringify(processedPath)}`,
        headers
      );
    }
  }
}
