import { expect } from 'chai';

import EurekaClient from '../src/EurekaClient';
import EurekaDefault, { Eureka as EurekaNamed } from '../src/index';

// Compatibility with older node versions:
const EurekaCommonjs = require('../src/index').Eureka;

describe('index', () => {
  it('should export both a default and a named', () => {
    expect(EurekaDefault).to.equal(EurekaClient);
    expect(EurekaDefault).to.equal(EurekaNamed);
  });

  it('should export correctly for ', () => {
    expect(EurekaCommonjs).to.equal(EurekaDefault);
  });
});
