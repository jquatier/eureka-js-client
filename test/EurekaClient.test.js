import sinon from 'sinon';
import chai, { expect } from 'chai';
import sinonChai from 'sinon-chai';
import request from 'request';
import dns from 'dns';
import { Eureka } from '../src/EurekaClient';
import { join } from 'path';
import merge from 'deepmerge';

chai.use(sinonChai);

function makeConfig(overrides = {}) {
  const config = {
    instance: {app: 'app', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name: 'Amazon'}},
    eureka: {host: '127.0.0.1', port: 9999}
  };
  return merge(config, overrides);
}

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

  describe('get instanceId()', () => {

    it('should return hostname for non-AWS datacenters', () => {
      let config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      let client = new Eureka(config);
      expect(client.instanceId).to.equal('myhost');
    });

    it('should return instance ID for AWS datacenters', () => {
      let config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'Amazon', metadata: {'instance-id': 'i123'}}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      let client = new Eureka(config);
      expect(client.instanceId).to.equal('i123');
    });

  });

  describe('start()', () => {

    let config, client, registerSpy, fetchRegistrySpy;
    before(() => {
      config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
      registerSpy = sinon.stub(client, 'register').callsArg(0);
      fetchRegistrySpy = sinon.stub(client, 'fetchRegistry').callsArg(0);
    });

    after(() => {
      registerSpy.restore();
      fetchRegistrySpy.restore();
    });

    it('should call register and fetch registry', (done) => {
      client.start(function() {
        expect(registerSpy).to.have.been.calledOnce;
        expect(fetchRegistrySpy).to.have.been.calledOnce;
        done();
      });
    });

  });

  describe('stop()', () => {

    let config, client, deregisterSpy;
    before(() => {
      config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
      deregisterSpy = sinon.stub(client, 'deregister').callsArg(0);
    });

    after(() => {
      deregisterSpy.restore();
    });

    it('should call deregister', () => {
      let stopCb = sinon.spy();
      client.stop(stopCb);

      expect(deregisterSpy).to.have.been.calledOnce;
      expect(stopCb).to.have.been.calledOnce;
    });

  });

  describe('register()', () => {

    let config, client, heartbeatsSpy, registryFetchSpy;
    beforeEach(() => {
      config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
      heartbeatsSpy = sinon.stub(client, 'startHeartbeats');
      registryFetchSpy = sinon.stub(client, 'startRegistryFetches');
    });

    afterEach(() => {
      request.post.restore();
      heartbeatsSpy.restore();
      registryFetchSpy.restore();
    });

    it('should call register URI, and initiate heartbeats / registry fetches', () => {

      sinon.stub(request, 'post').yields(null, {statusCode: 204}, null)
      let registerCb = sinon.spy();
      client.register(registerCb);

      expect(request.post).to.have.been.calledWithMatch({
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

      expect(heartbeatsSpy).to.have.been.calledOnce;
      expect(registryFetchSpy).to.have.been.calledOnce;
      expect(registerCb).to.have.been.calledWithMatch(null);

    });

    it('should throw error for non-204 response', () => {

      sinon.stub(request, 'post').yields(null, {statusCode: 500}, null);
      let registerCb = sinon.spy();
      client.register(registerCb);

      expect(registerCb).to.have.been.calledWithMatch({message:'eureka registration FAILED: status: 500 body: null'});

      expect(heartbeatsSpy).to.have.callCount(0);
      expect(registryFetchSpy).to.have.callCount(0);

    });

    it('should throw error for request error', () => {

      sinon.stub(request, 'post').yields(new Error('request error'), null, null);
      let registerCb = sinon.spy();
      client.register(registerCb);

      expect(registerCb).to.have.been.calledWithMatch({message:'request error'});

      expect(heartbeatsSpy).to.have.callCount(0);
      expect(registryFetchSpy).to.have.callCount(0);

    });

  });

  describe('deregister()', () => {

    let config, client;
    beforeEach(() => {
      config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
    });

    afterEach(() => {
      request.del.restore();
    });

    it('should call deregister URI', () => {
      sinon.stub(request, 'del').yields(null, {statusCode: 200}, null);;
      let deregisterCb = sinon.spy();
      client.deregister(deregisterCb);

      expect(request.del).to.have.been.calledWithMatch({
        url: 'http://127.0.0.1:9999/eureka/v2/apps/app/myhost'
      });

      expect(deregisterCb).to.have.been.calledWithMatch(null);

    });

    it('should throw error for non-200 response', () => {
      sinon.stub(request, 'del').yields(null, {statusCode: 500}, null);;
      let deregisterCb = sinon.spy();
      client.deregister(deregisterCb);

      expect(deregisterCb).to.have.been.calledWithMatch({message:'eureka deregistration FAILED: status: 500 body: null'});

    });

    it('should throw error for request error', () => {
      sinon.stub(request, 'del').yields(new Error('request error'), null, null);
      let deregisterCb = sinon.spy();
      client.deregister(deregisterCb);

      expect(deregisterCb).to.have.been.calledWithMatch({message:'request error'});

    });

  });

  describe('renew()', () => {

    let config, client;
    beforeEach(() => {
      config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
    });

    afterEach(() => {
      request.put.restore();
    });

    it('should call heartbeat URI', () => {
      sinon.stub(request, 'put').yields(null, {statusCode: 200}, null)
      client.renew();

      expect(request.put).to.have.been.calledWithMatch({
        url: 'http://127.0.0.1:9999/eureka/v2/apps/app/myhost'
      });

    });

  });

  describe('eureka-client.yml', () => {
    let stub;
    before(() => {
      stub = sinon.stub(process, 'cwd').returns(__dirname);
    });

    after(() => {
      stub.restore();
    });

    it('should load the correct', () => {
      const client = new Eureka(makeConfig());
      console.log(client.config);
      expect(client.config.eureka.custom).to.equal('test');
    });

    it('should load the environment overrides', () => {
      const client = new Eureka(makeConfig());
      expect(client.config.eureka.otherCustom).to.equal('test2');
      expect(client.config.eureka.overrides).to.equal(2);
    });

    it('should support a `cwd` and `filename` property', () => {
      const client = new Eureka(makeConfig({
        cwd: join(__dirname, 'fixtures'),
        filename: 'config'
      }));
      expect(client.config.eureka.fromFixture).to.equal(true);
    });
  });

  describe('validateConfig()', () => {

    let config;
    beforeEach(() => {
      config = {
        instance: {app: 'app', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name: 'Amazon'}},
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
        instance: {app: 'app', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name: 'Amazon'}},
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
        instance: {app: 'app', vipAddress: '1.2.3.4', port: 9999, dataCenterInfo: {name: 'Amazon'}},
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

  describe('fetchRegistry()', () => {

    let config, client, transformRegistrySpy;
    beforeEach(() => {
      config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
      transformRegistrySpy = sinon.stub(client, 'transformRegistry');
    });

    afterEach(() => {
      request.get.restore();
      client.transformRegistry.restore();
    });

    it('should call registry URI', () => {

      sinon.stub(request, 'get').yields(null, {statusCode: 200}, null)
      let registryCb = sinon.spy();
      client.fetchRegistry(registryCb);

      expect(request.get).to.have.been.calledWithMatch({
        url: 'http://127.0.0.1:9999/eureka/v2/apps/',
        headers: { Accept: 'application/json' }
      });

      expect(registryCb).to.have.been.calledWithMatch(null);

    });

    it('should throw error for non-200 response', () => {

      sinon.stub(request, 'get').yields(null, {statusCode: 500}, null);
      let registryCb = sinon.spy();
      client.fetchRegistry(registryCb);

      expect(registryCb).to.have.been.calledWithMatch({message:'Unable to retrieve registry from Eureka server'});

    });

    it('should throw error for request error', () => {

      sinon.stub(request, 'get').yields(new Error('request error'), null, null);
      let registryCb = sinon.spy();
      client.fetchRegistry(registryCb);

      expect(registryCb).to.have.been.calledWithMatch({message:'request error'});

    });

  });

  describe('transformRegistry()', () => {

    let client, config, registry, app1, app2, transformSpy;
    beforeEach(() => {
      config = {
        instance: {app: 'app', vipAddress: '1.2.3.4', port: 9999, dataCenterInfo: {name: 'Amazon'}},
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
        instance: {app: 'app', vipAddress: '1.2.3.4', port: 9999, dataCenterInfo: {name: 'Amazon'}},
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

  describe('addInstanceMetadata()', () => {

    let client, config, metadataSpy;
    beforeEach(() => {
      config = {
        instance: {
          app: 'app', vipAddress: '1.2.3.4', port: 9999, dataCenterInfo: { name: 'Amazon'},
          statusPageUrl: 'http://__HOST__:8080/',
          healthCheckUrl: 'http://__HOST__:8077/healthcheck',
        },
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);
      metadataSpy = sinon.spy();

      sinon.stub(client.metadataClient, 'fetchMetadata').yields({
        'public-hostname': 'ec2-127-0-0-1.us-fake-1.mydomain.com',
        'public-ipv4': '54.54.54.54'
      });
    });

    afterEach(() => {
      client.metadataClient.fetchMetadata.restore();
    });

    it('should update hosts with AWS metadata public host', () => {
      client.addInstanceMetadata(metadataSpy);
      expect(client.config.instance.hostName).to.equal('ec2-127-0-0-1.us-fake-1.mydomain.com');
      expect(client.config.instance.ipAddr).to.equal('54.54.54.54');
      expect(client.config.instance.statusPageUrl).to.equal('http://ec2-127-0-0-1.us-fake-1.mydomain.com:8080/');
      expect(client.config.instance.healthCheckUrl).to.equal('http://ec2-127-0-0-1.us-fake-1.mydomain.com:8077/healthcheck');
    });

  });

  describe('locateEurekaHostUsingDns()', () => {

    let config, client;
    let eurekaHosts = ['1a.eureka.mydomain.com','1b.eureka.mydomain.com','1c.eureka.mydomain.com'];

    afterEach(() => {
      dns.resolveTxt.restore();
    });

    it('should throw error when ec2Region is undefined', () => {
      config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: '127.0.0.1', port: 9999}
      };
      client = new Eureka(config);

      sinon.stub(dns, 'resolveTxt').yields(null, []);
      function noRegion() {
        client.locateEurekaHostUsingDns();
      }
      expect(noRegion).to.throw(Error);
    });

    it('should lookup server list using DNS', () => {
      config = {
        instance: {app: 'app', hostName: 'myhost', vipAddress: '1.2.2.3', port: 9999, dataCenterInfo: {name:'MyOwn'}},
        eureka: {host: 'eureka.mydomain.com', port: 9999, ec2Region: 'my-region'}
      };
      client = new Eureka(config);

      let locateCb = sinon.spy();
      let resolveStub = sinon.stub(dns, 'resolveTxt');
      resolveStub.onCall(0).yields(null, [eurekaHosts]);
      resolveStub.onCall(1).yields(null, [['1.2.3.4']]);
      client.locateEurekaHostUsingDns(locateCb);

      expect(dns.resolveTxt).to.have.been.calledWithMatch('txt.my-region.eureka.mydomain.com');
      expect(dns.resolveTxt).to.have.been.calledWith(sinon.match(function(value) {
        return eurekaHosts.indexOf(value);
      }));
      expect(locateCb).to.have.been.calledWithMatch('1.2.3.4');
    });
  });

});
