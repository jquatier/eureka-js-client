import sinon from 'sinon';
import {expect} from 'chai';
import {Eureka} from '../src/eureka-client';

describe('eureka client', () => {
  describe('Eureka()', () => {
    it('should throw an error if no config is found', () => {
      function fn() {
        return new Eureka();
      }
      expect(fn).to.throw();
    });

    it('should construct with the correct configuration values', () => {
      function shouldThrow() {
        return new Eureka();
      }

      function noApp() {
        return new Eureka({
          instance: {
            vipAddress: true,
            port: true
          },
          eureka: {
            host: true,
            port: true
          }
        });
      }

      function shouldWork() {
        return new Eureka({
          instance: {
            app: true,
            vipAddress: true,
            port: true
          },
          eureka: {
            host: true,
            port: true
          }
        });
      }

      expect(shouldThrow).to.throw();
      expect(noApp).to.throw(/app/);
      expect(shouldWork).to.not.throw();
    });
  });
});
