require('babel/register');
var gulp = require('gulp'),
    babel = require('gulp-babel'),
    mocha = require('gulp-mocha');

gulp.task('default', function() {
  return gulp.src('src/eureka-client.js')
    .pipe(babel())
    .pipe(gulp.dest('lib'));
});

gulp.task('test', function () {
  return gulp.src('test/**.test.js', {read: false})
    .pipe(mocha({reporter: 'spec'}));
});

gulp.task('test:watch', function() {
  return gulp.watch(['src/eureka-client.js', 'test/eureka-client.test.js'], ['test']);
});