# eureka-js-client
[![npm version](https://badge.fury.io/js/eureka-js-client.svg)](http://badge.fury.io/js/eureka-js-client) [![Build Status](https://api.travis-ci.org/jquatier/eureka-js-client.svg)](https://travis-ci.org/jquatier/eureka-js-client) [![Coverage Status](https://coveralls.io/repos/jquatier/eureka-js-client/badge.svg?branch=master&service=github)](https://coveralls.io/github/jquatier/eureka-js-client?branch=master) [![Dependency Status](https://david-dm.org/jquatier/eureka-js-client.svg)](https://david-dm.org/jquatier/eureka-js-client)

A JavaScript implementation of a client for Eureka (https://github.com/Netflix/eureka), the Netflix OSS service registry.

## Usage

First, install the module into your node project:

```shell
npm install eureka-js-client --save
```

### Add Eureka client to a Node application.

The Eureka module exports a JavaScript function that can be constructed.

```javascript
import Eureka from 'eureka-js-client';

// Or, if you're not using a transpiler:
const Eureka = require('eureka-js-client').Eureka;

// example configuration
const client = new Eureka({
  // application instance information
  instance: {
    app: 'jqservice',
    hostName: 'localhost',
    ipAddr: '127.0.0.1',
    port: 8080,
    vipAddress: 'jq.test.something.com',
    dataCenterInfo: {
      name: 'MyOwn',
    },
  },
  eureka: {
    // eureka server host / port
    host: '192.168.99.100',
    port: 32768,
  },
});
```

The Eureka client searches for the YAML file `eureka-client.yml` in the current working directory. It further searches for environment specific overrides in the environment specific YAML files (e.g. `eureka-client-test.yml`). The environment is typically `development` or `production`, and is determined by the `NODE_ENV` environment variable. The options passed to the constructor overwrite any values that are set in configuration files.

You can configure a custom directory to load the configuration files from by specifying a `cwd` option in the object passed to the `Eureka` constructor.

```javascript
const client = new Eureka({
  cwd: `${__dirname}/config`,
});
```

If you wish, you can also overwrite the name of the file that is loaded with the `filename` property. You can mix the `cwd` and `filename` options.

```javascript
const client = new Eureka({
  filename: 'eureka',
  cwd: `${__dirname}/config`,
});
```

### Register with Eureka & start application heartbeats

```javascript
client.start();
```

### De-register with Eureka & stop application heartbeats

```javascript
client.stop();
```

### Get Instances By App ID

```javascript
// appInfo.application.instance contains array of instances
const appInfo = client.getInstancesByAppId('YOURSERVICE');
```

### Get Instances By Vip Address

```javascript
// appInfo.application.instance contains array of instances
const appInfo = client.getInstancesByVipAddress('YOURSERVICEVIP');
```

## Configuring for AWS environments

For AWS environments (`dataCenterInfo.name == 'Amazon'`) the client has built-in logic to request the AWS metadata that the Eureka server requires. See [Eureka REST schema](https://github.com/Netflix/eureka/wiki/Eureka-REST-operations) for more information.

```javascript
// example configuration for AWS
const client = new Eureka({
  // application instance information
  instance: {
    app: 'jqservice',
    port: 8080,
    vipAddress: 'jq.test.something.com',
    statusPageUrl: 'http://__HOST__:8080/',
    healthCheckUrl: 'http://__HOST__:8077/healthcheck',
    dataCenterInfo: {
      name: 'Amazon',
    },
  },
  eureka: {
    // eureka server host / port / EC2 region
    host: 'eureka.test.mydomain.com',
    port: 80,
  },
});
```

Notes:
  - Under this configuration, the instance `hostName` and `ipAddr` will be set to the public host and public IP that the AWS metadata provides.
  - For status and healthcheck URLs, you may use the replacement key of `__HOST__` to use the public host.
  - Metadata fetching can be disabled by setting `config.eureka.fetchMetadata` to `false` if you want to provide your own metadata in AWS environments.

### Looking up Eureka Servers in AWS using DNS
If your have multiple availability zones and your DNS entries set up according to the Wiki article [Configuring Eureka in AWS Cloud](https://github.com/Netflix/eureka/wiki/Configuring-Eureka-in-AWS-Cloud), you'll want to set `config.eureka.useDns` to `true` and set `config.eureka.ec2Region` to the current region (usually this can be pulled into your application via an environment variable, or passed in directly at startup).

This will cause the client to perform a DNS lookup using `config.eureka.host` and `config.eureka.ec2Region`. The naming convention for the DNS TXT records required for this to function is also described in the Wiki article above.


## Debugging

The library uses [request](https://github.com/request/request) for all service calls, and debugging can be turned on by passing `NODE_DEBUG=request` when you start node. This allows you you double-check the URL being called as well as other request properties.

```shell
NODE_DEBUG=request node example.js
```

You can also turn on debugging within the library by setting the log level to debug:

```javascript
client.logger.level('debug');
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
