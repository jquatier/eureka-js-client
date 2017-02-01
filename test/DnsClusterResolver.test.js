/* eslint-disable no-unused-expressions */
import sinon from 'sinon';
import chai, { expect } from 'chai';
import sinonChai from 'sinon-chai';
import dns from 'dns';
import merge from 'lodash/merge';

import DnsClusterResolver from '../src/DnsClusterResolver';

chai.use(sinonChai);

function makeConfig(overrides = {}) {
  const config = {
    instance: {
      dataCenterInfo: { metadata: { 'availability-zone': '1b' } },
    },
    eureka: {
      host: 'eureka.mydomain.com',
      servicePath: '/eureka/v2/apps/',
      port: 9999,
      maxRetries: 0,
      ec2Region: 'my-region',
    },
  };
  return merge({}, config, overrides);
}

describe('DNS Cluster Resolver', () => {
  describe('DnsClusterResolver', () => {
    it('should throw error when ec2Region is undefined', () => {
      const config = makeConfig();
      config.eureka.ec2Region = undefined;
      function fn() {
        return new DnsClusterResolver(config);
      }
      expect(fn).to.throw();
    });
  });

  describe('startClusterRefresh()', () => {
    let dnsResolver;
    let refreshStub;
    let clock;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      dnsResolver.refreshCurrentCluster.restore();
      clock.restore();
    });

    it('should start cluster refreshes on interval', () => {
      dnsResolver = new DnsClusterResolver(makeConfig({
        eureka: { clusterRefreshInterval: 300000 },
      }));
      refreshStub = sinon.stub(dnsResolver, 'refreshCurrentCluster');
      clock.tick(300000);
      expect(refreshStub).to.have.been.calledOnce;
      clock.tick(300000);
      expect(refreshStub).to.have.been.calledTwice;
      clock.restore();
    });

    it('should log warning on refresh failure', () => {
      dnsResolver = new DnsClusterResolver(makeConfig({
        eureka: { clusterRefreshInterval: 300000 },
      }));
      refreshStub = sinon.stub(dnsResolver, 'refreshCurrentCluster');
      refreshStub.yields(new Error('fail'));
      clock.tick(300000);
      expect(refreshStub).to.have.been.calledOnce;
      clock.tick(300000);
      expect(refreshStub).to.have.been.calledTwice;
      clock.restore();
    });
  });

  describe('resolveEurekaUrl()', () => {
    let dnsResolver;
    beforeEach(() => {
      dnsResolver = new DnsClusterResolver(makeConfig());
    });

    afterEach(() => {
      dnsResolver.resolveClusterHosts.restore();
    });

    it('should return base Eureka URL using current cluster host', () => {
      const resolveHostsStub = sinon.stub(dnsResolver, 'resolveClusterHosts');
      resolveHostsStub.yields(null, ['a.mydomain.com', 'b.mydomain.com', 'c.mydomain.com']);
      dnsResolver.resolveEurekaUrl((err, eurekaUrl) => {
        expect(eurekaUrl).to.equal('http://a.mydomain.com:9999/eureka/v2/apps/');
      });
    });

    it('should return base Eureka URL using next cluster host on retry', () => {
      const resolveHostsStub = sinon.stub(dnsResolver, 'resolveClusterHosts');
      resolveHostsStub.yields(null, ['a.mydomain.com', 'b.mydomain.com', 'c.mydomain.com']);
      dnsResolver.resolveEurekaUrl((err, eurekaUrl) => {
        expect(eurekaUrl).to.equal('http://b.mydomain.com:9999/eureka/v2/apps/');
        expect(dnsResolver.serverList).to.eql(['b.mydomain.com', 'c.mydomain.com',
          'a.mydomain.com']);
      }, 1);
    });

    it('should return error when resolve fails', () => {
      const resolveHostsStub = sinon.stub(dnsResolver, 'resolveClusterHosts');
      resolveHostsStub.yields(new Error('fail'));
      dnsResolver.resolveEurekaUrl((err) => {
        expect(err).to.not.equal(undefined);
        expect(err.message).to.equal('fail');
      });
    });
  });

  describe('getCurrentCluster()', () => {
    let dnsResolver;
    beforeEach(() => {
      dnsResolver = new DnsClusterResolver(makeConfig());
    });

    afterEach(() => {
      dnsResolver.resolveClusterHosts.restore();
    });

    it('should call cluster refresh if server list is undefined', () => {
      const resolveHostsStub = sinon.stub(dnsResolver, 'resolveClusterHosts');
      resolveHostsStub.onCall(0).yields(null, ['a', 'b', 'c']);
      resolveHostsStub.onCall(1).yields(null, ['f', 'a', 'c']);
      dnsResolver.getCurrentCluster((err, serverList) => {
        expect(serverList).to.include.members(['a', 'b', 'c']);
        dnsResolver.getCurrentCluster((errTwo, serverListTwo) => {
          expect(serverListTwo).to.include.members(['a', 'b', 'c']);
        });
      });
    });

    it('should return error when refresh fails', () => {
      const resolveHostsStub = sinon.stub(dnsResolver, 'resolveClusterHosts');
      resolveHostsStub.yields(new Error('fail'));
      dnsResolver.getCurrentCluster((err) => {
        expect(err).to.not.equal(undefined);
        expect(err.message).to.equal('fail');
      });
    });
  });

  describe('refreshCurrentCluster', () => {
    let dnsResolver;
    beforeEach(() => {
      dnsResolver = new DnsClusterResolver(makeConfig());
    });

    afterEach(() => {
      dnsResolver.resolveClusterHosts.restore();
    });

    it('should refresh server list', () => {
      const resolveHostsStub = sinon.stub(dnsResolver, 'resolveClusterHosts');
      resolveHostsStub.onCall(0).yields(null, ['a', 'b', 'c']);
      resolveHostsStub.onCall(1).yields(null, ['a', 'b', 'c', 'd']);
      dnsResolver.refreshCurrentCluster((err) => {
        expect(err).to.equal(undefined);
        expect(dnsResolver.serverList).to.eql(['a', 'b', 'c']);
        dnsResolver.refreshCurrentCluster((errTwo) => {
          expect(errTwo).to.equal(undefined);
          expect(dnsResolver.serverList).to.eql(['a', 'b', 'c', 'd']);
        });
      });
    });

    it('should maintain server list when cluster remains unchanged', () => {
      const resolveHostsStub = sinon.stub(dnsResolver, 'resolveClusterHosts');
      resolveHostsStub.onCall(0).yields(null, ['a', 'b', 'c']);
      resolveHostsStub.onCall(1).yields(null, ['c', 'a', 'b']);
      dnsResolver.refreshCurrentCluster((err) => {
        expect(err).to.equal(undefined);
        expect(dnsResolver.serverList).to.eql(['a', 'b', 'c']);
        dnsResolver.refreshCurrentCluster((errTwo) => {
          expect(errTwo).to.equal(undefined);
          expect(dnsResolver.serverList).to.eql(['a', 'b', 'c']);
        });
      });
    });

    it('should return error when resolve fails', () => {
      const resolveHostsStub = sinon.stub(dnsResolver, 'resolveClusterHosts');
      resolveHostsStub.yields(new Error('fail'));
      dnsResolver.refreshCurrentCluster((err) => {
        expect(err).to.not.equal(undefined);
        expect(err.message).to.equal('fail');
      });
    });
  });

  describe('resolveClusterHosts()', () => {
    const eurekaHosts = [
      '1a.eureka.mydomain.com',
      '1b.eureka.mydomain.com',
      '1c.eureka.mydomain.com',
    ];

    afterEach(() => {
      dns.resolveTxt.restore();
    });

    it('should resolve hosts using DNS', (done) => {
      const dnsResolver = new DnsClusterResolver(makeConfig());
      const resolveStub = sinon.stub(dns, 'resolveTxt');
      resolveStub.withArgs('txt.my-region.eureka.mydomain.com').yields(null, [eurekaHosts]);
      resolveStub.withArgs('txt.1a.eureka.mydomain.com').yields(null, [['1.2.3.4']]);
      resolveStub.withArgs('txt.1b.eureka.mydomain.com').yields(null, [['2.2.3.4']]);
      resolveStub.withArgs('txt.1c.eureka.mydomain.com').yields(null, [['3.2.3.4']]);
      dnsResolver.resolveClusterHosts((err, hosts) => {
        expect(hosts).to.include.members(['1.2.3.4', '2.2.3.4', '3.2.3.4']);
        done();
      });
    });

    it('should resolve hosts using DNS and zone affinity', (done) => {
      const dnsResolver = new DnsClusterResolver(makeConfig({
        eureka: { preferSameZone: true },
      }));
      const resolveStub = sinon.stub(dns, 'resolveTxt');
      resolveStub.withArgs('txt.my-region.eureka.mydomain.com').yields(null, [eurekaHosts]);
      resolveStub.withArgs('txt.1a.eureka.mydomain.com').yields(null, [['1.2.3.4']]);
      resolveStub.withArgs('txt.1b.eureka.mydomain.com').yields(null, [['2.2.3.4']]);
      resolveStub.withArgs('txt.1c.eureka.mydomain.com').yields(null, [['3.2.3.4']]);
      dnsResolver.resolveClusterHosts((err, hosts) => {
        expect(hosts[0]).to.equal('2.2.3.4');
        expect(hosts).to.include.members(['1.2.3.4', '2.2.3.4', '3.2.3.4']);
        dnsResolver.resolveClusterHosts((error, hostsTwo) => {
          expect(hostsTwo[0]).to.equal('2.2.3.4');
          expect(hostsTwo).to.include.members(['1.2.3.4', '2.2.3.4', '3.2.3.4']);
          done();
        });
      });
    });

    it('should resolve hosts when dataCenterInfo is undefined', (done) => {
      const config = {
        instance: {},
        eureka: {
          preferSameZone: true,
          host: 'eureka.mydomain.com',
          servicePath: '/eureka/v2/apps/',
          port: 9999,
          maxRetries: 0,
          ec2Region: 'my-region',
        },
      };
      const dnsResolver = new DnsClusterResolver(config);
      const resolveStub = sinon.stub(dns, 'resolveTxt');
      resolveStub.withArgs('txt.my-region.eureka.mydomain.com').yields(null, [eurekaHosts]);
      resolveStub.withArgs('txt.1a.eureka.mydomain.com').yields(null, [['1.2.3.4']]);
      resolveStub.withArgs('txt.1b.eureka.mydomain.com').yields(null, [['2.2.3.4']]);
      resolveStub.withArgs('txt.1c.eureka.mydomain.com').yields(null, [['3.2.3.4']]);
      dnsResolver.resolveClusterHosts((err, hosts) => {
        expect(hosts).to.include.members(['1.2.3.4', '2.2.3.4', '3.2.3.4']);
        dnsResolver.resolveClusterHosts((error, hostsTwo) => {
          expect(hostsTwo).to.include.members(['1.2.3.4', '2.2.3.4', '3.2.3.4']);
          done();
        });
      });
    });

    it('should return error when initial DNS lookup fails', () => {
      const resolveCb = sinon.spy();
      const dnsResolver = new DnsClusterResolver(makeConfig());
      const resolveStub = sinon.stub(dns, 'resolveTxt');
      resolveStub.withArgs('txt.my-region.eureka.mydomain.com')
        .yields(new Error('dns error'), null);

      function shouldNotThrow() {
        dnsResolver.resolveClusterHosts(resolveCb);
      }

      expect(shouldNotThrow).to.not.throw();
      expect(dns.resolveTxt).to.have.been.calledWithMatch('txt.my-region.eureka.mydomain.com');
      expect(resolveCb).to.have.been.calledWithMatch({
        message: 'Error resolving eureka cluster ' +
          'for region [my-region] using DNS: [Error: dns error]',
      });
    });

    it('should return error when DNS lookup fails for an individual zone', () => {
      const resolveCb = sinon.spy();
      const dnsResolver = new DnsClusterResolver(makeConfig({
        eureka: { host: 'eureka.mydomain.com', port: 9999, ec2Region: 'my-region' },
      }));
      const resolveStub = sinon.stub(dns, 'resolveTxt');
      resolveStub.withArgs('txt.my-region.eureka.mydomain.com').yields(null, [eurekaHosts]);
      resolveStub.withArgs('txt.1a.eureka.mydomain.com').yields(null, [['1.2.3.4']]);
      resolveStub.withArgs('txt.1b.eureka.mydomain.com').yields(new Error('dns error'), null);
      resolveStub.withArgs('txt.1c.eureka.mydomain.com').yields(null, [['3.2.3.4']]);

      function shouldNotThrow() {
        dnsResolver.resolveClusterHosts(resolveCb);
      }

      expect(shouldNotThrow).to.not.throw();
      expect(resolveCb).to.have.been.calledWithMatch({
        message: 'Error resolving cluster zone txt.1b.eureka.mydomain.com: [Error: dns error]',
      });
    });

    it('should return error when no hosts were found', (done) => {
      const dnsResolver = new DnsClusterResolver(makeConfig());
      const resolveStub = sinon.stub(dns, 'resolveTxt');
      resolveStub.withArgs('txt.my-region.eureka.mydomain.com').yields(null, [eurekaHosts]);
      resolveStub.withArgs('txt.1a.eureka.mydomain.com').yields(null, []);
      resolveStub.withArgs('txt.1b.eureka.mydomain.com').yields(null, []);
      resolveStub.withArgs('txt.1c.eureka.mydomain.com').yields(null, []);
      dnsResolver.resolveClusterHosts((err) => {
        expect(err).to.not.equal(undefined);
        expect(err.message).to.equal('Unable to locate any Eureka hosts in any ' +
          'zone via DNS @ txt.my-region.eureka.mydomain.com');
        done();
      });
    });
  });
});
