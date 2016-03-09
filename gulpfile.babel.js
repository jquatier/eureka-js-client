import gulp from 'gulp';
import babel from 'gulp-babel';
import mocha from 'gulp-mocha';
import eslint from 'gulp-eslint';
import { Instrumenter } from 'babel-istanbul';
import istanbul from 'gulp-istanbul';
import env from 'gulp-env';
import { exec } from 'child_process';

gulp.task('build', () => (
  gulp.src('src/**/*.js')
    .pipe(babel())
    .pipe(gulp.dest('lib'))
));

gulp.task('lint', () => (
  gulp.src(['src/**/*.js', 'test/**/*.js'])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failOnError())
));

gulp.task('mocha', (cb) => {
  const envs = env.set({
    NODE_ENV: 'test',
  });

  return gulp.src('src/**/*.js')
    .pipe(envs)
    .pipe(istanbul({
      instrumenter: Instrumenter,
    })) // Covering files
    .pipe(istanbul.hookRequire()) // Force `require` to return covered files
    .on('finish', () => {
      gulp.src(['test/**/*.js', '!test/integration.test.js'])
        .pipe(mocha())
        .pipe(istanbul.writeReports())
        .pipe(istanbul.enforceThresholds({ thresholds: { global: 0 } }))
        .pipe(envs.reset)
        .on('end', cb);
    });
});

const DOCKER_RUN = 'docker run -d -p 8080:8080 --name eureka netflixoss/eureka:1.1.147';
gulp.task('docker:run', (cb) => {
  exec(DOCKER_RUN, (error, stdout, stderr) => {
    /* eslint-disable no-console */
    console.log(stdout);
    console.log(stderr);
    console.log('Sleeping for 60 seconds for server startup...');
    /* eslint-enable no-console */
    setTimeout(cb, 60000);
  });
});

gulp.task('test:integration', ['docker:run'], () => (
  gulp.src('test/integration.test.js')
    .pipe(mocha({ timeout: 120000 }))
));

gulp.task('test', ['lint', 'mocha']);

gulp.task('test:watch', () => (
  gulp.watch(['src/**/*.js', 'test/**/*.test.js'], ['test'])
));

gulp.task('default', ['build']);
