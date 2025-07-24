import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  open,
  stat,
} from 'node:fs/promises';

import mime from 'mime';

import { awaitEventOrError } from '../lib/event_emitter_promise.mjs';
import { multiStream } from '../lib/multi_stream.mjs';
import {
  serveFile_send400_generic,
  serveFile_send404,
  serveFile_send416,
  serveFile_send500,
} from './serve_file_helpers.mjs';

export function getProcessedRequestPath(serverRequestPath) {
  let processedRequestPath = serverRequestPath;
  
  if (processedRequestPath == '' || processedRequestPath.endsWith('/')) {
    processedRequestPath += 'index.html';
  }
  
  return processedRequestPath;
}

async function awaitFileStreamReady(fileStream) {
  await awaitEventOrError(fileStream, ['ready']);
}

async function awaitFileStreamEnd(fileStream) {
  await awaitEventOrError(fileStream, ['end']);
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

function unixSecsToString(unixSecs) {
  return new Date(unixSecs * 1000).toUTCString();
}

export async function serveFile({
  serverRequest,
  fsPath,
  includeLastModified = true,
  // integer seconds since unix epoch
  lastModifiedOverride = null,
  etag = null,
  additionalHeaders = {},
  serve400 = null,
  serve404 = null,
  serve416 = null,
  serve500 = null,
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
  const processedRequestPath = getProcessedPath(serverRequest.path);
  
  try {
    const stats = await fsPromisesStat(fsPath);
    
    if (!stats.isFile()) {
      await serveFile_send404({
        serverRequest,
        processedRequestPath,
        serve404,
        additionalHeaders,
      });
      return;
    }
    
    const mimeType = mime.getType(processedRequestPath);
    
    let contentType;
    if (mimeType == null) {
      contentType = 'application/octet-stream';
    } else if (mimeTypeIsText(mimeType)) {
      contentType = `${mimeType}; charset=utf-8`;
    } else {
      contentType = mimeType;
    }
    
    if ('if-none-match' in serverRequest.headers) {
      const match = /^"(.*)"$/.exec(serverRequest.headers['if-none-match']);
      
      if (match == null) {
        await serveFile_send400_generic({
          serverRequest,
          processedRequestPath,
          serve400,
          additionalHeaders,
        });
        return;
      }
      
      const requestEtag = match[1];
      
      if (requestEtag == etag) {
        serverRequest.respond(
          null,
          {
            ':status': 304,
            'accept-ranges': 'bytes',
            'content-type': contentType,
            'content-length': stats.size,
            ...(etag != null ? { 'etag': etag } : {}),
            ...(
              includeLastModified ?
                {
                  'last-modified': unixSecsToString(
                    lastModifiedOverride ?? Math.floor(stats.mtimeMs / 1000)
                  ),
                } :
                {}
            ),
            ...additionalHeaders,
          },
        );
        return;
      }
    }
    
    if (includeLastModified && 'if-modified-since' in serverRequest.headers) {
      if (!/^(?:Sun|Mon|Tue|Wed|Thur|Fri|Sat), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) -?\d+ \d{2}:\d{2}:\d{2} GMT$/.test(serverRequest.headers['if-modified-since'])) {
        await serveFile_send400_generic({
          serverRequest,
          processedRequestPath,
          serve400,
          additionalHeaders,
        });
        return;
      }
      
      const requestLastModifiedSecs = Math.floor(new Date(serverRequest.headers['if-modified-since']).getTime() / 1000);
      
      const fileLastModifiedSecs = Math.floor(stats.mtimeMs / 1000);
      
      if (requestLastModifiedSecs == fileLastModifiedSecs) {
        serverRequest.respond(
          null,
          {
            ':status': 304,
            'accept-ranges': 'bytes',
            'content-type': contentType,
            'content-length': stats.size,
            ...(etag != null ? { 'etag': etag } : {}),
            ...(
              includeLastModified ?
                {
                  'last-modified': unixSecsToString(
                    lastModifiedOverride ?? Math.floor(stats.mtimeMs / 1000)
                  ),
                } :
                {}
            ),
            ...additionalHeaders,
          },
        );
        return;
      }
    }
    
    let ranges;
    
    if ('range' in serverRequest.headers) {
      const match = /^(\w+)=((?:\d*-\d*, )*\d*-\d*)$/.exec(serverRequest.headers.range);
      
      if (match == null) {
        await serveFile_send400_generic({
          serverRequest,
          processedRequestPath,
          serve400,
          additionalHeaders,
        });
        return;
      }
      
      const [ unit, rangeString ] = match.slice(1);
      
      if (unit != 'bytes') {
        await serveFile_send400_generic({
          serverRequest,
          processedRequestPath,
          serve400,
          additionalHeaders,
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
      
      for (const { start, end } of ranges) {
        if (start == null && end == null) {
          // invalid
          await serveFile_send400_generic({
            serverRequest,
            processedRequestPath,
            serve400,
            additionalHeaders,
          });
          return;
        } else if (start == null && end != null) {
          // check that suffix length is permissible
          if (end > stats.size) {
            await serveFile_send416({
              serverRequest,
              processedRequestPath,
              serve416,
              additionalHeaders,
            });
            return;
          }
        } else if (start != null && end == null) {
          // check if start is in range
          if (start >= stats.size) {
            await serveFile_send416({
              serverRequest,
              processedRequestPath,
              serve416,
              additionalHeaders,
            });
            return;
          }
        } else if (start != null && end != null) {
          // check if start & end are in range
          if (start >= stats.size || end >= stats.size) {
            await serveFile_send416({
              serverRequest,
              processedRequestPath,
              serve416,
              additionalHeaders,
            });
            return;
          }
          
          // check that end > start
          if (end < start) {
            await serveFile_send416({
              serverRequest,
              processedRequestPath,
              serve416,
              additionalHeaders,
            });
            return;
          }
        }
      }
    }
    
    if ('range' in serverRequest.headers) {
      if (ranges.length > 1) {
        const boundary = randomBytes(32).toString('hex');
        
        let contentLength = 0;
        
        for (const range of ranges) {
          const [ start, end ] = getRangeBoundsFromObject({ ...range, size: stats.size });
          
          contentLength += (
            `--${boundary}\r\n` +
            `content-type: ${contentType}\r\n` +
            `content-range: ${start}-${end}/${stats.size}\r\n\r\n`
          ).length;
          
          contentLength += end - start + 1;
          
          contentLength += '\r\n'.length;
        }
        
        contentLength += `--${boundary}--`.length;
        
        const headers = {
          ':status': 206,
          'accept-ranges': 'bytes',
          'content-type': `multipart/byteranges; boundary=${boundary}`,
          'content-length': '' + contentLength,
          ...(
            includeLastModified ?
              {
                'last-modified': unixSecsToString(
                  lastModifiedOverride ?? Math.floor(stats.mtimeMs / 1000)
                ),
              } :
              {}
          ),
          ...additionalHeaders,
        };
        
        if (serverRequest.headers[':method'] == 'HEAD') {
          serverRequest.respond(
            null,
            headers,
          );
        } else {
          const fd = await fsPromisesOpen(fsPath);
          
          try {
            let multiStreamSegments = [];
            
            for (const range of ranges) {
              const [ start, end ] = getRangeBoundsFromObject({ ...range, size: stats.size });
              
              multiStreamSegments.push(
                `--${boundary}\r\n` +
                `content-type: ${contentType}\r\n` +
                `content-range: ${start}-${end}/${stats.size}\r\n\r\n`
              );
              
              multiStreamSegments.push(fd.createReadStream({ start, end, autoClose: false }));
              
              multiStreamSegments.push('\r\n');
            }
            
            multiStreamSegments.push(`--${boundary}--`);
            
            const fileStream = multiStream(multiStreamSegments);
            
            serverRequest.respond(
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
          ...(
            includeLastModified ?
              {
                'last-modified': unixSecsToString(
                  lastModifiedOverride ?? Math.floor(stats.mtimeMs / 1000)
                ),
              } :
              {}
          ),
          ...additionalHeaders,
        };
        
        if (serverRequest.headers[':method'] == 'HEAD') {
          serverRequest.respond(
            null,
            headers,
          );
        } else {
          const fileStream = fsCreateReadStream(fsPath, { start, end });
          await awaitFileStreamReady(fileStream);
          
          serverRequest.respond(
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
        ...(etag != null ? { 'etag': etag } : {}),
        ...(
          includeLastModified ?
            {
              'last-modified': unixSecsToString(
                lastModifiedOverride ?? Math.floor(stats.mtimeMs / 1000)
              ),
            } :
            {}
        ),
        ...additionalHeaders,
      };
      
      if (serverRequest.headers[':method'] == 'HEAD') {
        serverRequest.respond(
          null,
          headers,
        );
      } else {
        const fileStream = fsCreateReadStream(fsPath);
        await awaitFileStreamReady(fileStream);
        
        serverRequest.respond(
          fileStream,
          headers,
        );
      }
    }
  } catch (err) {
    if (err.code == 'ENOENT') {
      await serveFile_send404({
        serverRequest,
        processedRequestPath,
        serve404,
        additionalHeaders,
      });
    } else {
      if (errorReceiver != null) {
        errorReceiver(err);
      }
      
      await serveFile_send500({
        serverRequest,
        processedRequestPath,
        serve500,
        additionalHeaders,
      });
    }
  }
}
