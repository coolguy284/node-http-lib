import {
  PassThrough,
  Readable,
} from 'node:stream';

import { awaitEventOrError } from '../lib/event_emitter_promise.mjs';

async function awaitStreamEnd(stream) {
  await awaitEventOrError(stream, ['end']);
}

async function awaitStreamDrain(stream) {
  await awaitEventOrError(stream, ['drain']);
}

async function multiStreamProcessing(inputs, result) {
  for (const input of inputs) {
    if (input instanceof Readable) {
      input.pipe(result, { end: false });
      
      await awaitStreamEnd(input);
    } else {
      const needsDrain = !result.write(input);
      
      if (needsDrain) {
        await awaitStreamDrain(result);
      }
    }
  }
  
  result.end();
}

export function multiStream(inputs, {
  finishCallback = null,
  errorCallback = console.error,
} = {}) {
  let result = new PassThrough();
  
  multiStreamProcessing(inputs, result)
    .then(value => {
      if (finishCallback != null) {
        finishCallback(value);
      }
    })
    .catch(err => {
      for (const input of inputs) {
        if (input instanceof Readable) {
          try {
            if (!input.destroyed) {
              input.destroy();
            }
          } catch (err) {
            console.error(err);
          }
        }
      }
      
      try {
        if (!result.destroyed) {
          result.destroy();
        }
      } catch (err) {
        console.error(err);
      }
      
      if (errorCallback != null) {
        errorCallback(err);
      }
    });
  
  return result;
}
