import { createReadStream } from 'node:fs';
import {
  join,
  sep,
} from 'node:path';

import { getType } from 'mime';

function convertPathToLinuxSlashes(path) {
  if (sep == '\\') {
    return path.replaceAll('\\', '/');
  } else {
    return path;
  }
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

export async function serveFilesystem({
  clientRequest,
  fsPathPrefix,
  serve404, // optional
  pathFilter, // optional
}) {
  if (clientRequest.path == null) {
    const headers = {
      ':status': 400,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest[':method'] == 'HEAD') {
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
  
  if (clientRequest[':method'] != 'GET' && clientRequest[':method'] != 'HEAD') {
    const headers = {
      ':status': 405,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest[':method'] == 'HEAD') {
      clientRequest.respond(
        '',
        headers
      );
    } else {
      clientRequest.respond(
        `Error: method ${JSON.stringify(clientRequest[':method'])} unknown`,
        headers
      );
    }
    return;
  }
  
  let processedPath = convertPathToLinuxSlashes(clientRequest.path);
  
  if (processedPath == '' || processedPath.endsWith('/')) {
    processedPath += 'index.html';
  }
  
  const pathLeavesBounds = relative('.', processedPath).split('/')[0] == '..';
  
  if (pathLeavesBounds) {
    const headers = {
      ':status': 403,
      'content-type': 'text/plain; charset=utf-8',
    };
    
    if (clientRequest[':method'] == 'HEAD') {
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
  
  const resultFsPath = join(fsPathPrefix, processedPath);
  
  const fileStream = createReadStream(resultFsPath);
  await awaitFileStreamReady(fileStream);
  
  clientRequest.respond(
    fileStream,
    {
      ':status': 200,
      'content-type': getType(processedPath),
    }
  );
}
