# eureka-js-client
JS implementation of a client for Eureka (https://github.com/Netflix/eureka), the Netflix OSS service registry.

[![NPM](https://nodei.co/npm/eureka-js-client.png)](https://nodei.co/npm/eureka-js-client/)

### Usage

#### Add Eureka client to a Node application.
Note: A configuration file named 'eureka-client-config.js' is required for initializing the module.
```javascript
var eureka = require('eureka'); // registers and initializes heartbeats with Eureka server.
```
