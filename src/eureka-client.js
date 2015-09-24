import request from 'request';
import fs from 'fs';
import yaml from 'js-yaml';
import merge from 'deepmerge';
import path from 'path';
import {parallel} from 'async';

import {Logger} from './Logger';
import defaultConfig from './default-config';

const noop = () => {};

/*
  Eureka JS client
  This module handles registration with a Eureka server, as well as heartbeats 
  for reporting instance health.
*/

function getYaml(file) {
  let yml = {};
  try {
    yml = yaml.safeLoad(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return yml;
}

export class Eureka {

  constructor(config) {
    // Allow passing in a custom logger:
    this.logger = config.logger || new Logger();

    this.logger.debug('initializing eureka client');

    // Load up the current working directory and the environment:
    const cwd = process.cwd();
    const env = process.env.NODE_ENV || 'development';

    // Load in the configuration files:
    this.config = merge(defaultConfig, getYaml(path.join(cwd, 'eureka-client.yml')));
    this.config = merge(this.config, getYaml(path.join(cwd, `eureka-client-${env}.yml`)));

    // Finally, merge in the passed configuration:
    this.config = merge(this.config, config);

    // Validate the provided the values we need:
    this.validateConfig(this.config);

    this.cache = {
      app: {},
      vip: {}
    };
  }

  /*
    Base Eureka server URL + path
  */
  get eurekaUrl() {
    return `http://${this.config.eureka.host}:${this.config.eureka.port}${this.config.eureka.servicePath}`;
  }

  /*
    Helper method to get the instance ID. If the datacenter is AWS, this will be the 
    instance-id in the metadata. Else, it's the hostName.
  */
  get instanceId() {
    if (this.config.instance.dataCenterInfo.name.toLowerCase() === 'amazon') {
      return this.config.instance.dataCenterInfo.metadata['instance-id'];
    }
    return this.config.instance.hostName;
  }

  /*
    Registers instance with Eureka, begins heartbeats, and fetches registry.
  */
  start(callback = noop) {
    parallel([
      done => {
        this.register(done);
      },
      done => {
        this.fetchRegistry(done);
      }
    ], callback);
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
    request.post({
      url: this.eurekaUrl + this.config.instance.app, 
      json: true,
      body: {instance: this.config.instance}
    }, (error, response, body) => {
      if (!error && response.statusCode === 204) {
        this.logger.info('registered with eureka: ', `${this.config.instance.app}/${this.instanceId}`);
        this.startHeartbeats();
        this.startRegistryFetches();
        return callback(null);
      } else if (error) {
        return callback(error);
      }
      return callback(new Error(`eureka registration FAILED: status: ${response.statusCode} body: ${body}`));
    });
  }

  /*
    De-registers with the Eureka server and stops heartbeats.
  */
  deregister(callback = noop) {
    request.del({
      url: `${this.eurekaUrl}${this.config.instance.app}/${this.instanceId}` 
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        this.logger.info('de-registered with eureka: ', `${this.config.instance.app}/${this.instanceId}`);
        return callback(null);
      } else if (error) {
        return callback(error);
      }
      return callback(new Error(`eureka deregistration FAILED: status: ${response.statusCode} body: ${body}`));
    });
  }

  /*
    Sets up heartbeats on interval for the life of the application.
    Heartbeat interval by setting configuration property: eureka.heartbeatInterval
  */
  startHeartbeats() {
    this.heartbeat = setInterval(() => {
      request.put({
        url: `${this.eurekaUrl}${this.config.instance.app}/${this.instanceId}` 
      }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
          this.logger.debug('eureka heartbeat success');
        } else {
          if (error) {
            this.logger.error('An error in the request occured.', error);
          }
          this.logger.warn('eureka heartbeat FAILED, will retry.', `status: ${response.statusCode} body: ${body}`);
        }
      });
    }, this.config.eureka.heartbeatInterval);
  }

  /*
    Sets up registry fetches on interval for the life of the application.
    Registry fetch interval setting configuration property: eureka.registryFetchInterval
  */
  startRegistryFetches() {
    this.registryFetch = setInterval(() => {
      this.fetchRegistry();
    }, this.config.eureka.registryFetchInterval);
  }

  /*
    Retrieves a list of instances from Eureka server given an appId
  */
  getInstancesByAppId(appId) {
    if (!appId) {
      throw new RangeError('Unable to query instances with no appId');
    }
    const instances = this.cache.app[appId.toUpperCase()];
    if (!instances) {
      throw new Error(`Unable to retrieve instances for appId: ${appId}`);
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
    const instances = this.cache.vip[vipAddress];
    if (!instances) {
      throw new Error(`Unable to retrieves instances for vipAddress: ${vipAddress}`);
    }
    return instances;
  }

  /*
    Retrieves all applications registered with the Eureka server
   */
  fetchRegistry(callback = noop) {
    request.get({
      url: this.eurekaUrl,
      headers: {
        Accept: 'application/json'
      }
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        this.logger.debug('retrieved registry successfully');
        this.transformRegistry(JSON.parse(body));
        return callback(null);
      }
      callback(new Error('Unable to retrieve registry from Eureka server'));
    });
  }

  /*
    Transforms the given registry and caches the registry locally
   */
  transformRegistry(registry) {
    if (!registry) {
      throw new Error('Unable to transform empty registry');
    }
    this.cache = {app: {}, vip: {}};
    if (!registry.applications.application) {
      return;
    }
    if (registry.applications.application.length) {
      for (let i = 0; i < registry.applications.application.length; i++) {
        const app = registry.applications.application[i];
        this.transformApp(app);
      }
    } else {
      this.transformApp(registry.applications.application);
    }
  }

  /*
    Transforms the given application and places in client cache. If an application
      has a single instance, the instance is placed into the cache as an array of one
   */
  transformApp(app) {
    if (app.instance.length) {
      this.cache.app[app.name.toUpperCase()] = app.instance;
      this.cache.vip[app.instance[0].vipAddress] = app.instance;
    } else {
      const instances = [app.instance];
      this.cache.vip[app.instance.vipAddress] = instances;
      this.cache.app[app.name.toUpperCase()] = instances;
    }
  }

}
