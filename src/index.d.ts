import { Options as RequestOptions, Response } from 'request'
import { EventEmitter } from 'events'

class EurekaClient extends EventEmitter {
  /**
   * Helper method to get the instance ID. If the datacenter is AWS, this will be the instance-id in the metadata. Else, it's the hostName.
   */
  readonly instanceId: string
  /**
   * Helper method to determine if this is an AWS datacenter.
   */
  readonly amazonDataCenter: boolean

  constructor(config: Config)

  /**
   * Registers instance with Eureka, begins heartbeats, and fetches registry.
   * @param {(err: Error, ...rest: any[]) => void} callback
   */
  start(callback: (err: Error, ...rest: any[]) => void)

  /**
   * De-registers instance with Eureka, stops heartbeats / registry fetches.
   * @param {(err: Error, ...rest: any[]) => void} callback
   */
  stop(callback: (err: Error, ...rest: any[]) => void)

  /**
   * Validates client configuration.
   * @param {Config} config
   */
  validateConfig(config: Config): void

  /**
   * Registers with the Eureka server and initializes heartbeats on registration success.
   * @param {(err: Error, ...rest: any[]) => any} callback
   * @returns {any}
   */
  register(callback: (err: Error, ...rest: any[]) => any): any

  /**
   * De-registers with the Eureka server and stops heartbeats.
   * @param {(err: Error, ...rest: any[]) => any} callback
   * @returns {any}
   */
  deregister(callback: (err: Error, ...rest: any[]) => any): any

  /**
   * Sets up heartbeats on interval for the life of the application.
   * Heartbeat interval by setting configuration property: eureka.heartbeatInterval
   */
  startHeartbeats(): void

  renew(): void

  /**
   * Sets up registry fetches on interval for the life of the application.
   * Registry fetch interval setting configuration property: eureka.registryFetchInterval
   */
  startRegistryFetches(): void

  /**
   * Retrieves a list of instances from Eureka server given an appId
   * @param {string} appId
   * @returns {InstanceConfig[]}
   */
  getInstancesByAppId(appId: string): InstanceConfig[]

  /**
   * Retrieves a list of instances from Eureka server given a vipAddress
   * @param vipAddress
   * @returns {InstanceConfig[]}
   */
  getInstancesByVipAddress(vipAddress: any): InstanceConfig[]

  /**
   * Orchestrates fetching registry
   * @param {(err: Error, ...rest: any[]) => void} callback
   */
  fetchRegistry(callback: (err: Error, ...rest: any[]) => void): void

  /**
   * Retrieves all applications registered with the Eureka server
   * @param {(err: Error, ...rest: any[]) => void} callback
   */
  fetchFullRegistry(callback: (err: Error, ...rest: any[]) => void): void

  /**
   * Retrieves all applications registered with the Eureka server
   * @param {(err: Error, ...rest: any[]) => void} callback
   */
  fetchDelta(callback: (err: Error, ...rest: any[]) => void): void

  /**
   * Transforms the given registry and caches the registry locally
   * @param {EurekaAppsResponse} registry
   */
  transformRegistry(registry: EurekaAppsResponse): void

  /**
   * Transforms the given application and places in client cache. If an application
   * has a single instance, the instance is placed into the cache as an array of one
   * @param {App} app
   * @param {Cache} cache
   */
  transformApp(app: App, cache: Cache): void

  /**
   * Returns true if instance filtering is disabled, or if the instance is UP
   * @param {InstanceConfig} instance
   * @returns {boolean}
   */
  validateInstance(instance: InstanceConfig): boolean

  /**
   * Returns an array of vipAddresses from string vipAddress given by eureka
   * @param {string} vipAddress
   * @returns {string[]}
   */
  splitVipAddress(vipAddress: string): string[]

  handleDelta(cache: Cache, appDelta: EurekaDeltaResponse): void

  addInstance(cache: Cache, instance: InstanceConfig): void

  modifyInstance(cache: Cache, instance: InstanceConfig): void

  deleteInstance(cache: Cache, instance: InstanceConfig): void

  /**
   * Fetches the metadata using the built-in client and updates the instance
   * configuration with the hostname and IP address. If the value of the config
   * option 'eureka.useLocalMetadata' is true, then the local IP address and
   * hostname is used. Otherwise, the public IP address and hostname is used. If
   * 'eureka.preferIpAddress' is true, the IP address will be used as the hostname.
   *
   * A string replacement is done on the healthCheckUrl, statusPageUrl and
   * homePageUrl so that users can define the URLs with a placeholder for the
   * host ('__HOST__'). This allows flexibility since the host isn't known until
   * the metadata is fetched. The replaced value respects the config option
   * 'eureka.useLocalMetadata' as described above.
   *
   * This will only get called when dataCenterInfo.name is Amazon, but you can
   * set config.eureka.fetchMetadata to false if you want to provide your own
   * metadata in AWS environments.
   * @param {() => void} callback
   */
  addInstanceMetadata(callback: () => void): void

