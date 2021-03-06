'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const _ = require('lodash');
const async = require('async');
const shortid = require('shortid');
const archiver = require('archiver');

const Generator = require('./Generator');

const tempDir = process.env.TOSCAFY_TEMP_DIR || os.tmpdir();



module.exports = () => {
  const obj = {};

  const genpack = (csarspec, context, done) => {
    if (_.isEmpty(context)) return done(new Error('context missing'));
    else if (!_.isString(context.format)) return done(new Error('format must be specified as string as part of context'));

    context.format = context.format.toLowerCase().trim();

    if (!_.includes(['zip', 'tar', 'tgz', 'targz'], context.format)) return done(new Error('invalid format: ' + context.format));

    if (!context.outputFile && !context.outputStream) {
      context.outputFile = path.join(tempDir, 'toscafy-csar-' + shortid.generate() + '.' + context.format);
    }

    context.tempDir = path.join(tempDir, 'toscafy-temp-' + shortid.generate());
    context.outputDir = context.tempDir;

    async.series([
      function(done) {
        fs.ensureDir(context.tempDir, done);
      },
      function(done) {
        if (!context.outputFile) return done();

        context.outputFile = path.resolve(context.outputFile);

        fs.ensureDir(path.dirname(context.outputFile), done);
      },
      function(done) {
        Generator().generate(csarspec, context, done);
      },
      function(done) {
        done = _.once(done);

        context.outputStream = context.outputStream || fs.createWriteStream(context.outputFile);

        let options;

        if (_.includes(['tgz', 'targz'], context.format)) {
          context.format = 'tar';

          options = {
            gzip: true,
            gzipOptions: {
              level: 1
            }
          }
        }

        const archive = archiver(context.format, options);

        context.outputStream.on('close', () => {
          //console.log(archive.pointer() + ' total bytes');
          //console.log('archiver has been finalized and the output file descriptor has closed.');
          done();
        });

        archive.on('error', (err) => {
          done(err);
        });

        archive.pipe(context.outputStream);

        archive.glob('**', {
          nodir: true,
          dot: true,
          root: context.tempDir,
          cwd: context.tempDir
        }).finalize();
      }
    ], function(err) {
      fs.remove(context.tempDir, (err2) => {
        if (err2) console.error(err2);

        done(err, context.outputFile);
      });
    });
  };

  obj.genpack = genpack;

  return obj;
};
