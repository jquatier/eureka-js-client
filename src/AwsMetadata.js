import request from 'request';
import async from 'async';
import Logger from './Logger';

/*
  Utility class for pulling AWS metadata that Eureka requires when
  registering as an Amazon instance (datacenter).
*/
export default class AwsMetadata {

  constructor(config = {}) {
    this.logger = config.logger || new Logger();
    this.ecs = !!config.ecs;
    this.host = this.ecs ? '169.254.170.2' : '169.254.169.254';
  }

  fetchMetadata(resultsCallback) {
    return this.ecs
      ? this.fetchEcsMetadata(resultsCallback)
      : this.fetchEc2Metadata(resultsCallback);
  }

  fetchEcsMetadata(resultsCallback) {
    this.lookupMetadataKey('', (error, results) => {
      try {
        const resultsObj = JSON.parse(results);

        const metadata = resultsObj.Containers.find(container => (container.Type && container.Type === 'NORMAL'));
        this.logger.debug(`Found Task ImageId(${metadata.ImageID}) DockerId(${metadata.DockerId}).`);

        const privateIp = metadata.Networks[0].IPv4Addresses[0];
        this.logger.debug('Found Task IP', privateIp);

        const taskArn = metadata.Labels['com.amazonaws.ecs.task-arn'];
        this.logger.debug('Found Task ARN', taskArn);

        const taskInfo = taskArn.match(/arn:aws:ecs:(\w+-\w+-\d+):(\d+):/);
        const az = taskInfo[1];
        this.logger.debug('Found Task AZ', az);
        const accountId = taskInfo[2];
        this.logger.debug('Found Task AccountId', accountId);

        // assumes privateIp networking. PublicIp is just for proper healthcheckUrl.
        resultsCallback({
          accountId,
          'instance-id': metadata.DockerId,
          'instance-type': metadata.DockerName,
          'image-id': metadata.ImageID,
          'private-ipv4': privateIp,
          'private-hostname': privateIp,
          'availability-zone': az,
          'public-ipv4': privateIp,
          'public-hostname': privateIp,
        });
      } catch (e) {
        this.logger.error(e);
        resultsCallback();
      }
    });
  }

  fetchEc2Metadata(resultsCallback) {
    async.parallel({
      'ami-id': callback => {
        this.lookupMetadataKey('ami-id', callback);
      },
      'instance-id': callback => {
        this.lookupMetadataKey('instance-id', callback);
      },
      'instance-type': callback => {
        this.lookupMetadataKey('instance-type', callback);
      },
      'local-ipv4': callback => {
        this.lookupMetadataKey('local-ipv4', callback);
      },
      'local-hostname': callback => {
        this.lookupMetadataKey('local-hostname', callback);
      },
      'availability-zone': callback => {
        this.lookupMetadataKey('placement/availability-zone', callback);
      },
      'public-hostname': callback => {
        this.lookupMetadataKey('public-hostname', callback);
      },
      'public-ipv4': callback => {
        this.lookupMetadataKey('public-ipv4', callback);
      },
      mac: callback => {
        this.lookupMetadataKey('mac', callback);
      },
      accountId: callback => {
        // the accountId is in the identity document.
        this.lookupInstanceIdentity((error, identity) => {
          callback(null, identity ? identity.accountId : null);
        });
      },
    }, (error, results) => {
      // we need the mac before we can lookup the vpcId...
      this.lookupMetadataKey(`network/interfaces/macs/${results.mac}/vpc-id`, (err, vpcId) => {
        results['vpc-id'] = vpcId;
        this.logger.debug('Found Instance AWS Metadata', results);
        const filteredResults = Object.keys(results).reduce((filtered, prop) => {
          if (results[prop]) filtered[prop] = results[prop];
          return filtered;
        }, {});
        resultsCallback(filteredResults);
      });
    });
  }

  lookupMetadataKey(key, callback) {
    request.get({
      url: this.ecs
        ? `http://${this.host}/v2/metadata/${key}`
        : `http://${this.host}/latest/meta-data/${key}`,
    }, (error, response, body) => {
      if (error) {
        this.logger.error('Error requesting metadata key', error);
      }
      callback(null, (error || response.statusCode !== 200) ? null : body);
    });
  }

  lookupInstanceIdentity(callback) {
    request.get({
      url: `http://${this.host}/latest/dynamic/instance-identity/document`,
    }, (error, response, body) => {
      if (error) {
        this.logger.error('Error requesting instance identity document', error);
      }
      callback(null, (error || response.statusCode !== 200) ? null : JSON.parse(body));
    });
  }
}
