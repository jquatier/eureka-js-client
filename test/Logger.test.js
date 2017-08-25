import { expect } from 'chai';
import logger from '../src/Logger.js';

const DEFAULT_LEVEL = 30;

describe('Logger', () => {
  it('should construct with no args', () => {
    expect(() => logger).to.not.throw();
  });

  describe('Logger Instance', () => {
    it('should return the current log level from the "level" method', () => {
      expect(logger.level()).to.equal(DEFAULT_LEVEL);
    });

    it('should update the log level if passed a number', () => {
      logger.level(100);
      expect(logger.level()).to.equal(100);
      logger.level(15);
      expect(logger.level()).to.equal(15);
    });

    it('should update the log level if a valid string is passed', () => {
      logger.level('warn');
      expect(logger.level()).to.equal(40);
      logger.level('error');
      expect(logger.level()).to.equal(50);
    });

    it('should use the default log level is an invalid string is passed', () => {
      expect(() => logger.level('invalid')).to.throw();
    });
  });
});
