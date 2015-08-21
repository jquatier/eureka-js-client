var gulp = require('gulp');
var babel = require('gulp-babel');
var mocha = require('gulp-mocha');
var eslint = require('gulp-eslint');
var mochaBabel = require('babel/register');

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

gulp.task('mocha', function () {
  return gulp.src('test/**/*.test.js', {read: false})
    .pipe(mocha({
      reporter: 'spec',
      compilers: {
        js: babel
      }
    }));
});

gulp.task('test', ['lint', 'mocha']);

gulp.task('test:watch', function() {
  return gulp.watch(['src/**/*.js', 'test/**/*.test.js'], ['test']);
});

gulp.task('default', ['build']);
