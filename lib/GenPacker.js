'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const _ = require('lodash');
const async = require('async');
const shortid = require('shortid');
const archiver = require('archiver');

const Generator = require('./Generator');



module.exports = () => {
  const obj = {};

  const genpack = (csarSpec, context, done) => {
    if (_.isEmpty(context)) return done(new Error('context missing'));
    else if (!_.isString(context.format)) return done(new Error('format must be specified as string as part of context'));
    else if (_.isEmpty(context.outputFile)) return done(new Error('output file must be specified as part of context'));

    context.format = context.format.toLowerCase().trim();

    if (!_.includes(['zip', 'tar', 'tgz', 'targz'], context.format)) return done(new Error('invalid format: ' + context.format));

    context.outputFile = path.resolve(context.outputFile);
    context.tempDir = path.join(os.tmpdir(), 'toscafy' + shortid.generate());
    context.outputDir = context.tempDir;

    async.series([
      function(done) {
        fs.ensureDir(context.tempDir, done);
      },
      function(done) {
        fs.ensureDir(path.dirname(context.outputFile), done);
      },
      function(done) {
        Generator().generate(csarSpec, context, done);
      },
      function(done) {
        done = _.once(done);

        const outputStream = fs.createWriteStream(context.outputFile);

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

        outputStream.on('close', () => {
          //console.log(archive.pointer() + ' total bytes');
          //console.log('archiver has been finalized and the output file descriptor has closed.');
          done();
        });

        archive.on('error', (err) => {
          done(err);
        });

        archive.pipe(outputStream);

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
        
        done(err);
      });
    });
  };

  obj.genpack = genpack;

  return obj;
};
