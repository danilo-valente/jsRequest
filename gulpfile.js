var gulp = require('gulp');
var template = require('gulp-template');
var uglify = require('gulp-uglify');
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');
var size = require('gulp-size');
var notify = require('gulp-notify');
var rename = require('gulp-rename');
var connect = require('gulp-connect');
var throttle = require('gulp-throttle');

var src = 'src/jsRequest.js';
var dist = 'dist';

var templateParams = {
    version: require('./package.json').version
};

var notifyParams = {
    onLast: true,
    message: function (file) {
        return file.relative + ' file size: ' + file.stat.size + ' bytes';
    }
};

var renameParams = { suffix: '.min' };

gulp.task('build', function () {
    return gulp.src(src)
        .pipe(template(templateParams))
        .pipe(gulp.dest(dist))
        .pipe(jshint())
        .pipe(jshint.reporter(stylish))
        .pipe(uglify())
        .pipe(size())
        .pipe(notify(notifyParams))
        .pipe(rename(renameParams))
        .pipe(gulp.dest(dist));
});

gulp.task('uglify', function () {
    return gulp.src(src)
        .pipe(template(templateParams))
        .pipe(gulp.dest(dist))
        .pipe(uglify())
        .on('error', notify.onError('Error: <%= error.message %>'))
        .pipe(size())
        .pipe(notify(notifyParams))
        .pipe(rename(renameParams))
        .pipe(gulp.dest(dist));
});

gulp.task('default', ['uglify'], function () {
    gulp.watch(src, ['uglify']);

    var port = 9000;
    connect.server({
        root: [__dirname],
        port: port,
        livereload: true
    });

    throttle({
        local_port: port + 1,
        remote_port: port,
        upstream: 4096 * 10,
        downstream: 4096 * 100,
        keep_alive: true
    });
});