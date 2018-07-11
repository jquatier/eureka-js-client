import { Options as RequestOptions } from 'request'
import { EventEmitter } from 'events'

class EurekaClient extends EventEmitter {
  readonly instanceId: string
  readonly amazonDataCenter: boolean

  constructor(config: Config)

  start(callback: (err: Error, ...rest: any[]) => void)

  stop(callback: (err: Error, ...rest: any[]) => void)

  validateConfig(config: Config): void

  register(callback: (err: Error, ...rest: any[]) => any): any

  deregister(callback: (err: Error, ...rest: any[]) => any): any

  startHeartbeats(): void

  renew(): void

  startRegistryFetches(): void

  getInstancesByAppId(appId: string): InstanceConfig[]

  getInstancesByVipAddress(vipAddress: any): InstanceConfig[]

  fetchRegistry(callback: (err: Error, ...rest: any[]) => void): void

  fetchFullRegistry(callback: (err: Error, ...rest: any[]) => void): void

  fetchDelta(callback: (err: Error, ...rest: any[]) => void): void

  transformRegistry(registry: EurekaAppsResponse): void

  transformApp(app: App, cache: Cache): void

  validateInstance(instance: InstanceConfig): boolean

  splitVipAddress(vipAddress: string): string[]

  handleDelta(cache: Cache, appDelta: EurekaDeltaResponse): void

  addInstance(cache: Cache, instance: InstanceConfig): void

  modifyInstance(cache: Cache, instance: InstanceConfig): void

  deleteInstance(cache: Cache, instance: InstanceConfig): void

  addInstanceMetadata(callback: () => void): void

  eurekaRequest(opts: RequestOptions, callback: (error: Error, response, body) => void, retryAttempt?: any): void
}

interface Logger {
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
  instanceId?: string,
  app: string,
  appGroupName?: string,
  ipAddr?: string,
  sid?: string,
  port: PortWrapper,
  securePort?: PortWrapper,
  homePageUrl?: string,
  statusPageUrl?: string,
  healthCheckUrl?: string,
  secureHealthCheckUrl?: string,
  vipAddress: string,
  secureVipAddress?: string,
  countryId?: number,
  dataCenterInfo: DataCenterInfo,
  hostName?: string,
  status?: InstanceStatus,
  overriddenstatus?: InstanceStatus,
  overriddenStatus?: InstanceStatus,
  leaseInfo?: LeaseInfo,
  isCoordinatingDiscoveryServer?: boolean,
  metadata?: object,
  lastUpdatedTimestamp?: number,
  lastDirtyTimestamp?: number,
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
  Cache
}

export default EurekaClient
