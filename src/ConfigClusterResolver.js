import Logger from './Logger';

export default class ConfigClusterResolver {
  constructor(config, logger) {
    this.logger = logger || new Logger();
    this.serverList = undefined;
    this.config = config;
  }

  resolveEurekaUrl(callback) {
    const { host, port, servicePath, ssl } = this.config.eureka;
    const protocol = ssl ? 'https' : 'http';
    callback(null, `${protocol}://${host}:${port}${servicePath}`);
  }
}
