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

const isValidWrap = (wrapType) => {
  wrapType = _.toLower(wrapType);

  if (!_.includes(_.keys(wrapTypes), wrapType)) return false;
  else return true;
};



module.exports = () => {
  const obj = {};

  const wrap = (artifact, context, done) => {
    if (_.isEmpty(artifact)) return done(new Error('artifact missing'));
    else if (_.isEmpty(context)) return done(new Error('context missing'));
    else if (_.isEmpty(context.baseDir)) return done(new Error('base dir missing'));
    else if (!isValidWrap(context.wrapType)) return done(new Error('invalid wrap type: ' + context.wrapType));

    context.wrapType = wrapTypes[_.toLower(context.wrapType)];

    context.artifactName = context.artifactName || artifact.name;

    if (_.isEmpty(context.artifactName)) return done(new Error('artifact name missing'));

    artifact.properties = artifact.properties || {};



    const baseTempDir = process.env.BASE_TEMP_DIR || os.tmpdir();

    let artifactSpec;

    const artifactFilesTemp = path.resolve(baseTempDir, 'toscafy-artifact-files-' + shortid.generate());

    const generatedApiTemp = path.resolve(baseTempDir, 'toscafy-any2api-generated-' + shortid.generate());

    const generatedApiArchiveName = 'any2api-generated-' + context.artifactName + '.tar.gz';
    const generatedApiArchive = path.resolve(context.baseDir, generatedApiArchiveName);

    let apispec = artifact.apispec || artifact.properties.apispec;
    let apispecDir = context.baseDir;
    let apispecFile = path.resolve(apispecDir, 'apispec.json');

    let wrappedArtifact;

    let baseCommand = 'any2api ';



    const artifactSpecFile = _.reduce(artifact.references, (result, ref) => {
      if (_.includes(ref, 'artifact-spec')) return path.resolve(context.baseDir, ref);
      else return result;
    }, null);

    if (!apispec && !artifactSpecFile) {
      return done(new Error('cannot find artifact-spec.json file in references and apispec property missing, one of them has to be there'));
    }

    const artifactFilesArchive = _.reduce(artifact.references, (result, ref) => {
      if (_.includes(ref, 'artifact-files')) return path.resolve(context.baseDir, ref);
      else return result;
    }, null);

    if (artifactSpecFile) {
      apispecDir = artifactFilesTemp;
      apispecFile = path.resolve(apispecDir, 'apispec.json');
    }



    async.series([
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

        baseCommand = 'docker run --rm -v ' + baseTempDir + ':' + baseTempDir + ' -v ' + context.baseDir + ':' + context.baseDir + ' any2api/cli ';

        exec(baseCommand + '--help', (err, stdout, stderr) => {
          if (err) {
            return done(new Error('calling any2api directly and through Docker failed: ' + err));
          }

          done();
        });
      },
      function(done) {
        fs.ensureDir(artifactFilesTemp, done);
      },
      function(done) {
        if (!artifactSpecFile) return done();

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
        if (!artifactFilesArchive) return done();

        decompress(artifactFilesArchive, artifactFilesTemp).then(files => {
          //if (_.isEmpty(files)) ...
          done();
        }).catch(done);
      },
      function(done) {
        if (apispec) return done();

        apispec = {
          executables: {},
          implementation: {
            title: context.artifactName,
            description: artifact.properties.description || artifact.description
          }
        };

        if (context.wrapType === 'soap') {
          apispec.implementation.wsdl_ns = 'http://toscafy.github.io/generated/' + shortid.generate();
        }

        apispec.executables[context.artifactName] = artifactSpec;
        apispec.executables[context.artifactName].path = '.';

        done();
      },
      function(done) {
        fs.writeFile(apispecFile, JSON.stringify(apispec, null, 2), done);
      },
      function(done) {
        exec(baseCommand + '-i ' + context.wrapType + ' -c -o ' + generatedApiTemp + ' gen ' + apispecDir, (err, stdout, stderr) => {
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
            contextFile: generatedApiArchiveName,
            //envFileContent: 'VAR1=val1\nVAR2=val2',
            serviceName: context.artifactName.toLowerCase(),
            containerPort: '3000',
            endpointPath: '/',
            endpointKind: context.wrapType
          },
          references: [
            generatedApiArchiveName
          ]
        };

        if (context.wrapType === 'soap') {
          wrappedArtifact.properties.soapPortType = '{' + apispec.implementation.wsdl_ns + '}' + _.upperFirst(_.camelCase(context.artifactName)) + 'PortType';
        }

        done();
      }
    ], (err) => {
      async.series([
        async.apply(fs.remove, generatedApiTemp),
        async.apply(fs.remove, artifactFilesTemp)
      ], (err2) => {
        if (err2) console.error(err2);

        done(err, wrappedArtifact);
      });
    });
  };

  obj.wrap = wrap;

  obj.isValidWrap = isValidWrap;

  return obj;
};
