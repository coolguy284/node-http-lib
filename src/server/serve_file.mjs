import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  open,
  stat,
} from 'node:fs/promises';

import mime from 'mime';

import { multiStream } from '../lib/multi_stream.mjs';
import {
  serveFile_send400_generic,
  serveFile_send404,
  serveFile_send416,
  serveFile_send500,
} from './serve_file_helpers.mjs';

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

async function awaitFileStreamEnd(fileStream) {
  return await new Promise((r, j) => {
    const successListener = () => {
      r();
      fileStream.off('error', errorListener);
    };
    
    const errorListener = err => {
      j(err);
      fileStream.off('end', successListener);
    };
    
    fileStream.once('error', errorListener);
    fileStream.once('end', successListener);
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

function getRangeBoundsFromObject({ start, end, size }) {
  let processedStart, processedEnd;
  
  if (start == null && end != null) {
    processedStart = size - end;
    processedEnd = size - 1;
  } else {
    processedStart = start ?? 0;
    processedEnd = end ?? size - 1;
  }
  
  return [processedStart, processedEnd];
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
      await serveFile_send404({
        clientRequest,
        processedPath,
        serve404,
      });
      return;
    }
    
    let ranges;
    
    if ('range' in clientRequest.headers) {
      const match = /^(\w+)=((?:\d*-\d*, )*\d*-\d*)$/.exec(clientRequest.headers.range);
      
      if (match == null) {
        await serveFile_send400_generic({
          clientRequest,
          processedPath,
          serve400,
        });
        return;
      }
      
      const [ unit, rangeString ] = match.slice(1);
      
      if (unit != 'bytes') {
        await serveFile_send400_generic({
          clientRequest,
          processedPath,
          serve400,
        });
        return;
      }
      
      ranges =
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
        await serveFile_send416({
          clientRequest,
          processedPath,
          serve416,
        });
        return;
      }
      
      for (const { start, end } of ranges) {
        if (start == null && end == null) {
          // invalid
          await serveFile_send400_generic({
            clientRequest,
            processedPath,
            serve400,
          });
          return;
        } else if (start == null && end != null) {
          // check that suffix length is permissible
          if (end > stats.size) {
            await serveFile_send416({
              clientRequest,
              processedPath,
              serve416,
            });
            return;
          }
        } else if (start != null && end == null) {
          // check if start is in range
          if (start >= stats.size) {
            await serveFile_send416({
              clientRequest,
              processedPath,
              serve416,
            });
            return;
          }
        } else if (start != null && end != null) {
          // check if start & end are in range
          if (start >= stats.size || end >= stats.size) {
            await serveFile_send416({
              clientRequest,
              processedPath,
              serve416,
            });
            return;
          }
          
          // check that end > start
          if (end < start) {
            await serveFile_send416({
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
    
    if ('range' in clientRequest.headers) {
      if (ranges.length > 1) {
        const boundary = randomBytes(32).toString('hex');
        
        const headers = {
          ':status': 206,
          'accept-ranges': 'bytes',
          'content-type': `multipart/byteranges; boundary=${boundary}`,
          'content-length': '', // TODO
        };
        
        if (clientRequest.headers[':method'] == 'HEAD') {
          clientRequest.respond(
            '',
            headers,
          );
        } else {
          const fd = await open(fsPath);
          
          try {
            let multiStreamSegments = [];
            
            for (const range of ranges) {
              const [ start, end ] = getRangeBoundsFromObject({ ...range, size: stats.size });
              
              multiStreamSegments.push(
                `--${boundary}\r\n` +
                `content-type: ${contentType}\r\n` + 
                `content-range: ${start}-${end}/${stats.size}\r\n`
              );
              
              multiStreamSegments.push(fd.createReadStream({ start, end, autoClose: false }));
              
              multiStreamSegments.push('\r\n');
            }
            
            multiStreamSegments.push(`--${boundary}--`);
            
            const fileStream = multiStream(multiStreamSegments);
            
            clientRequest.respond(
              fileStream,
              headers,
            );
            
            await awaitFileStreamEnd(fileStream);
          } finally {
            await fd[Symbol.asyncDispose]();
          }
        }
      } else {
        const [ start, end ] = getRangeBoundsFromObject({ ...ranges[0], size: stats.size });
        
        const headers = {
          ':status': 206,
          'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${stats.size}`,
          'content-type': contentType,
          'content-length': '' + (end - start + 1),
        };
        
        if (clientRequest.headers[':method'] == 'HEAD') {
          clientRequest.respond(
            '',
            headers,
          );
        } else {
          const fileStream = createReadStream(fsPath, { start, end });
          await awaitFileStreamReady(fileStream);
          
          clientRequest.respond(
            fileStream,
            headers,
          );
        }
      }
    } else {
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
    }
  } catch (err) {
    if (err.code == 'ENOENT') {
      await serveFile_send404({
        clientRequest,
        processedPath,
        serve404,
      });
    } else {
      if (errorReceiver != null) {
        errorReceiver(err);
      }
      
      await serveFile_send500({
        clientRequest,
        processedPath,
        serve500,
      });
    }
  }
}
