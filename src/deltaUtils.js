/*
  General utilities for handling processing of delta changes from eureka.
*/
export function arrayOrObj(mysteryValue) {
  return Array.isArray(mysteryValue) ? mysteryValue : [ mysteryValue ];
}

export function normalizeDelta(appDelta) {
  return arrayOrObj(appDelta).map((app) => {
    app.instance = arrayOrObj(app.instance);
    return app;
  });
}
