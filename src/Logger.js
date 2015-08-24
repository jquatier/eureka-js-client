
const LEVELS = {
  error: 50,
  warn: 40,
  info: 30,
  debug: 20
};
const DEFAULT_LEVEL = LEVELS.info;

export class Logger {
  constructor() {
    this._level = DEFAULT_LEVEL;
  }

  level(val) {
    if (val) {
      if (typeof val === 'string') {
        val = LEVELS[val];
      }
      this._level = val || DEFAULT_LEVEL;
    }
    return this._level;
  }

  // Abstract the console call:
  _log(method, args) {
    if (this._level <= LEVELS[method === 'log' ? 'debug' : method]) {
      console[method](...args);
    }
  }

  error() {
    return this._log('error', arguments);
  }
  warn() {
    return this._log('warn', arguments);
  }
  info() {
    return this._log('info', arguments);
  }
  debug() {
    return this._log('log', arguments);
  }
}
