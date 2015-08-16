var request = require('request');

/*
  Eureka JS client
  This module handles registration with a Eureka server, as well as heartbeats 
  for reporting instance health. This module requires a eureka-client-config.js configuration
  file.
*/
function Eureka() {
  this.config = require('./eureka-client-config.js');
  if(!this.config) {
    throw new Error('missing configuration file.')
  } else if(!this.config.instance || !this.config.eureka) {
    throw new Error('missing instance / eureka configuration.')
  }
  this.register();
};

/*
  Registers with the Eureka server and initializes heartbeats on registration success.
*/
Eureka.prototype.register = function() {
  var self = this;
  self.config.instance.status = 'UP';
  request.post({
    url: self.baseEurekaUrl() + self.config.instance.app, 
    json: true,
    body: {instance: self.config.instance}
  }, function (error, response, body) {
    if(!error && response.statusCode == 204) {
      console.log('registered with eureka: ' + self.config.instance.app + '/' + self.getInstanceId());
      self.startHeartbeats();
    } else {
      handleRequestError(error, response, body);
    }
  });
};

/*
  Sets up heartbeats on interval for the life of the application.
  Heartbeat interval by setting configuration property: eureka.heartbeatInterval
*/
Eureka.prototype.startHeartbeats = function() {
  var self = this;
  this.heartbeat = setInterval(function() {
    request.put({
      url: self.baseEurekaUrl() + self.config.instance.app + '/' + self.getInstanceId() 
    }, function (error, response, body) {
      if(!error && response.statusCode == 200) {
        console.log('eureka heartbeat success');
      } else {
        console.warn('eureka heartbeat FAILED, will retry.', error ? error : 'status: ' + response.statusCode);
      }
    });
  }, self.config.eureka.heartbeatInterval || 30000);
};

/*
  Base Eureka server URL + path
*/
Eureka.prototype.baseEurekaUrl = function() {
  return 'http://' + this.config.eureka.host + ':' + this.config.eureka.port + '/eureka/v2/apps/';
}

/*
  Helper method to get the instance ID. If the datacenter is AWS, this will be the 
  instance-id in the metadata. Else, it's the hostName.
*/
Eureka.prototype.getInstanceId = function() {
  if(this.config.instance.dataCenterInfo === 'Amazon') {
    return this.config.instance.dataCenterInfo.metadata['instance-id'];
  } else {
    return this.config.instance.hostName;
  }
}

function handleRequestError(error, response, body) {
  if(error) {
    throw new Error('request failed: ' + error);
  } else {
    throw new Error('request failed: ' + response.statusCode + ' body: ' + body);
  }
}

module.exports = new Eureka();