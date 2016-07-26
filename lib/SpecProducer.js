'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const async = require('async');
const _ = require('lodash');
const archiver = require('archiver');
const shortid = require('shortid');

let specifyArtifact;



const getArtifactType = (input, context) => {
  const normalizedInput = _.toLower(_.trim(input));

  if (context.artifactType) return context.artifactType;
  else if (_.startsWith(normalizedInput, 'chef')) return 'chef';
  else if (_.startsWith(normalizedInput, 'docker')) return 'docker';
  else return null;
};



module.exports = () => {
  const obj = {};

  const produce = (input, context, done) => {
    if (!specifyArtifact) {
      try {
        specifyArtifact = require('specify-artifact');
      } catch (err) {
        try {
          specifyArtifact = require(process.env.SPECIFY_ARTIFACT_MODULE);
        } catch (err) {
          return done(err);
        }
      }
    }

    let result;
    let csarSpec;
    const artifactType = getArtifactType(input, context);
    const artifactSpecFile = path.join(os.tmpdir(), 'toscafy-artifact-spec-' + shortid.generate() + '.json');

    if (_.isEmpty(artifactType)) {
      return done(new Error('cannot determine artifact type'));
    } else if (!specifyArtifact[artifactType]) {
      return done(new Error('invalid artifact type: ' + artifactType));
    }

    async.series([
      function(done) {
        specifyArtifact[artifactType].specify(input, context, (err, res) => {
          result = res;

          done(err);
        });
      },
      function(done) {
        specifyArtifact[artifactType].fetchDependencies(result, (err, res) => {
          result = res;

          done(err);
        });
      },
      function(done) {
        fs.writeFile(artifactSpecFile, JSON.stringify(result.spec, null, 2), done);
      },
      function(done) {
        done = _.once(done);

        const nodeTypeName = _.upperFirst(_.camelCase(result.spec.name || shortid.generate()));

        csarSpec = { csar_name: nodeTypeName + 'CSAR', node_types: {} };
        csarSpec.node_types[nodeTypeName] = {
          properties_schema: {},
          operations: { install: [] }
        }

        const ia = {
          type: artifactType,
          properties: {
            description: result.spec.description,
            readme: result.spec.readme,
            dockerImage: result.spec.docker_image,
            mapping: []
          },
          references: [ { '$toscafy.addFile': artifactSpecFile, filename: path.join(nodeTypeName, 'artifact-spec.json') } ]
        }

        csarSpec.node_types[nodeTypeName].operations.install.push(ia);

        _.forEach(result.spec.parameters_schema, (prop, propName) => {
          const propNameCamel = _.camelCase(propName);

          csarSpec.node_types[nodeTypeName].properties_schema[propNameCamel] = {
            type: prop.type,
            'default': prop.default
          };

          ia.properties.mapping.push({
            property: propNameCamel,
            to: prop.mapping,
            name: propName
          });
        });

        if (result.type === 'file') {
          ia.references.push({ '$toscafy.addFile': result.path, filename: path.join(nodeTypeName, path.basename(result.path)) });

          done();
        } else if (result.type === 'dir') {
          const archiveFile = path.join(os.tmpdir(), 'toscafy-artifact-files-' + shortid.generate() + '.tar.gz');

          ia.references.push({ '$toscafy.addFile': archiveFile, filename: path.join(nodeTypeName, 'artifact-files.tar.gz') });

          const outputStream = fs.createWriteStream(archiveFile);

          const archive = archiver('tar', {
            gzip: true,
            gzipOptions: { level: 1 }
          });

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
            root: result.path,
            cwd: result.path
          }).finalize();
        } else {
          done();
        }
      },
      function(done) {
        let exclude;

        if (result.type === 'file') exclude = result.path;

        result.cleanup(exclude, done);
      }
    ], (err) => {
      done(err, csarSpec);
    });
  };

  obj.produce = produce;

  return obj;
};
