import Logger from './Logger';

export default class ConfigClusterResolver {
  constructor(config, logger) {
    this.logger = logger || new Logger();
    this.serviceUrls = undefined;
    this.config = config;
    this.serviceUrls = this.buildServiceUrls();
  }

  resolveEurekaUrl(callback) {
    const { host, port, servicePath, ssl } = this.config.eureka;
    const protocol = ssl ? 'https' : 'http';
    callback(null, `${protocol}://${host}:${port}${servicePath}`);
  }

  buildServiceUrls() {
    const { host, port, servicePath, ssl,
      serviceUrl, preferSameZone } = this.config.eureka;
    const { metadata } = this.config.instance.dataCenterInfo;
    const instanceZone = metadata ? metadata['availability-zone'] : undefined;
    const serviceUrls = [];
    const zones = this.getAvailabilityZones();
    if (serviceUrl) {
      zones.forEach((zone) => {
        if (serviceUrl[zone]) {
          if (preferSameZone && instanceZone && instanceZone === zone) {
            serviceUrls.unshift(...serviceUrl[zone]);
          }
          serviceUrls.push(...serviceUrl[zone]);
        }
      });
    }
    if (!serviceUrls.length) {
      const protocol = ssl ? 'https' : 'http';
      serviceUrls.push(`${protocol}://${host}:${port}${servicePath}`);
    }
    return serviceUrls;
  }

  getAvailabilityZones() {
    const { ec2Region, availabilityZones } = this.config.eureka;
    if (ec2Region && availabilityZones && availabilityZones[ec2Region]) {
      return availabilityZones[ec2Region];
    }
    return ['default'];
  }
}
