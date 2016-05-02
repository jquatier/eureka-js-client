## 3.0.0
  - Added support for the following events: `started`, `registered`, `deregistered`, `heartbeat`, and `registryUpdated`.
  - Improved the stability of the client when it encounters downstream DNS errors, as a side-effect the callback for `fetchRegistries()` now returns errors when they are encountered.
  - Populate registry cache with instances that have a status of `UP`, `filterUpInstances` can be set to `false` to disable.
