import sinon from 'sinon';
import {expect} from 'chai';
import {Eureka} from '../src/eureka-client';

describe('Eureka client', () => {

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
            port: true,
            dataCenterInfo: {
              name: 'MyOwn'
            }
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
            port: true,
            dataCenterInfo: {
              name: 'MyOwn'
            }
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

  describe('validateConfig()', () => {

    let config;
    beforeEach(() => {
      config = {
        instance: {app: 'app', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: 'Amazon'},
        eureka: {host: '127.0.0.1', port: 9999}
      };
    });

    it('should throw an exception with a missing instance.app', () => {
      function badConfig() {
        delete config.instance.app;
        return new Eureka(config);
      }
      expect(badConfig).to.throw(TypeError);
    });

    it('should throw an exception with a missing instance.vipAddress', () => {
      function badConfig() {
        delete config.instance.vipAddress;
        return new Eureka(config);
      }
      expect(badConfig).to.throw(TypeError);
    });

    it('should throw an exception with a missing instance.port', () => {
      function badConfig() {
        delete config.instance.port;
        return new Eureka(config);
      }
      expect(badConfig).to.throw(TypeError);
    });

    it('should throw an exception with a missing instance.dataCenterInfo', () => {
      function badConfig() {
        delete config.instance.dataCenterInfo;
        return new Eureka(config);
      }
      expect(badConfig).to.throw(TypeError);
    });

    it('should throw an exception with a missing eureka.host', () => {
      function badConfig() {
        delete config.eureka.host;
        return new Eureka(config);
      }
      expect(badConfig).to.throw(TypeError);
    });

    it('should throw an exception with a missing eureka.port', () => {
      function badConfig() {
        delete config.eureka.port;
        return new Eureka(config);
      }
      expect(badConfig).to.throw(TypeError);
    });

  });

  describe('getInstancesByAppId()', () => {

    let client, config;
    beforeEach(() => {
      config = {
        instance: {app: 'app', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: 'Amazon'},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
    });

    it('should throw an exception if no vipAddress is provided', () => {
      function noAppId() {
        client.getInstancesByAppId();
      }
      expect(noAppId).to.throw(Error);
    });

    it('should return a list of instances if appId is registered', () => {
      let appId = 'theservicename'.toUpperCase();
      let expectedInstances = [{host: '127.0.0.1'}];
      client.cache.app[appId] = expectedInstances;
      let actualInstances = client.getInstancesByAppId(appId);
      expect(actualInstances).to.equal(expectedInstances);
    });

    it('should throw an error if no instances were found for given vipAddress', () => {
      let appId = 'theservicename'.toUpperCase();
      client.cache.app[appId] = null;
      function shouldThrow() {
        client.getInstancesByAppId(appId)
      }
      expect(shouldThrow).to.throw();
    });

  });

  describe('getInstancesByVipAddress()', () => {

    let client, config;
    beforeEach(() => {
      config = {
        instance: {app: 'app', vipAddress: '1.2.3.4', port: 9999, dataCenterInfo: 'Amazon'},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
    });

    it('should throw an exception if no appId is provided', () => {
      function noAppId() {
        client.getInstancesByVipAddress();
      }
      expect(noAppId).to.throw(Error);
    });

    it('should return a list of instances if vipAddress is registered', () => {
      let vipAddress = 'the.vip.address';
      let expectedInstances = [{host: '127.0.0.1'}];
      client.cache.vip[vipAddress] = expectedInstances;
      let actualInstances = client.getInstancesByVipAddress(vipAddress);
      expect(actualInstances).to.equal(expectedInstances);
    });

    it('should throw an error if no instances were found for given vipAddress', () => {
      let vipAddress = 'the.vip.address';
      client.cache.vip[vipAddress] = null;
      function shouldThrow() {
        client.getInstancesByVipAddress(vipAddress)
      }
      expect(shouldThrow).to.throw();
    });

  });

  describe('transformRegistry()', () => {

    let client, config, registry, vipAddress,
      appName, instance, instance2, vipAddress2;
    beforeEach(() => {
      config = {
        instance: {app: 'app', vipAddress: '1.2.3.4', port: 9999, dataCenterInfo: 'Amazon'},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      appName = 'thename'.toUpperCase();
      vipAddress = 'theVip';
      vipAddress2 = 'theVip2';
      instance = {host: '127.0.0.1', vipAddress: vipAddress};
      instance2 = {host: '127.0.0.2', vipAddress: vipAddress2};
      registry = {
        applications: {
          application: [{name: appName}]
        }
      };
      client = new Eureka(config);
    });

    it('should throw an error if no registry is provided', () => {
      function noRegistry() {
        client.transformRegistry();
      }
      expect(noRegistry).to.throw();
    });

    it('should transform a registry with apps with one instance', () => {
      registry.applications.application[0].instance = instance;
      client.transformRegistry(registry);
      expect(client.cache.app[appName].host).to.equal(instance.host);
      expect(client.cache.vip[vipAddress].vipAddress).to.equal(instance.vipAddress);
    });

    it('should transform a registry with apps with a list of instances', () => {
      registry.applications.application[0].instance = [instance, instance2];
      client.transformRegistry(registry);
      expect(client.cache.vip[vipAddress].length).to.equal(2);
      expect(client.cache.app[appName].length).to.equal(2);
    });

  });

});