  /**
   * Helper method for making a request to the Eureka server. Handles resolving
   * the current cluster as well as some default options.
   * @param {request.Options} opts
   * @param {(error: Error, response: request.Response, body: any) => void} callback
   * @param {number} retryAttempt
   */
  eurekaRequest(
    opts: RequestOptions, callback: (error: Error, response: Response, body: any) => void, retryAttempt?: number): void
}

interface Logger {
  /**
   * Set default error logger level
   * @param {number | "error" | "warn" | "info" | "debug"} inVal
   */
  level(inVal: number | 'error' | 'warn' | 'info' | 'debug'): void

  error(...args: any[]): void

  warn(...args: any[]): void

  info(...args: any[]): void

  debug(...args: any[]): void
}

interface ClientConfig {
  /**
   * eureka server host
   */
  host?: string,
  /**
   * eureka server post
   */
  port?: number,
  /**
   * List of available service urls for discovery services
   */
  serviceUrls?: { [serviceName: string]: string[] }
  /**
   * milliseconds to wait between heartbeats
   * @default 30000
   */
  heartbeatInterval?: number,
  /**
   * milliseconds to wait between registry fetches
   * @default 30000
   */
  registryFetchInterval?: number,
  /**
   * Number of times to retry all requests to eureka
   * @default 3
   */
  maxRetries?: number,
  /**
   * milliseconds to wait between retries. This will be multiplied by the # of failed retries.
   * @default 500
   */
  requestRetryDelay?: number,
  /**
   * enable/disable registry fetching
   */
  fetchRegistry?: boolean,
  /**
   * enable/disable filtering of instances with status === UP
   * @default true
   */
  filterUpInstances?: boolean,
  /**
   * path to eureka REST service
   * @default /eureka/v2/apps/
   */
  servicePath?: string,
  /**
   * enable SSL communication with Eureka server
   * @default false
   */
  ssl?: boolean,
  /**
   * look up Eureka server using DNS, see Looking up Eureka Servers in AWS using DNS
   * @default false
   * @see https://github.com/jquatier/eureka-js-client#looking-up-eureka-servers-in-aws-using-dns
   */
  useDns?: boolean,
  /**
   * enable/disable zone affinity when locating a Eureka server
   * @default true
   */
  preferSameZone?: boolean,
  /**
   * milliseconds to wait between refreshing cluster hosts (DNS resolution only)
   * @default 300000
   */
  clusterRefreshInterval?: number,
  /**
   * fetch AWS metadata when in AWS environment, see Configuring for AWS environments
   * @default true
   */
  fetchMetadata?: boolean,
  /**
   * enable/disable Eureka registration
   * @default true
   */
  registerWithEureka?: boolean,
  /**
   * use local IP and local hostname from metadata when in an AWS environment.
   * @default false
   */
  useLocalMetadata?: boolean,
  /**
   * use IP address (local or public) as the hostname for registration when in an AWS environment.
   * @default false
   */
  preferIpAddress?: boolean
}

type LeaseInfo = {
  renewalIntervalInSecs?: number,
  durationInSecs?: number,
  registrationTimestamp?: number,
  lastRenewalTimestamp?: number,
  renewalTimestamp?: number,
  evictionTimestamp?: number,
  serviceUpTimestamp?: number,
}
type PortWrapper = number | {
  /**
   * Checks whether a port is enabled for traffic or not.
   *
   * @param type indicates whether it is secure or non-secure port.
   * @return true if the port is enabled, false otherwise.
   */
  '@enabled': boolean,
  $: number,
}
type InstanceStatus = 'UP' | 'DOWN' | 'STARTING' | 'OUT_OF_SERVICE' | 'UNKNOWN';
type DataCenterInfo = {
  '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
  name: 'MyOwn',
} | {
  '@class': 'com.netflix.appinfo.AmazonInfo',
  name: 'Amazon',
} | {
  '@class'?: string,
  name: 'Netflix',
}

