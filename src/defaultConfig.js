// Default configuration values:
export default {
  requestMiddleware: (request, done) => done(request),
  shouldUseDelta: false,
  eureka: {
    heartbeatInterval: 30000,
    registryFetchInterval: 30000,
    maxRetries: 3,
    requestRetryDelay: 500,
    retryableStatusCodes: "500-599",
    fetchRegistry: true,
    filterUpInstances: true,
    servicePath: '/eureka/v2/apps/',
    ssl: false,
    useDns: false,
    preferSameZone: true,
    clusterRefreshInterval: 300000,
    fetchMetadata: true,
    registerWithEureka: true,
    useLocalMetadata: false,
    preferIpAddress: false,
  },
  instance: {},
};
