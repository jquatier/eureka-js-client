/* eslint-disable no-underscore-dangle */
const bunyan = require('bunyan');

const config = {
  name: 'Eureka',
};

const logger = bunyan.createLogger(config);

export default logger;
