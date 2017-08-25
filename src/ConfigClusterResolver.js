import logger from './Logger';

/*
  Locates a Eureka host using static configuration. Configuration can either be
  done using a simple host and port, or a map of serviceUrls.
 */
export default class ConfigClusterResolver {
  constructor(config, customLogger) {
    this.logger = customLogger || logger;
    this.config = config;
    this.serviceUrls = this.buildServiceUrls();
  }

  resolveEurekaUrl(callback, retryAttempt = 0) {
    if (this.serviceUrls.length > 1 && retryAttempt > 0) {
      this.serviceUrls.push(this.serviceUrls.shift());
    }
    callback(null, this.serviceUrls[0]);
  }

  buildServiceUrls() {
    const { host, port, servicePath, ssl,
      serviceUrls, preferSameZone } = this.config.eureka;
    const { dataCenterInfo } = this.config.instance;
    const metadata = dataCenterInfo ? dataCenterInfo.metadata : undefined;
    const instanceZone = metadata ? metadata['availability-zone'] : undefined;
    const urls = [];
    const zones = this.getAvailabilityZones();
    if (serviceUrls) {
      zones.forEach((zone) => {
        if (serviceUrls[zone]) {
          if (preferSameZone && instanceZone && instanceZone === zone) {
            urls.unshift(...serviceUrls[zone]);
          }
          urls.push(...serviceUrls[zone]);
        }
      });
    }
    if (!urls.length) {
      const protocol = ssl ? 'https' : 'http';
      urls.push(`${protocol}://${host}:${port}${servicePath}`);
    }
    return urls;
  }

  getAvailabilityZones() {
    const { ec2Region, availabilityZones } = this.config.eureka;
    if (ec2Region && availabilityZones && availabilityZones[ec2Region]) {
      return availabilityZones[ec2Region];
    }
    return ['default'];
  }
}
