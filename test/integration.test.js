import Eureka from '../src/index';
import { expect } from 'chai';

describe('Integration Test', () => {
  let client;
  let config;
  before(() => {
    config = {
      instance: {
        app: 'jqservice',
        hostName: 'localhost',
        ipAddr: '127.0.0.1',
        port: 8080,
        vipAddress: 'jq.test.something.com',
        dataCenterInfo: {
          name: 'MyOwn',
        },
      },
      eureka: {
        fetchRegistry: true,
        host: '192.168.99.100',
        port: 8080,
      },
    };
    client = new Eureka(config);
  });

  it('should register one instance with Eureka', (done) => {
    client.start(done);
  });

  it('should be able to get instance by the app id', () => {
    const instances = client.getInstancesByAppId(config.instance.app);
    expect(instances.length).to.equal(1);
  });

  it('should be able to get instance by the vipAddress', () => {
    const instances = client.getInstancesByVipAddress(config.instance.vipAddress);
    expect(instances.length).to.equal(1);
  });

  it('should be able to deregister with Eureka server', (done) => {
    client.stop(done);
  });
});
