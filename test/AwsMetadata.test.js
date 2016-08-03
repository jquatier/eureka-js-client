import sinon from 'sinon';
import chai, { expect } from 'chai';
import sinonChai from 'sinon-chai';
import request from 'request';
import AwsMetadata from '../src/AwsMetadata';

chai.use(sinonChai);

describe('AWS Metadata client', () => {
  describe('fetchMetadata()', () => {
    let client;
    beforeEach(() => {
      client = new AwsMetadata({ host: '127.0.0.1:8888' });
    });

    afterEach(() => {
      request.get.restore();
    });

    it('should call metadata URIs', () => {
      const requestStub = sinon.stub(request, 'get');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/ami-id',
      }).yields(null, { statusCode: 200 }, 'ami-123');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/instance-id',
      }).yields(null, { statusCode: 200 }, 'i123');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/instance-type',
      }).yields(null, { statusCode: 200 }, 'medium');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/local-ipv4',
      }).yields(null, { statusCode: 200 }, '1.1.1.1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/local-hostname',
      }).yields(null, { statusCode: 200 }, 'ip-127-0-0-1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/placement/availability-zone',
      }).yields(null, { statusCode: 200 }, 'fake-1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/public-hostname',
      }).yields(null, { statusCode: 200 }, 'ec2-127-0-0-1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/public-ipv4',
      }).yields(null, { statusCode: 200 }, '2.2.2.2');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/mac',
      }).yields(null, { statusCode: 200 }, 'AB:CD:EF:GH:IJ');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/dynamic/instance-identity/document',
      }).yields(null, { statusCode: 200 }, '{"accountId":"123456"}');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/network/interfaces/macs/AB:CD:EF:GH:IJ/vpc-id',
      }).yields(null, { statusCode: 200 }, 'vpc123');

      const fetchCb = sinon.spy();
      client.fetchMetadata(fetchCb);

      expect(request.get).to.have.been.callCount(11);

      expect(fetchCb).to.have.been.calledWithMatch({
        accountId: '123456',
        'ami-id': 'ami-123',
        'availability-zone': 'fake-1',
        'instance-id': 'i123',
        'instance-type': 'medium',
        'local-hostname': 'ip-127-0-0-1',
        'local-ipv4': '1.1.1.1',
        mac: 'AB:CD:EF:GH:IJ',
        'public-hostname': 'ec2-127-0-0-1',
        'public-ipv4': '2.2.2.2',
        'vpc-id': 'vpc123',
      });
    });

    it('should call metadata URIs and filter out null and undefined values', () => {
      const requestStub = sinon.stub(request, 'get');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/ami-id',
      }).yields(null, { statusCode: 200 }, 'ami-123');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/instance-id',
      }).yields(null, { statusCode: 200 }, 'i123');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/instance-type',
      }).yields(null, { statusCode: 200 }, 'medium');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/local-ipv4',
      }).yields(null, { statusCode: 200 }, '1.1.1.1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/local-hostname',
      }).yields(null, { statusCode: 200 }, 'ip-127-0-0-1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/placement/availability-zone',
      }).yields(null, { statusCode: 200 }, 'fake-1');

      let undef;
      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/public-hostname',
      }).yields(null, { statusCode: 200 }, undef);

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/public-ipv4',
      }).yields(null, { statusCode: 200 }, null);

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/mac',
      }).yields(null, { statusCode: 200 }, 'AB:CD:EF:GH:IJ');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/dynamic/instance-identity/document',
      }).yields(null, { statusCode: 200 }, '{"accountId":"123456"}');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/network/interfaces/macs/AB:CD:EF:GH:IJ/vpc-id',
      }).yields(null, { statusCode: 200 }, 'vpc123');

      const fetchCb = sinon.spy();
      client.fetchMetadata(fetchCb);

      expect(request.get).to.have.been.callCount(11);
      expect(fetchCb).to.have.been.calledWithMatch({
        accountId: '123456',
        'ami-id': 'ami-123',
        'availability-zone': 'fake-1',
        'instance-id': 'i123',
        'instance-type': 'medium',
        'local-hostname': 'ip-127-0-0-1',
        'local-ipv4': '1.1.1.1',
        mac: 'AB:CD:EF:GH:IJ',
        'vpc-id': 'vpc123',
      });
      expect(fetchCb.firstCall.args[0]).to.have.all.keys(['ami-id',
        'instance-id',
        'instance-type',
        'local-ipv4',
        'local-hostname',
        'availability-zone',
        'mac',
        'accountId',
        'vpc-id']);
    });

    it('should call metadata URIs and filter out errored values', () => {
      const requestStub = sinon.stub(request, 'get');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/ami-id',
      }).yields(null, { statusCode: 200 }, 'ami-123');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/instance-id',
      }).yields(null, { statusCode: 200 }, 'i123');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/instance-type',
      }).yields(null, { statusCode: 200 }, 'medium');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/local-ipv4',
      }).yields(null, { statusCode: 200 }, '1.1.1.1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/local-hostname',
      }).yields(null, { statusCode: 200 }, 'ip-127-0-0-1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/placement/availability-zone',
      }).yields(null, { statusCode: 200 }, 'fake-1');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/public-hostname',
      }).yields(new Error('fail'));

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/public-ipv4',
      }).yields(new Error('fail'));

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/mac',
      }).yields(null, { statusCode: 200 }, 'AB:CD:EF:GH:IJ');

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/dynamic/instance-identity/document',
      }).yields(new Error('fail'));

      requestStub.withArgs({
        url: 'http://127.0.0.1:8888/latest/meta-data/network/interfaces/macs/AB:CD:EF:GH:IJ/vpc-id',
      }).yields(null, { statusCode: 200 }, 'vpc123');

      const fetchCb = sinon.spy();
      client.fetchMetadata(fetchCb);

      expect(request.get).to.have.been.callCount(11);
      expect(fetchCb).to.have.been.calledWithMatch({
        'ami-id': 'ami-123',
        'availability-zone': 'fake-1',
        'instance-id': 'i123',
        'instance-type': 'medium',
        'local-hostname': 'ip-127-0-0-1',
        'local-ipv4': '1.1.1.1',
        mac: 'AB:CD:EF:GH:IJ',
        'vpc-id': 'vpc123',
      });
      expect(fetchCb.firstCall.args[0]).to.have.all.keys(['ami-id',
        'instance-id',
        'instance-type',
        'local-ipv4',
        'local-hostname',
        'availability-zone',
        'mac',
        'vpc-id']);
    });
  });
});
