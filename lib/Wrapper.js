'use strict';

const os = require('os');
const path = require('path');
const exec = require('child_process').exec;
const async = require('async');
const _ = require('lodash');
const shortid = require('shortid');
const fs = require('fs-extra');
const decompress = require('decompress');
const archiver = require('archiver');



const wrapTypes = {
  'soap-api': 'soap',
  'rest-api': 'rest'
};



module.exports = () => {
  const obj = {};

  const wrap = (artifact, context, done) => {
    if (_.isEmpty(artifact)) return done(new Error('artifact missing'));
    else if (_.isEmpty(context)) return done(new Error('context missing'));
    else if (_.isEmpty(context.baseDir)) return done(new Error('base dir missing'));

    context.wrapType = _.toLower(context.wrapType);

    if (!_.includes(_.keys(wrapTypes), context.wrapType)) return done(new Error('invalid wrap type: ' + context.wrapType));

    context.wrapType = wrapTypes[context.wrapType];

    context.artifactName = context.artifactName || artifact.name;

    if (_.isEmpty(context.artifactName)) return done(new Error('artifact name missing'));

    const artifactSpecFile = _.reduce(artifact.references, (result, ref) => {
      if (_.includes(ref, 'artifact-spec')) return path.resolve(context.baseDir, ref);
      else return result;
    }, null);

    if (!artifactSpecFile) return done(new Error('cannot find artifact-spec.json file in references'));

    const artifactFilesArchive = _.reduce(artifact.references, (result, ref) => {
      if (_.includes(ref, 'artifact-files')) return path.resolve(context.baseDir, ref);
      else return result;
    }, null);

    if (!artifactFilesArchive) return done(new Error('cannot find artifact-files archive in references'));

    const baseTempDir = process.env.BASE_TEMP_DIR || os.tmpdir();

    const artifactFilesTemp = path.resolve(baseTempDir, 'toscafy-artifact-files-' + shortid.generate());

    let artifactSpec;

    const generatedApiTemp = path.resolve(baseTempDir, 'toscafy-any2api-generated-' + shortid.generate());

    const generatedApiArchiveName = 'any2api-generated-' + context.artifactName + '.tar.gz';
    const generatedApiArchive = path.resolve(context.baseDir, generatedApiArchiveName);

    let wrappedArtifact;

    let baseCommand = 'any2api ';

    async.series([
      function(done) {
        fs.ensureDir(artifactFilesTemp, done);
      },
      function(done) {
        exec(baseCommand + '--help', (err, stdout, stderr) => {
          if (err) {
            baseCommand = null;
          }

          done();
        });
      },
      function(done) {
        if (baseCommand) return done();

        baseCommand = 'docker run -v ' + baseTempDir + ':' + baseTempDir + ' any2api/cli ';

        exec(baseCommand + '--help', (err, stdout, stderr) => {
          if (err) {
            return done(new Error('calling any2api directly and through Docker failed: ' + err));
          }

          done();
        });
      },
      function(done) {
        fs.readFile(artifactSpecFile, 'utf8', (err, content) => {
          if (err) return done (err);

          try {
            artifactSpec = JSON.parse(content);
          } catch (err) {
            return done(new Error('cannot parse artifact-spec.json file: ' + err));
          }

          done();
        });
      },
      function(done) {
        decompress(artifactFilesArchive, artifactFilesTemp).then(files => {
          //if (_.isEmpty(files)) ...
          done();
        }).catch(done);
      },
      function(done) {
        const apispec = {
          executables: {},
          implementation: {
            title: context.artifactName,
            description: artifact.description
          }
        };

        apispec.executables[context.artifactName] = artifactSpec;
        apispec.executables[context.artifactName].path = '.';

        fs.writeFile(path.resolve(artifactFilesTemp, 'apispec.json'), JSON.stringify(apispec, null, 2), done);
      },
      function(done) {
        exec(baseCommand + '-i ' + context.wrapType + ' -c -o ' + generatedApiTemp + ' gen ' + artifactFilesTemp, (err, stdout, stderr) => {
          if (err) return done(new Error('any2api gen failed: ' + err + '\n' + stderr + '\n' + stdout));

          done();
        });
      },
      function(done) {
        done = _.once(done);

        const outputStream = fs.createWriteStream(generatedApiArchive);

        const archive = archiver('tar', {
          gzip: true,
          gzipOptions: { level: 1 }
        });

        outputStream.on('close', done);

        archive.on('error', done);

        archive.pipe(outputStream);

        archive.glob('**', {
          nodir: true,
          dot: true,
          root: generatedApiTemp,
          cwd: generatedApiTemp
        }).finalize();
      },
      function(done) {
        wrappedArtifact = {
          type: 'DockerComposeArtifact',
          namespace: 'http://toscafy.github.io/artifacttypes',
          properties: {
            context: generatedApiArchiveName,
            //serviceName: 'mysql-mgmt-api',
            containerPort: '3000',
            endpointPath: '/'
          },
          references: [
            generatedApiArchiveName
          ]
        };

        done();
      }
    ], (err) => {
      async.series([
        async.apply(fs.remove, artifactFilesTemp),
        async.apply(fs.remove, generatedApiTemp)
      ], (err2) => {
        if (err2) console.error(err2);

        done(err, wrappedArtifact);
      });
    });
  };

  obj.wrap = wrap;

  return obj;
};
