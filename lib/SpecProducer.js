'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const async = require('async');
const _ = require('lodash');
const archiver = require('archiver');
const shortid = require('shortid');

const wrapper = require('./Wrapper')();

const tempDir = process.env.TOSCAFY_TEMP_DIR || os.tmpdir();

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
          return done(new Error('cannot load specify-artifact module'));
        }
      }
    }

    context = context || {};

    let result = {};
    let csarspec;
    const artifactType = getArtifactType(input, context);
    const artifactSpecFile = path.join(tempDir, 'toscafy-artifact-spec-' + shortid.generate() + '.json');

    if (_.isEmpty(artifactType)) {
      return done(new Error('cannot determine artifact type'));
    } else if (!specifyArtifact[artifactType]) {
      return done(new Error('invalid artifact type: ' + artifactType));
    } else if (!_.isEmpty(context.wrap) && !wrapper.isValidWrap(context.wrap)) {
      return done(new Error('invalid wrap type: ' + context.wrap));
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

        const nodeTypeName = _.camelCase(result.spec.name || shortid.generate());

        csarspec = {
          csar_name: nodeTypeName + '_CSAR',
          node_types: {},
          topology: { name: nodeTypeName + '_Topology', nodes: {} }
        };

        csarspec.topology.nodes[nodeTypeName + '_Node'] = {
          type: nodeTypeName
        };

        csarspec.node_types[nodeTypeName] = {
          properties_schema: {},
          operations: { install: [] }
        }

        const ia = {
          type: artifactType,
          wrap: context.wrap,
          properties: {
            description: result.spec.description,
            readme: result.spec.readme,
            dockerImage: result.spec.docker_image,
            mapping: []
          },
          references: [ { '$toscafy.addFile': artifactSpecFile, filename: path.join(nodeTypeName, 'artifact-spec.json') } ]
        }

        csarspec.node_types[nodeTypeName].operations.install.push(ia);

        _.forEach(result.spec.parameters_schema, (prop, propName) => {
          const propNameCamel = _.camelCase(propName);

          csarspec.node_types[nodeTypeName].properties_schema[propNameCamel] = {
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
          const archiveFile = path.join(tempDir, 'toscafy-artifact-files-' + shortid.generate() + '.tar.gz');

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

        if (result.cleanup) result.cleanup(exclude, done);
        else done();
      }
    ], (err) => {
      done(err, csarspec);
    });
  };

  obj.produce = produce;

  return obj;
};
