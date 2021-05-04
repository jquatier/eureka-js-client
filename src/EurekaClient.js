import got from 'got';
import fs from 'fs';
import yaml from 'js-yaml';
import { merge, findIndex } from 'lodash';
import { normalizeDelta, findInstance } from './deltaUtils';
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
    yml = yaml.load(fs.readFileSync(file, 'utf8'));
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
    const env = process.env.EUREKA_ENV || process.env.NODE_ENV || 'development';

    const filename = config.filename || 'eureka-client';

    // Load in the configuration files:
    const defaultYml = getYaml(path.join(cwd, `${filename}.yml`));
    const envYml = getYaml(path.join(cwd, `${filename}-${env}.yml`));

    // apply config overrides in appropriate order
    this.config = merge({}, defaultConfig, defaultYml, envYml, config);

    // Validate the provided the values we need:
    this.validateConfig(this.config);

    this.requestMiddleware = this.config.requestMiddleware;

    this.hasFullRegistry = false;

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
    const { dataCenterInfo } = this.config.instance;
    return (
      dataCenterInfo &&
      dataCenterInfo.name &&
      dataCenterInfo.name.toLowerCase() === 'amazon'
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
        if (this.config.eureka.registerWithEureka) {
          return this.register(done);
        }
        done();
      },
      done => {
        if (this.config.eureka.registerWithEureka) {
          this.startHeartbeats();
        }
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
    clearInterval(this.registryFetch);
    if (this.config.eureka.registerWithEureka) {
      clearInterval(this.heartbeat);
      this.deregister(callback);
    } else {
      callback();
    }
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

    if (config.eureka.registerWithEureka) {
      validate('instance', 'app');
      validate('instance', 'vipAddress');
      validate('instance', 'port');
      validate('instance', 'dataCenterInfo');
    }

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
    this.eurekaRequest(this.config.instance.app, {
      method: 'POST',
      responseType: 'json',
      json: { instance: this.config.instance },
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
    this.eurekaRequest(`${this.config.instance.app}/${this.instanceId}`, {
      method: 'DELETE',
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
    this.eurekaRequest(`${this.config.instance.app}/${this.instanceId}`, {
      method: 'PUT',
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
        if (err) this.logger.warn('Error fetching registry', err);
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
    Orchestrates fetching registry
   */
  fetchRegistry(callback = noop) {
    if (this.config.shouldUseDelta && this.hasFullRegistry) {
      this.fetchDelta(callback);
    } else {
      this.fetchFullRegistry(callback);
    }
  }

  /*
    Retrieves all applications registered with the Eureka server
  */
  fetchFullRegistry(callback = noop) {
    this.eurekaRequest('', {
      headers: {
        Accept: 'application/json',
      },
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        this.logger.debug('retrieved full registry successfully');
        try {
          this.transformRegistry(JSON.parse(body));
        } catch (ex) {
          return callback(ex);
        }
        this.emit('registryUpdated');
        this.hasFullRegistry = true;
        return callback(null);
      } else if (error) {
        this.logger.warn('Error fetching registry', error);
        return callback(error);
      }
      callback(new Error('Unable to retrieve full registry from Eureka server'));
    });
  }

    /*
    Retrieves all applications registered with the Eureka server
   */
  fetchDelta(callback = noop) {
    this.eurekaRequest('delta', {
      headers: {
        Accept: 'application/json',
      },
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        this.logger.debug('retrieved delta successfully');
        let applications;
        try {
          const jsonBody = JSON.parse(body);
          applications = jsonBody.applications.application;
          this.handleDelta(this.cache, applications);
          return callback(null);
        } catch (ex) {
          return callback(ex);
        }
      } else if (error) {
        this.logger.warn('Error fetching delta registry', error);
        return callback(error);
      }
      callback(new Error('Unable to retrieve delta registry from Eureka server'));
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
      app.instance
        .filter(this.validateInstance.bind(this))
        .forEach((inst) => this.addInstance(cache, inst));
    } else if (this.validateInstance(app.instance)) {
      this.addInstance(cache, app.instance);
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

  handleDelta(cache, appDelta) {
    const delta = normalizeDelta(appDelta);
    delta.forEach((app) => {
      app.instance.forEach((instance) => {
        switch (instance.actionType) {
          case 'ADDED': this.addInstance(cache, instance); break;
          case 'MODIFIED': this.modifyInstance(cache, instance); break;
          case 'DELETED': this.deleteInstance(cache, instance); break;
          default: this.logger.warn('Unknown delta actionType', instance.actionType); break;
        }
      });
    });
  }

  addInstance(cache, instance) {
    if (!this.validateInstance(instance)) return;
    const vipAddresses = this.splitVipAddress(instance.vipAddress);
    const appName = instance.app.toUpperCase();
    vipAddresses.forEach((vipAddress) => {
      const alreadyContains = findIndex(cache.vip[vipAddress], findInstance(instance)) > -1;
      if (alreadyContains) return;
      if (!cache.vip[vipAddress]) {
        cache.vip[vipAddress] = [];
      }
      cache.vip[vipAddress].push(instance);
    });
    if (!cache.app[appName]) cache.app[appName] = [];
    const alreadyContains = findIndex(cache.app[appName], findInstance(instance)) > -1;
    if (alreadyContains) return;
    cache.app[appName].push(instance);
  }

  modifyInstance(cache, instance) {
    const vipAddresses = this.splitVipAddress(instance.vipAddress);
    const appName = instance.app.toUpperCase();
    vipAddresses.forEach((vipAddress) => {
      const index = findIndex(cache.vip[vipAddress], findInstance(instance));
      if (index > -1) cache.vip[vipAddress].splice(index, 1, instance);
      else this.addInstance(cache, instance);
    });
    const index = findIndex(cache.app[appName], findInstance(instance));
    if (index > -1) cache.app[appName].splice(cache.vip[instance.vipAddress], 1, instance);
    else this.addInstance(cache, instance);
  }

  deleteInstance(cache, instance) {
    const vipAddresses = this.splitVipAddress(instance.vipAddress);
    const appName = instance.app.toUpperCase();
    vipAddresses.forEach((vipAddress) => {
      const index = findIndex(cache.vip[vipAddress], findInstance(instance));
      if (index > -1) cache.vip[vipAddress].splice(index, 1);
    });
    const index = findIndex(cache.app[appName], findInstance(instance));
    if (index > -1) cache.app[appName].splice(cache.vip[instance.vipAddress], 1);
  }

  /*
    Fetches the metadata using the built-in client and updates the instance
    configuration with the hostname and IP address. If the value of the config
    option 'eureka.useLocalMetadata' is true, then the local IP address and
    hostname is used. Otherwise, the public IP address and hostname is used. If
    'eureka.preferIpAddress' is true, the IP address will be used as the hostname.

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
      const preferIpAddress = this.config.eureka.preferIpAddress;
      const metadataHostName = metadataResult[useLocal ? 'local-hostname' : 'public-hostname'];
      const metadataIpAddress = metadataResult[useLocal ? 'local-ipv4' : 'public-ipv4'];
      this.config.instance.hostName = preferIpAddress ? metadataIpAddress : metadataHostName;
      this.config.instance.ipAddr = metadataIpAddress;

      if (this.config.instance.statusPageUrl) {
        const { statusPageUrl } = this.config.instance;
        const replacedUrl = statusPageUrl.replace('__HOST__', this.config.instance.hostName);
        this.config.instance.statusPageUrl = replacedUrl;
      }
      if (this.config.instance.healthCheckUrl) {
        const { healthCheckUrl } = this.config.instance;
        const replacedUrl = healthCheckUrl.replace('__HOST__', this.config.instance.hostName);
        this.config.instance.healthCheckUrl = replacedUrl;
      }
      if (this.config.instance.homePageUrl) {
        const { homePageUrl } = this.config.instance;
        const replacedUrl = homePageUrl.replace('__HOST__', this.config.instance.hostName);
        this.config.instance.homePageUrl = replacedUrl;
      }

      callback();
    });
  }

  /*
    Helper method for making a request to the Eureka server. Handles resolving
    the current cluster as well as some default options.
  */
  eurekaRequest(uri, opts, callback, retryAttempt = 0) {
    waterfall([
      /*
      Resolve Eureka Clusters
      */
      done => {
        this.clusterResolver.resolveEurekaUrl((err, eurekaUrl) => {
          if (err) return done(err);
          const requestOpts = merge({}, opts, {
            prefixUrl: eurekaUrl,
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
        got[method](uri, requestOpts, (error, response, body) => {
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
        this.logger.warn(`Eureka request failed to endpoint ${requestOpts.prefixUrl}, ` +
          `next server retry in ${nextRetryDelay}ms`);

        setTimeout(() => this.eurekaRequest(uri, opts, callback, retryAttempt + 1),
          nextRetryDelay);
        return;
      }

      callback(error, response, body);
    });
  }

}
