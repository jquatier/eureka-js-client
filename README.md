# eureka-js-client
JS implementation of a client for Eureka (https://github.com/Netflix/eureka), the Netflix OSS service registry.

[![NPM](https://nodei.co/npm/eureka-js-client.png)](https://nodei.co/npm/eureka-js-client/)

### Usage

#### Add Eureka client to a Node application.
Note: If the configuration object is not passed to the constuctor, the module will look for configuration file named 'eureka-client-config.js'.
```javascript
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
```

#### Get Instances By AppId

```javascript

// appInfo.application.instances contains array of instances
var appInfo = client.getInstancesByAppId('YOURSERVICE');

```
