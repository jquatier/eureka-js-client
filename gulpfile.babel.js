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

gulp.task('docker:run', function(cb) {
  exec('docker run -d -p 8080:8080 --name eureka netflixoss/eureka:1.3.1', (error, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
    cb();
  });
});

gulp.task('test:integration', ['docker:run'], () => {
  return gulp.src('test/integration.test.js')
    .pipe(mocha());
});

gulp.task('test', ['lint', 'mocha']);

gulp.task('test:watch', () => (
  gulp.watch(['src/**/*.js', 'test/**/*.test.js'], ['test'])
));

gulp.task('default', ['build']);
