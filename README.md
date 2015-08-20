# eureka-js-client [![Build Status](https://api.travis-ci.org/jquatier/eureka-js-client.svg)](https://travis-ci.org/jquatier/eureka-js-client)
JS implementation of a client for Eureka (https://github.com/Netflix/eureka), the Netflix OSS service registry.

[![NPM](https://nodei.co/npm/eureka-js-client.png)](https://nodei.co/npm/eureka-js-client/)

## Usage

First, install the module into your node project:

```shell
npm install eureka-js-client --save
```

### Add Eureka client to a Node application.
Note: If the configuration object is not passed to the constuctor, the module will look for configuration file named `eureka-client-config.js` in the current working directory.

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

### Get Instances By AppId

```javascript
// appInfo.application.instance contains array of instances
var appInfo = client.getInstancesByAppId('YOURSERVICE');
```

## Tests

The test for the module are written using mocha and chai. To run the unit tests, you can use the gulp `test` task:

```shell
gulp test
```

If you wish to have the tests watch the `src/` and `test/` directories for changes, you can use the `test:watch` gulp task:

```shell
gulp test:watch
```
