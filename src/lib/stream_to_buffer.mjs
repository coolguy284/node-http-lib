import { awaitEventOrError } from '../lib/eventemitter_promise.mjs';

export async function streamToBuffer(stream) {
  let bufs = [];
  
  stream.on('data', data => {
    bufs.push(data);
  });
  
  await awaitEventOrError(stream, 'end');
  
  return Buffer.concat(bufs);
}
