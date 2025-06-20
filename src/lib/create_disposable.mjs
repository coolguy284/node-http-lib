export function createDisposableIfNull(disposable, disposableCreatorFunc) {
  if (disposable == null) {
    const newDisposable = disposableCreatorFunc();
    
    return {
      get: () => newDisposable,
      [Symbol.dispose]: () => newDisposable[Symbol.dispose](),
    };
  } else {
    return {
      get: () => disposable,
      [Symbol.dispose]: () => {},
    };
  }
}
