var Eureka = require('eureka-js-client');

// example configuration
var client = new Eureka({
  // application instance information
  instance: {
    app: 'jqservice',
    hostName: 'localhost',
    ipAddr: '127.0.0.1',
    port: 8080,
    vipAddress: 'jq.test.something.com',
    dataCenterInfo: {
      name: 'MyOwn'
    }
  },
  eureka: {
    // eureka server host / port
    host: '192.168.99.100',
    port: 32768
  }
});
client.logger.level('debug');
client.start(function(error){
  console.log(error);
});