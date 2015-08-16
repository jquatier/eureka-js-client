var gulp = require('gulp'),
    babel = require("gulp-babel");

gulp.task('default', function() {
  return gulp.src("src/eureka-client.js")
    .pipe(babel())
    .pipe(gulp.dest("lib"));
});
