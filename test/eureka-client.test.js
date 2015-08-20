import sinon from 'sinon';
import { expect } from 'chai';
import Eureka from '../src/eureka-client';

describe('eureka client', () => {

  describe('Eureka()', () => {

    it('should throw an error if no config', () => {
      try {
        new Eureka({});
      } catch (e) {
        expect(e.message).to.equal('missing instance / eureka configuration.');
        return;
      }
      throw new Error();
    });

    it('should throw an error if config does not contain instance', () => {
      try {
        new Eureka({eureka: {}});
      } catch (e) {
        expect(e.message).to.equal('missing instance / eureka configuration.');
        return;
      }
      throw new Error();
    });

    it('should throw an error if config does not contain eureka server info', () => {
      try {
        new Eureka({instance: ''});
      } catch (e) {
        expect(e.message).to.equal('missing instance / eureka configuration.');
        return;
      }
      throw new Error();
    });

  });

});