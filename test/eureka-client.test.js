import sinon from 'sinon';
import chai from 'chai';
import {expect} from 'chai';
import sinonChai from 'sinon-chai';
chai.use(sinonChai);

import request from 'request';
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

  describe('register()', () => { 

    it('should call register URI with correct arguments', () => {
      let config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      let client = new Eureka(config);
      let postSpy = sinon.stub(request, 'post');

      client.register(sinon.spy());

      expect(postSpy).to.have.been.calledWithMatch({ 
        body: {
          instance: {
            app: 'app',
            hostName: 'myhost',
            dataCenterInfo: { name: 'MyOwn' },
            port: 9999,
            status: 'UP',
            vipAddress: '1.2.2.3'
          }
        },
        json: true,
        url: 'http://127.0.0.1:9999/eureka/v2/apps/app'
      });

      postSpy.restore();
    });

  });

  describe('deregister()', () => { 

    it('should call deregister URI with correct arguments', () => {
      let config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      let client = new Eureka(config);
      let delSpy = sinon.stub(request, 'del');

      client.deregister(sinon.spy());

      expect(delSpy).to.have.been.calledWithMatch({ 
        url: 'http://127.0.0.1:9999/eureka/v2/apps/app/myhost'
      });

      delSpy.restore();
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

    it('should throw an exception if no appId is provided', () => {
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

    it('should throw an error if no instances were found for given appId', () => {
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

    it('should throw an exception if no vipAddress is provided', () => {
      function noVipAddress() {
        client.getInstancesByVipAddress();
      }
      expect(noVipAddress).to.throw(Error);
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

    let client, config, registry, app1, app2, transformSpy;
    beforeEach(() => {
      config = {
        instance: {app: 'app', vipAddress: '1.2.3.4', port: 9999, dataCenterInfo: 'Amazon'},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      registry = {
        applications: {application: {}}
      };
      app1 = {};
      app2 = {};
      client = new Eureka(config);
      transformSpy = sinon.stub(client, 'transformApp');
    });

    afterEach(() => {
      transformSpy.restore();
    });

    it('should throw an error if no registry is provided', () => {
      function noRegistry() {
        client.transformRegistry();
      }
      expect(noRegistry).to.throw();
    });

    it('should return clear the cache if no applications exist', () => {
      registry.applications.application = null;
      client.transformRegistry(registry);
      expect(client.cache.vip).to.be.empty;
      expect(client.cache.app).to.be.empty;
    });

    it('should transform a registry with one app', () => {
      registry.applications.application = app1;
      client.transformRegistry(registry);
      expect(transformSpy.callCount).to.equal(1);
    });

    it('should transform a registry with two or more apps', () => {
      registry.applications.application = [app1, app2];
      client.transformRegistry(registry);
      expect(transformSpy.callCount).to.equal(2);
    });

  });

  describe('transformApp()', () => {

    let client, config, app, instance1, instance2, theVip;
    beforeEach(() => {
      config = {
        instance: {app: 'app', vipAddress: '1.2.3.4', port: 9999, dataCenterInfo: 'Amazon'},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
      theVip = 'theVip';
      instance1 = {host: '127.0.0.1', port: 1000, vipAddress: theVip};
      instance2 = {host: '127.0.0.2', port: 2000, vipAddress: theVip};
      app = {name: 'theapp'};
    });

    it('should transform an app with one instance', () => {
      app.instance = instance1;
      client.transformApp(app);
      expect(client.cache.app[app.name.toUpperCase()].length).to.equal(1);
      expect(client.cache.vip[theVip].length).to.equal(1);
    });

    it('should transform an app with two or more instances', () => {
      app.instance = [instance1, instance2];
      client.transformApp(app);
      expect(client.cache.app[app.name.toUpperCase()].length).to.equal(2);
      expect(client.cache.vip[theVip].length).to.equal(2);
    });
  });

});
