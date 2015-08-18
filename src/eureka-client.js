import request from 'request';

/*
  Eureka JS client
  This module handles registration with a Eureka server, as well as heartbeats 
  for reporting instance health. This module requires a eureka-client-config.js configuration
  file.
*/

export default class Eureka {

  constructor(config) {
    console.log('initializing eureka client');
    this.config = config;
    if(!config) {
      this.config = require(process.cwd() + '/eureka-client-config.js');
    }
    if(!this.config) {
      throw new Error('missing configuration file.')
    } else if(!this.config.instance || !this.config.eureka) {
      throw new Error('missing instance / eureka configuration.')
    }
    this.register();
  }

  /*
    Registers with the Eureka server and initializes heartbeats on registration success.
  */
  register() {
    this.config.instance.status = 'UP';
    request.post({
      url: this.baseEurekaUrl() + this.config.instance.app, 
      json: true,
      body: {instance: this.config.instance}
    }, (error, response, body) => {
      if(!error && response.statusCode == 204) {
        console.log('registered with eureka: ', `${this.config.instance.app}/${this.getInstanceId()}`);
        this.startHeartbeats();
      } else {
        throw new Error('eureka registration FAILED: ' + (error ? error : `status: ${response.statusCode} body: ${body}`));
      }
    });
  }

  /*
    Sets up heartbeats on interval for the life of the application.
    Heartbeat interval by setting configuration property: eureka.heartbeatInterval
  */
  startHeartbeats() {
    this.heartbeat = setInterval(() => {
      request.put({
        url: `${this.baseEurekaUrl()}${this.config.instance.app}/${this.getInstanceId()}` 
      }, (error, response, body) => {
        if(!error && response.statusCode == 200) {
          console.log('eureka heartbeat success');
        } else {
          console.warn('eureka heartbeat FAILED, will retry. ' + (error ? error : `status: ${response.statusCode} body: ${body}`));
        }
      });
    }, this.config.eureka.heartbeatInterval || 30000);
  }

  /*
    Base Eureka server URL + path
  */
  baseEurekaUrl() {
    return `http:\/\/${this.config.eureka.host}:${this.config.eureka.port}/eureka/v2/apps/`;
  }

  /*
    Helper method to get the instance ID. If the datacenter is AWS, this will be the 
    instance-id in the metadata. Else, it's the hostName.
  */
  getInstanceId() {
    if(this.config.instance.dataCenterInfo === 'Amazon') {
      return this.config.instance.dataCenterInfo.metadata['instance-id'];
    } else {
      return this.config.instance.hostName;
    }
  }

  /*
    Retrieves a list of instances from server given an appId
  */
  getInstancesByAppId(appId) {
    if (!appId) {
      throw new Error('Unable to query instances with no appId');
    }
    request.get({
      url: `${this.baseEurekaUrl()}${appId}`,
      headers: {Accept: 'application/json'}
    }, (error, response, body) => {
      if (!error && response.statusCode === 200) {
        return body;
      } else {
        throw new Error('Unable to retrieve instances for appId: ', appId);
      }
    });
  }
}
