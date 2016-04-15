import Eureka from '../src/index';
import { expect } from 'chai';

describe('Integration Test', () => {
  const config = {
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
      heartbeatInterval: 30000,
      registryFetchInterval: 5000,
      fetchRegistry: true,
      waitForRegistry: true,
      servicePath: '/eureka/v2/apps/',
      ssl: false,
      useDns: false,
      fetchMetadata: true,
      host: 'localhost',
      port: 8080,
    },
  };

  const client = new Eureka(config);
  before((done) => {
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

  after((done) => {
    client.stop(done);
  });
});
