// Default configuration values:
export default {
  eureka: {
    heartbeatInterval: 30000,
    registryFetchInterval: 30000,
    fetchRegistry: true,
    servicePath: '/eureka/v2/apps/',
    ssl: false,
    useDns: false,
    fetchMetadata: true,
  },
  instance: {},
};
