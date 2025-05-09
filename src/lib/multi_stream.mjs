import {
  PassThrough,
  Readable,
} from 'node:stream';

async function awaitStreamEnd(stream) {
  return await new Promise((r, j) => {
    const successListener = () => {
      r();
      stream.off('error', errorListener);
    };
    
    const errorListener = err => {
      j(err);
      stream.off('end', successListener);
    };
    
    stream.once('error', errorListener);
    stream.once('end', successListener);
  });
}

async function awaitStreamDrain(stream) {
  return await new Promise((r, j) => {
    const successListener = () => {
      r();
      stream.off('error', errorListener);
    };
    
    const errorListener = err => {
      j(err);
      stream.off('drain', successListener);
    };
    
    stream.once('error', errorListener);
    stream.once('drain', successListener);
  });
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
