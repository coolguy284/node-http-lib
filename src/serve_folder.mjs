import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  join,
  sep,
  relative,
} from 'node:path';

import mime from 'mime';

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

export async function serveFolder({
  clientRequest,
  fsPathPrefix,
  serve404 = null,
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
        headers
      );
    } else {
      clientRequest.respond(
        `Error: unparseable URL: ${JSON.stringify(clientRequest.pathRaw)}`,
        headers
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
        headers
      );
    } else {
      clientRequest.respond(
        `Error: method ${JSON.stringify(clientRequest.headers[':method'])} unknown`,
        headers
      );
    }
    return;
  }
  
  if (sep == '\\' && clientRequest.path.includes('\\')) {
    // automatic 404 to simulate linux behavior of not having this path
    serveFilesystem_send404({
      clientRequest,
      processedPath,
      serve404,
    });
    return;
  }
  
  let processedPath = clientRequest.path;
  
  if (processedPath == '' || processedPath.endsWith('/')) {
    processedPath += 'index.html';
  }
  
  const pathLeavesBounds = relative('.', processedPath).split('/')[0] == '..';
  
  if (pathLeavesBounds) {
    const headers = {
      ':status': 403,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest.headers[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers
      );
    } else {
      clientRequest.respond(
        `Error: path ${JSON.stringify(processedPath)} leaves containing folder`,
        headers
      );
    }
    return;
  }
  
  if (pathFilter != null && !pathFilter(processedPath)) {
    serveFilesystem_send404({
      clientRequest,
      processedPath,
      serve404,
    });
    return;
  }
  
  const resultFsPath = join(fsPathPrefix, processedPath);
  
  try {
    const stats = await stat(resultFsPath);
    
    if (!stats.isFile()) {
      serveFilesystem_send404({
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
      const fileStream = createReadStream(resultFsPath);
      await awaitFileStreamReady(fileStream);
      
      clientRequest.respond(
        fileStream,
        headers
      );
    }
  } catch (err) {
    if (err.code == 'ENOENT') {
      serveFilesystem_send404({
        clientRequest,
        processedPath,
        serve404,
      });
    } else {
      if (errorReceiver != null) {
        errorReceiver(err);
      }
      
      serveFilesystem_send500({
        clientRequest,
        processedPath,
        serve500,
      });
    }
  }
}

function serveFilesystem_send404({ clientRequest, processedPath, serve404 }) {
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

function serveFilesystem_send500({ clientRequest, processedPath, serve500 }) {
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