interface InstanceConfig {
  /**
   * Sets the unique id of the instance.
   * (Note) now that id is set at creation time within the instanceProvider, why do the other checks?
   * This is still necessary for backwards compatibility when upgrading in a deployment with multiple
   * client versions (some with the change, some without).
   */
  instanceId?: string,
  /**
   * Sets the name of the application registering with discovery
   */
  app: string,
  /**
   * Sets the group name of the application registering with discovery
   */
  appGroupName?: string,
  /**
   * Returns the ip address of the instance.
   */
  ipAddr?: string,
  /**
   * Sets the identity of this application instance
   *
   * @deprecated
   */
  sid?: string,
  /**
   * Sets the port number that is used for servicing requests.
   */
  port: PortWrapper,
  /**
   * Sets the secure port that is used for servicing requests.
   */
  securePort?: PortWrapper,
  /**
   * Sets the home page set for this instance.
   */
  homePageUrl?: string,
  /**
   * Sets the status page set for this instance.
   */
  statusPageUrl?: string,
  /**
   * Sets the absolute URLs for the health check page for both secure and
   * non-secure protocols. If the port is not enabled then the URL is
   * excluded.
   */
  healthCheckUrl?: string,
  /**
   * Sets the absolute URL for the health check page for both secure and
   * non-secure protocols. If the port is not enabled then the URL is
   * excluded.
   */
  secureHealthCheckUrl?: string,
  /**
   * Sets the Virtual Internet Protocol address for this instance. Defaults to
   * hostname if not specified.
   */
  vipAddress: string,
  /**
   * Sets the Secure Virtual Internet Protocol address for this instance.
   * Defaults to hostname if not specified.
   */
  secureVipAddress?: string,
  /**
   * @Deprecated
   */
  countryId?: number,
  /**
   * Sets data center information identifying if it is AWS or not.
   *
   * @return the data center information.
   */
  dataCenterInfo: DataCenterInfo,
  /**
   * Sets the default network address to connect to this instance. Typically this would be the fully
   * qualified public hostname.
   *
   * However the user can configure the {@link EurekaInstanceConfig} to change the default value used
   * to populate this field using the {@link EurekaInstanceConfig#getDefaultAddressResolutionOrder()} property.
   *
   * If a use case need more specific hostnames or ips, please use data from {@link #getDataCenterInfo()}.
   *
   * For legacy reasons, it is difficult to introduce a new address-type field that is agnostic to hostname/ip.
   */
  hostName?: string,
  /**
   * Sets the status of the instance.
   */
  status?: InstanceStatus,
  /**
   * Sets the overridden status if any of the instance.
   *
   * @deprecated
   */
  overriddenstatus?: InstanceStatus,
  /**
   * Sets the overridden status if any of the instance.
   */
  overriddenStatus?: InstanceStatus,
  /**
   * Sets the lease information regarding when it expires.
   */
  leaseInfo?: LeaseInfo,
  /**
   * Sets a flag if this instance is the same as the discovery server that is
   * return the instances. This flag is used by the discovery clients to
   * identity the discovery server which is coordinating/returning the
   * information.
   */
  isCoordinatingDiscoveryServer?: boolean,
  /**
   * Sets all application specific metadata set on the instance
   */
  metadata?: object,
  /**
   * Sets the time elapsed since epoch since the instance status has been
   * last updated.
   */
  lastUpdatedTimestamp?: number,
  /**
   * Sets the last time stamp when this instance was touched.
   */
  lastDirtyTimestamp?: number,
  /**
   * Sets the type of action done on the instance in the server.Primarily
   * used for updating deltas in the {@link com.netflix.discovery.EurekaClient}
   * instance.
   */
  actionType?: 'ADDED' | 'MODIFIED' | 'DELETED',
}

interface Config {
  /**
   * The client exposes the ability to modify the outgoing request options object prior to a eureka call.
   * This is useful when adding authentication methods such as OAuth, or other custom headers.
   * This will be called on every eureka request, so it highly suggested that any long-lived
   * external calls made in the middleware are cached or memoized. If the middleware returns
   * anything other than an object, the eureka request will immediately fail and perform a retry if configured.
   *
   * @param requestOpts
   * @param done
   */
  requestMiddleware?: (requestOpts: RequestOptions, done: (requestOpts: RequestOptions) => void) => void,
  /**
   * Experimental mode to fetch deltas from eureka instead of full registry on update
   */
  shouldUseDelta: boolean,
  /**
   * logger implementation for the client to use
   */
  logger: Logger
  /**
   * Configuration for Eureka.js client
   */
  eureka: ClientConfig,
  /**
   * Configuration for Eureka instance
   */
  instance: InstanceConfig,
}

/**
 * Data structure for internal registry of Eureka client applications
 * @internal
 */
interface EurekaAppsResponse {
  versions__delta: string,
  apps__hashcode: string,
  applications: {
    application: App[]
  }
}

/**
 * Data structure for internal App description of Eureka client applications
 * @internal
 */
interface App {
  name: string,
  instance: InstanceConfig | InstanceConfig[]
}

/**
 * Data structure for delta response from eureka
 * @internal
 */
interface EurekaDeltaResponse {
  versions__delta: string,
  apps__hashcode: string,
  application: App[]
}

/**
 * Data structure internal cache object
 * @internal
 */
interface Cache {
  app: { [appName: string]: App[] },
  vip: { [vipAdress: string]: InstanceConfig },
}

const Eureka: EurekaClient

export {
  Eureka,
  Config,
  ClientConfig,
  InstanceConfig,
  Logger,

  LeaseInfo,
  PortWrapper,
  InstanceStatus,
  DataCenterInfo,
  EurekaAppsResponse,
  App,
  EurekaDeltaResponse,
  Cache,

  RequestOptions,
  Response,
  EventEmitter
}

export default EurekaClient
