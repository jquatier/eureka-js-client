# eureka-js-client [![Build Status](https://api.travis-ci.org/jquatier/eureka-js-client.svg)](https://travis-ci.org/jquatier/eureka-js-client) [![Coverage Status](https://coveralls.io/repos/jquatier/eureka-js-client/badge.svg?branch=master&service=github)](https://coveralls.io/github/jquatier/eureka-js-client?branch=master)
JS implementation of a client for Eureka (https://github.com/Netflix/eureka), the Netflix OSS service registry.

[![NPM](https://nodei.co/npm/eureka-js-client.png)](https://nodei.co/npm/eureka-js-client/)

## Usage

First, install the module into your node project:

```shell
npm install eureka-js-client --save
```

### Add Eureka client to a Node application.

The Eureka module exports a JavaScript function that can be constructed.

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

If the configuration object is not passed to the constructor, the module will look for a YAML configuration file.

By default, Eureka client searches for the YAML file `eureka-client.yml` in the current working directory. It further searches for environment specific overrides in the environment specific YAML files. The environment is typically `test` or `production`, and is determined by the `NODE_ENV` environment variable.

### Get Instances By App ID

```javascript
// appInfo.application.instance contains array of instances
var appInfo = client.getInstancesByAppId('YOURSERVICE');
```

### Get Instances By Vip Address

```javascript
// appInfo.application.instance contains array of instances
var appInfo = client.getInstancesByVipAddress('YOURSERVICEVIP');
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
