import request from 'request';
import fs from 'fs';
import yaml from 'js-yaml';
import merge from 'deepmerge';
import path from 'path';
import dns from 'dns';
import { series } from 'async';
import { EventEmitter } from 'events';

import AwsMetadata from './AwsMetadata';
import Logger from './Logger';
import defaultConfig from './defaultConfig';

function noop() {}

/*
  Eureka JS client
  This module handles registration with a Eureka server, as well as heartbeats
  for reporting instance health.
*/

function fileExists(file) {
  try {
    return fs.statSync(file);
  } catch (e) {
    return false;
  }
}

function getYaml(file) {
  let yml = {};
  if (!fileExists(file)) {
    return yml; // no configuration file
  }
  try {
    yml = yaml.safeLoad(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    // configuration file exists but was malformed
    throw new Error(`Error loading YAML configuration file: ${file} ${e}`);
  }
  return yml;
}

export default class Eureka extends EventEmitter {

  constructor(config = {}) {
    super();
    // Allow passing in a custom logger:
    this.logger = config.logger || new Logger();

    this.logger.debug('initializing eureka client');

    // Load up the current working directory and the environment:
    const cwd = config.cwd || process.cwd();
    const env = process.env.NODE_ENV || 'development';

    const filename = config.filename || 'eureka-client';

    // Load in the configuration files:
    this.config = merge(defaultConfig, getYaml(path.join(cwd, `${filename}.yml`)));
    this.config = merge(this.config, getYaml(path.join(cwd, `${filename}-${env}.yml`)));

    // Finally, merge in the passed configuration:
    this.config = merge(this.config, config);

    // Validate the provided the values we need:
    this.validateConfig(this.config);

    if (this.amazonDataCenter) {
      this.metadataClient = new AwsMetadata({
        logger: this.logger,
      });
    }

    this.cache = {
      app: {},
      vip: {},
    };
  }

  /*
    Helper method to get the instance ID. If the datacenter is AWS, this will be the
    instance-id in the metadata. Else, it's the hostName.
  */
  get instanceId() {
    if (this.config.instance.instanceId) {
      return this.config.instance.instanceId;
    } else if (this.amazonDataCenter) {
      return this.config.instance.dataCenterInfo.metadata['instance-id'];
    }
    return this.config.instance.hostName;
  }

  /*
    Helper method to determine if this is an AWS datacenter.
  */
  get amazonDataCenter() {
    return (
      this.config.instance.dataCenterInfo.name &&
      this.config.instance.dataCenterInfo.name.toLowerCase() === 'amazon'
    );
  }

  /*
    Build the base Eureka server URL + path
  */
  buildEurekaUrl(callback = noop) {
    this.lookupCurrentEurekaHost((err, eurekaHost) => {
      if (err) return callback(err);
      const { port, servicePath, ssl } = this.config.eureka;
      const host = ssl ? 'https' : 'http';
      callback(null, `${host}://${eurekaHost}:${port}${servicePath}`);
    });
  }

  /*
    Registers instance with Eureka, begins heartbeats, and fetches registry.
  */
  start(callback = noop) {
    series([
      done => {
        if (this.metadataClient && this.config.eureka.fetchMetadata) {
          return this.addInstanceMetadata(done);
        }
        done();
      },
      done => {
        this.register(done);
      },
      done => {
        this.startHeartbeats();
        if (this.config.eureka.fetchRegistry) {
          this.startRegistryFetches();
          if (this.config.eureka.waitForRegistry) {
            const waitForRegistryUpdate = (cb) => {
              this.fetchRegistry(() => {
                const instances = this.getInstancesByVipAddress(this.config.instance.vipAddress);
                if (instances.length === 0) setTimeout(() => waitForRegistryUpdate(cb), 2000);
                else cb();
              });
            };
            return waitForRegistryUpdate(done);
          }
          this.fetchRegistry(done);
        } else {
          done();
        }
      },
    ], (err, ...rest) => {
      if (err) this.logger.warn('Error starting the Eureka Client', err);
      this.emit('started');
      callback(err, ...rest);
    });
  }

  /*
    De-registers instance with Eureka, stops heartbeats / registry fetches.
  */
  stop(callback = noop) {
    this.deregister(callback);
    clearInterval(this.heartbeat);
    clearInterval(this.registryFetch);
  }

  /*
    Validates client configuration.
  */
  validateConfig(config) {
    function validate(namespace, key) {
      if (!config[namespace][key]) {
        throw new TypeError(`Missing "${namespace}.${key}" config value.`);
      }
    }

    validate('instance', 'app');
    validate('instance', 'vipAddress');
    validate('instance', 'port');
    validate('instance', 'dataCenterInfo');
    validate('eureka', 'host');
    validate('eureka', 'port');
  }

  /*
    Registers with the Eureka server and initializes heartbeats on registration success.
  */
  register(callback = noop) {
    this.config.instance.status = 'UP';
    const connectionTimeout = setTimeout(() => {
      this.logger.warn('It looks like it\'s taking a while to register with ' +
        'Eureka. This usually means there is an issue connecting to the host ' +
        'specified. Start application with NODE_DEBUG=request for more logging.');
    }, 10000);
    this.buildEurekaUrl((err, eurekaUrl) => {
      if (err) return callback(err);
      request.post({
        url: eurekaUrl + this.config.instance.app,
        json: true,
        body: { instance: this.config.instance },
        gzip: true,
      }, (error, response, body) => {
        clearTimeout(connectionTimeout);
        if (!error && response.statusCode === 204) {
          this.logger.info(
            'registered with eureka: ',
            `${this.config.instance.app}/${this.instanceId}`
          );
          this.emit('registered');
          return callback(null);
        } else if (error) {
          this.logger.warn('Error registering with eureka client.', error);
          return callback(error);
        }
        return callback(
          new Error(`eureka registration FAILED: status: ${response.statusCode} body: ${body}`)
        );
      });
    });
  }

  /*
    De-registers with the Eureka server and stops heartbeats.
  */
  deregister(callback = noop) {
    this.buildEurekaUrl((err, eurekaUrl) => {
      if (err) return callback(err);
      request.del({
        url: `${eurekaUrl}${this.config.instance.app}/${this.instanceId}`,
        gzip: true,
      }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
          this.logger.info(
            'de-registered with eureka: ',
            `${this.config.instance.app}/${this.instanceId}`
          );
          this.emit('deregistered');
          return callback(null);
        } else if (error) {
          this.logger.warn('Error deregistering with eureka', error);
          return callback(error);
        }
        return callback(
          new Error(`eureka deregistration FAILED: status: ${response.statusCode} body: ${body}`)
        );
      });
    });
  }

  /*
    Sets up heartbeats on interval for the life of the application.
    Heartbeat interval by setting configuration property: eureka.heartbeatInterval
  */
  startHeartbeats() {
    this.heartbeat = setInterval(() => {
      this.renew();
    }, this.config.eureka.heartbeatInterval);
  }

  renew() {
    this.buildEurekaUrl((err, eurekaUrl) => {
      if (err) {
        this.logger.warn('eureka heartbeat FAILED, will retry', err);
        return;
      }
      request.put({
        url: `${eurekaUrl}${this.config.instance.app}/${this.instanceId}`,
        gzip: true,
      }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
          this.logger.debug('eureka heartbeat success');
          this.emit('heartbeat');
        } else if (!error && response.statusCode === 404) {
          this.logger.warn('eureka heartbeat FAILED, Re-registering app');
          this.register();
        } else {
          if (error) {
            this.logger.error('An error in the request occured.', error);
          }
          this.logger.warn(
            'eureka heartbeat FAILED, will retry.',
            `status: ${response ? response.statusCode : 'unknown'} body: ${body}`
          );
        }
      });
    });
  }

  /*
    Sets up registry fetches on interval for the life of the application.
    Registry fetch interval setting configuration property: eureka.registryFetchInterval
  */
  startRegistryFetches() {
    this.registryFetch = setInterval(() => {
      this.fetchRegistry(err => {
        if (err) this.logger.warn('Error fetching registries', err);
      });
    }, this.config.eureka.registryFetchInterval);
  }

  /*
    Retrieves a list of instances from Eureka server given an appId
  */
  getInstancesByAppId(appId) {
    if (!appId) {
      throw new RangeError('Unable to query instances with no appId');
    }
    const instances = this.cache.app[appId.toUpperCase()] || [];
    if (instances.length === 0) {
      this.logger.warn(`Unable to retrieve instances for appId: ${appId}`);
    }
    return instances;
  }

  /*
    Retrieves a list of instances from Eureka server given a vipAddress
   */
  getInstancesByVipAddress(vipAddress) {
    if (!vipAddress) {
      throw new RangeError('Unable to query instances with no vipAddress');
    }
    const instances = this.cache.vip[vipAddress] || [];
    if (instances.length === 0) {
      this.logger.warn(`Unable to retrieves instances for vipAddress: ${vipAddress}`);
    }
    return instances;
  }

  /*
    Retrieves all applications registered with the Eureka server
   */
  fetchRegistry(callback = noop) {
    this.buildEurekaUrl((err, eurekaUrl) => {
      if (err) return callback(err);
      request.get({
        url: eurekaUrl,
        headers: {
          Accept: 'application/json',
        },
        gzip: true,
      }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
          this.logger.debug('retrieved registry successfully');
          this.transformRegistry(JSON.parse(body));
          this.emit('registryUpdated');
          return callback(null);
        } else if (error) {
          this.logger.warn('Error fetching registry', error);
          return callback(error);
        }
        callback(new Error('Unable to retrieve registry from Eureka server'));
      });
    });
  }

  /*
    Transforms the given registry and caches the registry locally
   */
  transformRegistry(registry) {
    if (!registry) {
      this.logger.warn('Unable to transform empty registry');
    } else {
      if (!registry.applications.application) {
        return;
      }
      const newCache = { app: {}, vip: {} };
      if (Array.isArray(registry.applications.application)) {
        registry.applications.application.forEach((app) => {
          this.transformApp(app, newCache);
        });
      } else {
        this.transformApp(registry.applications.application, newCache);
      }
      this.cache = newCache;
    }
  }

  /*
    Transforms the given application and places in client cache. If an application
    has a single instance, the instance is placed into the cache as an array of one
   */
  transformApp(app, cache) {
    if (app.instance.length) {
      const instances = app.instance.filter((instance) => (this.validateInstance(instance)));
      cache.app[app.name.toUpperCase()] = instances;
      cache.vip[app.instance[0].vipAddress] = instances;
    } else if (this.validateInstance(app.instance)) {
      const instances = [app.instance];
      cache.vip[app.instance.vipAddress] = instances;
      cache.app[app.name.toUpperCase()] = instances;
    }
  }

  /*
    Returns true if instance filtering is disabled, or if the instance is UP
  */
  validateInstance(instance) {
    return (!this.config.eureka.filterUpInstances || instance.status === 'UP');
  }

  /*
    Fetches the metadata using the built-in client and updates the instance
    configuration with the hostname and IP address. If the value of the config
    option 'eureka.useLocalMetadata' is true, then the local IP address and
    hostname is used. Otherwise, the public IP address and hostname is used.

    A string replacement is done on the healthCheckUrl and statusPageUrl so
    that users can define the URLs with a placeholder for the host ('__HOST__').
    This allows flexibility since the host isn't known until the metadata is
    fetched. The replaced value respects the config option 'eureka.useLocalMetadata'
    as described above.

    This will only get called when dataCenterInfo.name is Amazon, but you can
    set config.eureka.fetchMetadata to false if you want to provide your own
    metadata in AWS environments.
  */
  addInstanceMetadata(callback = noop) {
    this.metadataClient.fetchMetadata(metadataResult => {
      this.config.instance.dataCenterInfo.metadata = merge(
        this.config.instance.dataCenterInfo.metadata,
        metadataResult
      );
      const useLocal = this.config.eureka.useLocalMetadata;
      const metadataHostName = metadataResult[useLocal ? 'local-hostname' : 'public-hostname'];
      this.config.instance.hostName = metadataHostName;
      this.config.instance.ipAddr = metadataResult[useLocal ? 'local-ipv4' : 'public-ipv4'];

      if (this.config.instance.statusPageUrl) {
        const { statusPageUrl } = this.config.instance;
        const replacedUrl = statusPageUrl.replace('__HOST__', metadataHostName);
        this.config.instance.statusPageUrl = replacedUrl;
      }
      if (this.config.instance.healthCheckUrl) {
        const { healthCheckUrl } = this.config.instance;
        const replacedUrl = healthCheckUrl.replace('__HOST__', metadataHostName);
        this.config.instance.healthCheckUrl = replacedUrl;
      }

      callback();
    });
  }

  /*
    Returns the Eureka host. This method is async because potentially we might have to
    execute DNS lookups which is an async network operation.
  */
  lookupCurrentEurekaHost(callback = noop) {
    if (this.config.eureka.useDns) {
      this.locateEurekaHostUsingDns((err, resolvedHost) => callback(err, resolvedHost));
    } else {
      return callback(null, this.config.eureka.host);
    }
  }

  /*
    Locates a Eureka host using DNS lookups. The DNS records are looked up by a naming
    convention and TXT records must be created according to the Eureka Wiki here:
    https://github.com/Netflix/eureka/wiki/Configuring-Eureka-in-AWS-Cloud

    Naming convention: txt.<REGION>.<HOST>
   */
  locateEurekaHostUsingDns(callback = noop) {
    const { ec2Region, host } = this.config.eureka;
    if (!ec2Region) {
      return callback(new Error(
        'EC2 region was undefined. ' +
        'config.eureka.ec2Region must be set to resolve Eureka using DNS records.'
      ));
    }
    dns.resolveTxt(`txt.${ec2Region}.${host}`, (err, addresses) => {
      if (err) {
        return callback(new Error(
          `Error resolving eureka server list for region [${ec2Region}] using DNS: [${err}]`
        ));
      }
      const random = Math.floor(Math.random() * addresses[0].length);
      dns.resolveTxt(`txt.${addresses[0][random]}`, (resolveErr, results) => {
        if (resolveErr) {
          this.logger.warn('Failed to locate DNS record for Eureka', resolveErr);
          callback(new Error(`Error locating eureka server using DNS: [${resolveErr}]`));
        }
        this.logger.debug('Found Eureka Server @ ', results);
        callback(null, [].concat(...results).shift());
      });
    });
  }

}
