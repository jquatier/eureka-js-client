var gulp = require('gulp');
var babel = require('gulp-babel');
var mocha = require('gulp-mocha');
var eslint = require('gulp-eslint');
var instrumenter = require('babel-istanbul').Instrumenter;
var istanbul = require('gulp-istanbul');
var mochaBabel = require('babel/register');
var execFile = require('child_process').execFile;
var path = require('path');

gulp.task('build', function() {
  return gulp.src('src/**/*.js')
    .pipe(babel())
    .pipe(gulp.dest('lib'));
});

gulp.task('lint', function() {
  return gulp.src('src/**/*.js')
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failOnError());
});

gulp.task('mocha', function (cb) {
  gulp.src('src/**/*.js')
    .pipe(istanbul({
      instrumenter: instrumenter
    })) // Covering files
    .pipe(istanbul.hookRequire()) // Force `require` to return covered files
    .on('finish', function () {
      gulp.src(['test/**/*.js'])
        .pipe(mocha())
        .pipe(istanbul.writeReports()) 
        .pipe(istanbul.enforceThresholds({ thresholds: { global: 0 } })) 
        .on('end', cb);
    });
});

gulp.task('integration', function(done) {
  execFile(path.join(__dirname, 'test', 'docker_setup.sh'), function(err, stdout, stderr) {
    if (stdout) {
      console.log(stdout);
    } else {
      console.error(err || stderr);
    }
    done();
  });
  // TODO: Run integration tests.
});

gulp.task('test', ['lint', 'mocha']);

gulp.task('test:watch', function() {
  return gulp.watch(['src/**/*.js', 'test/**/*.test.js'], ['test']);
});

gulp.task('default', ['build']);
