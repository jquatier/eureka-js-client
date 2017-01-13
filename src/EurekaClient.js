import request from 'request';
import fs from 'fs';
import yaml from 'js-yaml';
import merge from 'lodash/merge';
import path from 'path';
import { series, waterfall } from 'async';
import { EventEmitter } from 'events';

import AwsMetadata from './AwsMetadata';
import ConfigClusterResolver from './ConfigClusterResolver';
import DnsClusterResolver from './DnsClusterResolver';
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
    const defaultYml = getYaml(path.join(cwd, `${filename}.yml`));
    const envYml = getYaml(path.join(cwd, `${filename}-${env}.yml`));

    // apply config overrides in appropriate order
    this.config = merge({}, defaultConfig, defaultYml, envYml, config);

    // Validate the provided the values we need:
    this.validateConfig(this.config);

    this.requestMiddleware = this.config.requestMiddleware;

    if (this.amazonDataCenter) {
      this.metadataClient = new AwsMetadata({
        logger: this.logger,
      });
    }

    if (this.config.eureka.useDns) {
      this.clusterResolver = new DnsClusterResolver(this.config, this.logger);
    } else {
      this.clusterResolver = new ConfigClusterResolver(this.config, this.logger);
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
      if (err) {
        this.logger.warn('Error starting the Eureka Client', err);
      } else {
        this.emit('started');
      }
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

    if (typeof config.requestMiddleware !== 'function') {
      throw new TypeError('requestMiddleware must be a function');
    }
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
    this.eurekaRequest({
      method: 'POST',
      uri: this.config.instance.app,
      json: true,
      body: { instance: this.config.instance },
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
  }

  /*
    De-registers with the Eureka server and stops heartbeats.
  */
  deregister(callback = noop) {
    this.eurekaRequest({
      method: 'DELETE',
      uri: `${this.config.instance.app}/${this.instanceId}`,
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        this.logger.info(
          `de-registered with eureka: ${this.config.instance.app}/${this.instanceId}`
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
    this.eurekaRequest({
      method: 'PUT',
      uri: `${this.config.instance.app}/${this.instanceId}`,
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
          'eureka heartbeat FAILED, will retry.' +
          `statusCode: ${response ? response.statusCode : 'unknown'}` +
          `body: ${body} ${error | ''} `
        );
      }
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
    this.eurekaRequest({
      uri: '',
      headers: {
        Accept: 'application/json',
      },
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        this.logger.debug('retrieved registry successfully');
        try {
          this.transformRegistry(JSON.parse(body));
        } catch (ex) {
          return callback(ex);
        }
        this.emit('registryUpdated');
        return callback(null);
      } else if (error) {
        this.logger.warn('Error fetching registry', error);
        return callback(error);
      }
      callback(new Error('Unable to retrieve registry from Eureka server'));
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
      instances.forEach((inst) => {
        const vipAddresses = this.splitVipAddress(inst.vipAddress);
        vipAddresses.forEach((vipAddress) => {
          if (!cache.vip[vipAddress]) {
            cache.vip[vipAddress] = [];
          }
          cache.vip[vipAddress].push(inst);
        });
      });
    } else if (this.validateInstance(app.instance)) {
      const instances = [app.instance];
      const vipAddresses = this.splitVipAddress(app.instance.vipAddress);
      vipAddresses.forEach((vipAddress) => {
        cache.vip[vipAddress] = instances;
      });
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
    Returns an array of vipAddresses from string vipAddress given by eureka
  */
  splitVipAddress(vipAddress) { // eslint-disable-line
    if (typeof vipAddress !== 'string') {
      return [];
    }

    return vipAddress.split(',');
  }

  /*
    Fetches the metadata using the built-in client and updates the instance
    configuration with the hostname and IP address. If the value of the config
    option 'eureka.useLocalMetadata' is true, then the local IP address and
    hostname is used. Otherwise, the public IP address and hostname is used.

    A string replacement is done on the healthCheckUrl, statusPageUrl and
    homePageUrl so that users can define the URLs with a placeholder for the
    host ('__HOST__'). This allows flexibility since the host isn't known until
    the metadata is fetched. The replaced value respects the config option
    'eureka.useLocalMetadata' as described above.

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
      if (this.config.instance.homePageUrl) {
        const { homePageUrl } = this.config.instance;
        const replacedUrl = homePageUrl.replace('__HOST__', metadataHostName);
        this.config.instance.homePageUrl = replacedUrl;
      }

      callback();
    });
  }

  /*
    Helper method for making a request to the Eureka server. Handles resolving
    the current cluster as well as some default options.
  */
  eurekaRequest(opts, callback, retryAttempt = 0) {
    waterfall([
      /*
      Resolve Eureka Clusters
      */
      done => {
        this.clusterResolver.resolveEurekaUrl((err, eurekaUrl) => {
          if (err) return done(err);
          const requestOpts = merge({}, opts, {
            baseUrl: eurekaUrl,
            gzip: true,
          });
          done(null, requestOpts);
        }, retryAttempt);
      },
      /*
      Apply Request Middleware
      */
      (requestOpts, done) => {
        this.requestMiddleware(requestOpts, (newRequestOpts) => {
          if (typeof newRequestOpts !== 'object') {
            return done(new Error('requestMiddleware did not return an object'));
          }
          done(null, newRequestOpts);
        });
      },
      /*
      Perform Request
       */
      (requestOpts, done) => {
        const method = requestOpts.method ? requestOpts.method.toLowerCase() : 'get';
        request[method](requestOpts, (error, response, body) => {
          done(error, response, body, requestOpts);
        });
      },
    ],
    /*
    Handle Final Output.
     */
    (error, response, body, requestOpts) => {
      if (error) this.logger.error('Problem making eureka request', error);

      // Perform retry if request failed and we have attempts left
      const responseInvalid = response
        && response.statusCode
        && String(response.statusCode)[0] === '5';

      if ((error || responseInvalid) && retryAttempt < this.config.eureka.maxRetries) {
        const nextRetryDelay = this.config.eureka.requestRetryDelay * (retryAttempt + 1);
        this.logger.warn(`Eureka request failed to endpoint ${requestOpts.baseUrl}, ` +
          `next server retry in ${nextRetryDelay}ms`);

        setTimeout(() => this.eurekaRequest(opts, callback, retryAttempt + 1),
          nextRetryDelay);
        return;
      }

      callback(error, response, body);
    });
  }

}
