'use strict';

const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const url = require('url');
const _ = require('lodash');
const async = require('async');
const glob = require('glob');
const shortid = require('shortid');
const got = require('got');
const ignore = require('ignore');
const archiver = require('archiver');
const getStream = require('get-stream');
const data2xml = require('data2xml')({ xmlDecl : false });

const wrapper = require('./Wrapper')();

const tempDir = process.env.TOSCAFY_TEMP_DIR || os.tmpdir();

const definitionsTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'definitions.tosca.tpl')).toString();
const propertiesTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'properties.xsd.tpl')).toString();
const metaTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'TOSCA.meta.tpl')).toString();



const builtinFunctionNames = [
  '$toscafy.addFile',
  '$toscafy.addDir',
  '$toscafy.addDirAsZip',
  '$toscafy.addDirAsTgz',
  '$toscafy.fetchAsFile',
  '$toscafy.fetchAsText',
  '$toscafy.fetchAsJson',
  '$toscafy.fetchAsBase64',
  '$toscafy.embedFileAsText',
  '$toscafy.embedFileAsJson',
  '$toscafy.embedFileAsBase64',
  '$toscafy.embedDirAsZipBase64',
  '$toscafy.embedDirAsTgzBase64'
];

const builtinArtifactTypes = {
  script: { name: 'ScriptArtifact', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' },
  archive: { name: 'ArchiveArtifact', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' },
  war: { name: 'WAR', namespace: 'http://www.example.com/ToscaTypes', propWrap: 'WSProperties' },
  ansible: { name: 'Ansible', namespace: 'http://opentosca.org/artifacttypes' },
  chef: { name: 'Chef', namespace: 'http://opentosca.org/artifacttypes' },
  docker: { name: 'DockerArtifact', namespace: 'http://toscafy.github.io/artifacttypes' },
  compose: { name: 'DockerComposeArtifact', namespace: 'http://toscafy.github.io/artifacttypes' },
  any2api: { name: 'any2api', namespace: 'http://toscafy.github.io/artifacttypes' },
  devopsbase: { name: 'DevOpsBaseExport', namespace: 'http://toscafy.github.io/artifacttypes' }
};
builtinArtifactTypes.zip = builtinArtifactTypes.archive;

const builtinRelationshipTypes = {
  host: { name: 'HostedOn', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' },
  connect: { name: 'ConnectsTo', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' },
  depend: { name: 'DependsOn', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' }
};
builtinRelationshipTypes.peer = builtinRelationshipTypes.connect;

const builtinXsdTypes = {
  anytype: 'anyType',
  json: 'string',
  uri: 'anyURI',
  url: 'anyURI',
  base64: 'base64Binary',
  bin: 'base64Binary',
  bool: 'boolean',
  'byte': 'byte',
  date: 'date',
  dateTime: 'dateTime',
  decimal: 'decimal',
  num: 'decimal',
  'double': 'double',
  duration: 'duration',
  entities: 'ENTITIES',
  entity: 'ENTITY',
  'float': 'float',
  day: 'gDay',
  month: 'gMonth',
  monthday: 'gMonthDay',
  year: 'gYear',
  yearmonth: 'gYearMonth',
  hex: 'hexBinary',
  id: 'ID',
  idref: 'IDREF',
  idrefs: 'IDREFS',
  'int': 'int',
  integer: 'integer',
  lang: 'language',
  'long': 'long',
  name: 'Name',
  ncname: 'NCName',
  negativeinteger: 'negativeInteger',
  nmtoken: 'NMTOKEN',
  nmtokens: 'NMTOKENS',
  nonnegativeinteger: 'nonNegativeInteger',
  nonpositiveinteger: 'nonPositiveInteger',
  normalizedstring: 'normalizedString',
  notation: 'NOTATION',
  positiveinteger: 'positiveInteger',
  qname: 'QName',
  'short': 'short',
  str: 'string',
  time: 'time',
  token: 'token',
  unsignedbyte: 'unsignedByte',
  unsignedint: 'unsignedInt',
  unsignedlong: 'unsignedLong',
  unsignedshort: 'unsignedShort'
};

const getArtifactType = (candidate) => {
  candidate = _.toLower(_.camelCase(candidate));

  let type;

  _.forEach(builtinArtifactTypes, (t, tMatch) => {
    if (_.includes(candidate, tMatch)) type = t;
  });

  return type;
};

const getRelationshipType = (candidate) => {
  candidate = _.toLower(_.camelCase(candidate));

  let type;

  _.forEach(builtinRelationshipTypes, (t, tMatch) => {
    if (_.includes(candidate, tMatch)) type = t;
  });

  return type;
};

const getXsdType = (candidate) => {
  candidate = _.toLower(_.camelCase(candidate));

  let type;

  _.forEach(builtinXsdTypes, (t, tMatch) => {
    if (_.startsWith(candidate, tMatch)) type = 'xsd:' + t;
  });

  return type;
};

const prettify = (xml) => {
  //TODO find better prettify module, pretty-data?
  return _.remove(xml.split('\n'), (line) => {
    return _.trim(line) !== '';
  }).join('\n') + '\n';
};

const resolveReferences = (collection) => {
  // if given collection does not represent an artifact
  if (!_.isString(collection.type) || !_.isArray(collection.references)) return;

  _.forEach(collection.references, (ref, idx) => {
    if (!_.isString(ref)) return;
    else if (url.parse(ref).protocol) return; // skip http-based and similar URLs

    // remove '..' from path
    let target = ref.replace(/\.\.\//g, '').replace(/\.\./g, '');
    if (target === '') target = '.';

    if (_.endsWith(ref, '/')) {
      collection.references[idx] = {
        '$toscafy.addDir': ref,
        dirname: target
      };
    } else {
      collection.references[idx] = {
        '$toscafy.addFile': ref,
        filename: target
      };
    }
  });

  return collection;
};

const runBuiltinFunctions = (collection, context, baseDir, done) => {
  try {
    resolveReferences(collection, context, baseDir);
  } catch (err) {
    return done(err);
  }

  async.eachSeries(_.keys(collection), function(key, done) {
    const val = collection[key];

    done = _.once(done);

    if (_.isArray(val)) return runBuiltinFunctions(val, context, baseDir, done);

    if (!_.isPlainObject(val)) return done();

    const funcName = _.reduce(val, function(result, innerVal, innerKey) {
      if (_.startsWith(innerKey, '$toscafy.') && !_.includes(builtinFunctionNames, innerKey)) {
        done(new Error('invalid built-in function: ' + innerKey));
      } else if (_.includes(builtinFunctionNames, innerKey) && !_.isEmpty(result)) {
        done(new Error('two built-in functions in single object: ' + result + ', ' + innerKey));
      } else if (_.includes(builtinFunctionNames, innerKey)) {
        result = innerKey;
      }

      return result;
    }, null);

    if (_.isEmpty(funcName) && _.isPlainObject(val)) return runBuiltinFunctions(val, context, baseDir, done);

    if (_.includes(['$toscafy.addFile', '$toscafy.addDir'], funcName)) {
      const source = val['$toscafy.addFile'] || val['$toscafy.addDir'];
      const sourcePath = path.resolve(baseDir, source);

      if (funcName === '$toscafy.addFile' && !_.isString(val.filename)) {
        return done(new Error('property \'filename\' missing for $toscafy.addFile: ' + sourcePath));
      } else if (funcName === '$toscafy.addDir' && !_.isString(val.dirname)) {
        return done(new Error('property \'dirname\' missing for $toscafy.addDir: ' + sourcePath));
      }

      collection[key] = val.filename || val.dirname;

      const outputPath = path.join(context.outputDir, val.filename || val.dirname);

      fs.ensureDir(path.dirname(outputPath), (err) => {
        if (err) return done(err);

        fs.copy(sourcePath, outputPath, { clobber: true, dereference: true }, done);
      });
    } else if (funcName === '$toscafy.fetchAsFile') {
      const url = val['$toscafy.fetchAsFile'];

      if (!_.isString(val.filename)) {
        return done(new Error('property \'filename\' missing for $toscafy.fetchAsFile: ' + url));
      }

      collection[key] = val.filename;

      const filePath = path.join(context.outputDir, val.filename);

      fs.ensureDir(path.dirname(filePath), (err) => {
        if (err) return done(err);

        got.stream(url).on('error', (err) => {
          done(new Error('fetch failed: ' + url + '; ' + err));
        }).pipe(fs.createWriteStream(filePath)).on('error', (err) => {
          done(new Error('fetch failed: ' + url + '; ' + err));
        }).on('finish', done);
      });
    } else if (_.includes(['$toscafy.fetchAsText', '$toscafy.fetchAsJson', '$toscafy.fetchAsBase64'], funcName)) {
      const url = val['$toscafy.fetchAsText'] || val['$toscafy.fetchAsJson'] || val['$toscafy.fetchAsBase64'];

      got(url, { encoding: null }).then(response => {
        if (funcName === '$toscafy.fetchAsText') {
          collection[key] = response.body.toString('utf8');
        } else if (funcName === '$toscafy.fetchAsJson') {
          try {
            collection[key] = JSON.parse(response.body.toString('utf8'));

            if (_.isString(val.part)) collection[key] = _.get(collection[key], val.part, null);

            if (_.isPlainObject(collection[key]) || _.isArray(collection[key])) {
              return runBuiltinFunctions(collection[key], context, baseDir, (err) => {
                if (err) return done(err);

                if (val.stringify === true) collection[key] = JSON.stringify(collection[key]);

                done();
              });
            }
          } catch (err) {
            return done(new Error('fetch failed: ' + url + '; cannot parse JSON: ' + err));
          }
        } else if (funcName === '$toscafy.fetchAsBase64') {
          collection[key] = response.body.toString('base64');
        }

        done();
      }).catch(err => {
        done(new Error('fetch failed: ' + url + '; response status code ' + err.statusCode + '; ' + err));
      });
    } else if (_.includes(['$toscafy.embedFileAsText', '$toscafy.embedFileAsJson', '$toscafy.embedFileAsBase64'], funcName)) {
      const file = val['$toscafy.embedFileAsText'] || val['$toscafy.embedFileAsJson'] || val['$toscafy.embedFileAsBase64'];
      const filePath = path.resolve(baseDir, file);

      fs.readFile(filePath, (err, content) => {
        if (err) return done(new Error('embedding file failed: ' + filePath + '; ' + err));

        if (funcName === '$toscafy.embedFileAsText') {
          collection[key] = content.toString('utf8');
        } else if (funcName === '$toscafy.embedFileAsJson') {
          try {
            collection[key] = JSON.parse(content.toString('utf8'));

            if (_.isString(val.part)) collection[key] = _.get(collection[key], val.part, null);

            if (_.isPlainObject(collection[key]) || _.isArray(collection[key])) {
              return runBuiltinFunctions(collection[key], context, path.dirname(filePath), (err) => {
                if (err) return done(err);

                if (val.stringify === true) collection[key] = JSON.stringify(collection[key]);

                done();
              });
            }
          } catch (err) {
            return done(new Error('embedding file failed: ' + filePath + '; cannot parse JSON: ' + err));
          }
        } else if (funcName === '$toscafy.embedFileAsBase64') {
          collection[key] = content.toString('base64');
        }

        done();
      });
    } else if (_.includes(['$toscafy.embedDirAsZipBase64', '$toscafy.embedDirAsTgzBase64'], funcName)) {
      const dir = val['$toscafy.embedDirAsZipBase64'] || val['$toscafy.embedDirAsTgzBase64'];
      const dirPath = path.resolve(baseDir, dir);

      let format = 'zip';
      let options;

      if (funcName === '$toscafy.embedDirAsTgzBase64') {
        format = 'tar';

        options = {
          gzip: true,
          gzipOptions: {
            level: 1
          }
        }
      }

      const archive = archiver(format, options);

      archive.glob('**', {
        nodir: true,
        dot: true,
        root: dirPath,
        cwd: dirPath
      }).finalize();

      getStream.buffer(archive).then(buf => {
        collection[key] = buf.toString('base64');

        done();
      }).catch(done);
    } else if (_.includes(['$toscafy.addDirAsZip', '$toscafy.addDirAsTgz'], funcName)) {
      const dir = val['$toscafy.addDirAsZip'] || val['$toscafy.addDirAsTgz'];
      const dirPath = path.resolve(baseDir, dir);

      let format = 'zip';
      let options;

      if (funcName === '$toscafy.addDirAsTgz') {
        format = 'tar';

        options = {
          gzip: true,
          gzipOptions: {
            level: 1
          }
        }
      }

      if (!_.isString(val.filename)) {
        return done(new Error('property \'filename\' missing for ' + funcName + ': ' + dir));
      }

      collection[key] = val.filename;

      const filePath = path.join(context.outputDir, val.filename);

      fs.ensureDir(path.dirname(filePath), (err) => {
        if (err) return done(err);

        done = _.once(done);

        const archive = archiver(format, options);

        const outputStream = fs.createWriteStream(filePath);

        outputStream.on('close', () => {
          done();
        });

        archive.on('error', (err) => {
          done(err);
        });

        archive.pipe(outputStream);

        archive.glob('**', {
          nodir: true,
          dot: true,
          root: dirPath,
          cwd: dirPath
        }).finalize();
      });
    } else {
      done();
    }
  }, done);
};



module.exports = () => {
  const obj = {};

  const generate = (csarspec, context, done) => {
    let csarspecOutput;

    if (_.isEmpty(csarspec)) return done(new Error('CSAR spec missing'));
    else if (_.isEmpty(context)) return done(new Error('context missing'));

    if (_.isEmpty(context.workingDir)) {
      context.workingDir = path.join(tempDir, 'toscafy-workingdir-' + shortid.generate());
      context.workingDirCreated = true;
    }

    context.workingDir = path.resolve(context.workingDir);
    context.outputDir = context.outputDir || path.join(tempDir, 'toscafy-csar-' + shortid.generate());
    context.outputDir = path.resolve(context.outputDir);

    if (_.startsWith(context.outputDir + path.sep, context.workingDir + path.sep)) return done(new Error('working directory must be different from output directory'));

    if (!_.isBoolean(context.camelize)) context.camelize = false;

    if (!_.isBoolean(context.refsOnly)) context.refsOnly = false;

    try {
      if (_.isString(csarspec) && _.isPlainObject(context.variables)) {
        csarspec = JSON.parse(_.template(csarspec)({
          variables: variables,
          vars: variables
        }));
      } else if (_.isString(csarspec)) {
        csarspec = JSON.parse(csarspec);
      }
    } catch (err) {
      return done(err);
    }

    async.series([
      function(done) {
        if (context.workingDirCreated) return fs.ensureDir(context.workingDir, done);

        fs.access(context.workingDir, fs.R_OK, (err) => {
          if (err) done(new Error('cannot read working directory'));
          else done();
        });
      },
      function(done) {
        fs.access(context.outputDir, fs.R_OK, (err) => {
          if (err) {
            context.outputDirCreated = true;

            fs.ensureDir(context.outputDir, done);
          } else {
            done();
          }
        });
      },
      function(done) {
        fs.access(context.outputDir, fs.R_OK | fs.W_OK, (err) => {
          if (err) done(new Error('cannot read/write output directory'));
          else done();
        });
      },
      function(done) {
        runBuiltinFunctions(csarspec, context, context.workingDir, done);
      },
      function(done) {
        context.files = [];
        context.filesLow = [];
        context.filesAbs = [];

        let workingDirFiles;
        let workingDirFilesAbs;

        async.series([
          function(done) {
            if (context.refsOnly) return done();

            glob('**', {
              mark: true, // add '/' character to directory matches
              //nodir: true,
              dot: true,
              root: context.workingDir,
              cwd: context.workingDir
            }, (err, files) => {
              if (err) return done(err);

              workingDirFiles = files;

              workingDirFilesAbs = _.map(workingDirFiles, (file) => {
                return path.join(context.workingDir, file);
              });

              const csarIgnore = path.join(context.workingDir, '.csarignore');

              if (_.includes(workingDirFilesAbs, csarIgnore)) {
                workingDirFiles = ignore().add(fs.readFileSync(csarIgnore).toString()).filter(workingDirFiles);
              }

              done();
            });
          },
          function(done) {
            glob('**', {
              mark: true,
              //nodir: true,
              dot: true,
              root: context.outputDir,
              cwd: context.outputDir
            }, (err, outputDirFiles) => {
              if (err) return done(err);

              const outputDirFilesAbs = _.map(outputDirFiles, (file) => {
                return path.join(context.outputDir, file);
              });

              if (workingDirFiles) context.files = _.uniq(workingDirFiles.concat(outputDirFiles));
              else context.files = outputDirFiles;

              context.filesLow = _.map(context.files, (file) => { return file.toLowerCase() });

              if (workingDirFilesAbs) context.filesAbs = workingDirFilesAbs.concat(outputDirFilesAbs);
              else context.filesAbs = outputDirFilesAbs;

              if (_.includes(context.filesLow, path.join('tosca-metadata', 'tosca.meta'))) {
                return done(new Error(`TOSCA-Metadata/TOSCA.meta is a reserved filename and must not exist in working or output directory`));
              }

              done();
            });
          }
        ], done);
      },
      function(done) {
        csarspec.csar_name = csarspec.csar_name || csarspec.name || shortid.generate();
        csarspec.csar_namespace = csarspec.csar_namespace || csarspec.namespace || 'http://toscafy.github.io/generated/' + csarspec.csar_name;

        csarspec.name = csarspec.csar_name;
        csarspec.namespace = csarspec.csar_namespace;
        csarspec.artifacts = csarspec.artifacts || {};

        csarspecOutput = JSON.stringify(csarspec, null, 2);

        if (_.isArray(csarspec.artifact_types_xml)) csarspec.artifact_types_xml = csarspec.artifact_types_xml.join('\n');
        if (_.isArray(csarspec.relationship_types_xml)) csarspec.relationship_types_xml = csarspec.relationship_types_xml.join('\n');
        if (_.isArray(csarspec.xsd_types_xml)) csarspec.xsd_types_xml = csarspec.xsd_types_xml.join('\n');

        // split bundled operations
        _.forEach(csarspec.node_types, (nt, ntName) => {
          if (!_.isPlainObject(nt)) return;

          _.forEach(nt.operations, (op, opName) => {
            const parts = opName.split(',');

            if (_.size(parts) === 1) return;

            delete nt.operations[opName];

            _.forEach(parts, (opName) => {
              nt.operations[_.trim(opName)] = op;
            });
          });
        });

        // if single topology is given, put it in normal structure
        if (_.isPlainObject(csarspec.topology) && !csarspec.topologies) {
          csarspec.topologies = {};
          csarspec.topologies[csarspec.topology.topology_name || csarspec.topology.name || csarspec.csar_name + '_Topology' ] = csarspec.topology;
        }

        // validation of CSAR spec
        try {
          // null checks
          _.forEach(csarspec.node_types, (nt, ntName) => {
            if (!_.isPlainObject(nt)) throw new Error(`node type '${ntName}' must be an object`);

            _.forEach(nt.properties_schema, (p, pName) => {
              if (!_.isPlainObject(p)) throw new Error(`property definition '${pName}' must be an object`);
            });
          });

          _.forEach(csarspec.artifacts, (a, aName) => {
            if (!_.isPlainObject(a)) throw new Error(`artifact '${aName}' must be an object`);
          });

          _.forEach(csarspec.topologies, (top, topName) => {
            if (!_.isPlainObject(top)) throw new Error(`topology '${topName}' must be an object`);

            _.forEach(top.nodes, (n, nName) => {
              if (!_.isPlainObject(n)) throw new Error(`topology node '${nName}' must be an object`);
            });

            _.forEach(top.relationships, (r, rName) => {
              if (!_.isPlainObject(r)) throw new Error(`topology relationship '${rName}' must be an object`);
            });
          });

          // check if properties schema types are valid
          _.forEach(csarspec.node_types, (nt, ntName) => {
            _.forEach(nt.properties_schema, (p, pName) => {
              if (_.isEmpty(p.type) || p.type === 'unknown') p.type = 'xsd:anyType';

              let t = p.type;

              if (!_.includes(p.type, ':')) t = getXsdType(p.type) || 'csar:' + p.type;

              p.type = t;

              // map properties to input params
              if (!p.input && _.isEmpty(p.output)) p.input = _.keys(nt.operations);
              else if (_.isString(p.input)) p.input = [ p.input ];
              else if (p.input === true) p.input = [ '*' ];
              else if (p.input === false) p.input = [];

              if (_.includes(p.input, '*')) p.input = _.keys(nt.operations);

              _.forEach(p.input, (opRef) => {
                if (!nt.operations[opRef]) throw new Error(`input parameter mapping of '${pName}' property: operation '${opRef}' of node type '${ntName}' does not exist`);
              });

              nt.has_input_parameters = nt.has_input_parameters || [];
              nt.has_input_parameters = _.uniq(_.compact(_.concat(nt.has_input_parameters, p.input)));

              // map properties to output params
              if (_.isString(p.output)) p.output = [ p.output ];
              else if (p.output === true) p.output = [ '*' ];
              else if (p.output === false) p.output = [];

              if (_.includes(p.output, '*')) p.output = _.keys(nt.operations);

              _.forEach(p.output, (opRef) => {
                if (!nt.operations[opRef]) throw new Error(`output parameter mapping of '${pName}' property: operation '${opRef}' of node type '${ntName}' does not exist`);
              });

              nt.has_output_parameters = nt.has_output_parameters || [];
              nt.has_output_parameters = _.uniq(_.compact(_.concat(nt.has_output_parameters, p.output)));
            });
          });

          // check if referred artifacts are valid; move embedded artifacts to artifacts section
          _.forEach(csarspec.node_types, (nt, ntName) => {
            _.forEach(nt.operations, (op, opName) => {
              if (_.isString(op) || _.isPlainObject(op)) op = [ op ];

              nt.operations[opName] = op;

              _.forEach(op, (ia, iaPosition) => {
                nt.has_implementation_artifacts = true;

                if (_.isPlainObject(ia)) {
                  ia.artifact_name = ia.artifact_name || ia.name;
                  let iaName = ia.artifact_name || `${ntName}-${opName}`;
                  if (csarspec.artifacts[iaName] && !ia.artifact_name) iaName = `${ntName}-${opName}-${shortid.generate()}`;

                  csarspec.artifacts[iaName] = ia;
                  op[iaPosition] = iaName;
                } else if (!csarspec.artifacts[ia]) {
                  throw new Error(`implementation artifact '${ia}' of node type '${ntName}' is not specified`);
                }
              });
            });

            if (_.isString(nt.deployment_artifacts) || _.isPlainObject(nt.deployment_artifacts)) {
              nt.deployment_artifacts = [ nt.deployment_artifacts ];
            } else if (_.isString(nt.deployment_artifact) || _.isPlainObject(nt.deployment_artifact)) {
              nt.deployment_artifacts = [ nt.deployment_artifact ];
            }

            _.forEach(nt.deployment_artifacts, (da, daPosition) => {
              if (_.isPlainObject(da)) {
                da.artifact_name = da.artifact_name || da.name;
                let daName = da.artifact_name || `${ntName}-da`;
                if (csarspec.artifacts[daName] && !da.artifact_name) daName = `${ntName}-da-${shortid.generate()}`;

                csarspec.artifacts[daName] = da;
                nt.deployment_artifacts[daPosition] = daName;
              } else if (!csarspec.artifacts[da]) {
                throw new Error(`deployment artifact '${da}' of node type '${ntName}' is not specified`);
              }
            });
          });

          _.forEach(csarspec.topologies, (top, topName) => {
            _.forEach(top.nodes, (n, nName) => {
              if (_.isString(n.deployment_artifacts) || _.isPlainObject(n.deployment_artifacts)) {
                n.deployment_artifacts = [ n.deployment_artifacts ];
              } else if (_.isString(n.deployment_artifact) || _.isPlainObject(n.deployment_artifact)) {
                n.deployment_artifacts = [ n.deployment_artifact ];
              }

              _.forEach(n.deployment_artifacts, (da, daPosition) => {
                if (_.isPlainObject(da)) {
                  da.artifact_name = da.artifact_name || da.name;
                  let daName = da.artifact_name || `${topName}-${nName}`;
                  if (csarspec.artifacts[daName] && !da.artifact_name) daName = `${topName}-${nName}-${shortid.generate()}`;

                  csarspec.artifacts[daName] = da;
                  n.deployment_artifacts[daPosition] = daName;
                } else if (!csarspec.artifacts[da]) {
                  throw new Error(`deployment artifact '${da}' of node '${nName}' of topology '${topName}' is not specified`);
                }
              });
            });
          });

          // check if artifact types are valid
          _.forEach(csarspec.artifacts, (a, aName) => {
            if (!a.type) throw new Error(`type of artifact '${aName}' is not specified`);

            if (a.type && a.namespace) return; // if custom namespace is specified, assume it is correct

            const t = getArtifactType(a.type);

            if (!t) throw new Error(`type '${a.type}' of artifact '${aName}' is invalid`);

            a.type = t.name;
            a.namespace = t.namespace;
          });

          // check if artifact references are valid
          _.forEach(csarspec.artifacts, (a, aName) => {
            _.forEach(a.references, (ref) => {
              if (!_.isString(ref)) throw new Error(`non-string reference '${ref}' of artifact '${aName}' not supported`);
            });
          });

          _.forEach(csarspec.topologies, (top, topName) => {
            top.relationships = top.relationships || {};

            _.forEach(top.nodes, (n, nName) => {
              // check if node types of topology nodes are valid
              if (!n.type) throw new Error(`type of node '${nName}' of topology '${topName}' is not specified`);

              if (!csarspec.node_types[n.type]) throw new Error(`type '${n.type}' of node '${nName}' of topology '${topName}' is invalid`);

              // move relationships
              _.forEach(n.relationships, (r) => {
                if (_.isString(r)) r = { target: r };

                r.source = nName;
                r.type = r.type || 'DependsOn';

                top.relationships[r.source + '-' + r.type.toLowerCase() + '-' + r.target] = r;
              });
              delete n.relationships;
            });

            // check if types of topology relations are valid
            _.forEach(top.relationships, (r, rName) => {
              if (!r.type) throw new Error(`type of relationship '${rName}' of topology '${topName}' is not specified`);

              if (r.type && r.namespace) return; // if custom namespace is specified, assume it is correct

              const t = getRelationshipType(r.type);

              if (!t) throw new Error(`type '${r.type}' of relationship '${rName}' of topology '${topName}' is invalid`);

              r.type = t.name;
              r.namespace = t.namespace;
            });

            // check if source and target of topology relations are valid
            top.nodes = top.nodes || {};

            _.forEach(top.relationships, (r, rName) => {
              if (!r.source || !top.nodes[r.source]) {
                throw new Error(`source of relationship '${rName}' of topology '${topName}' is not specified or invalid`);
              } else if (!r.target || !top.nodes[r.target]) {
                throw new Error(`target of relationship '${rName}' of topology '${topName}' is not specified or invalid`);
              }
            });
          });
        } catch (err) {
          // validation error occurred
          return done(err);
        }

        // normalize description/documentation properties
        csarspec.doc = csarspec.csar_description || csarspec.description || csarspec.documentation || csarspec.doc;
        if (_.isArray(csarspec.doc)) csarspec.doc = csarspec.doc.join('\n');

        _.forEach(csarspec.node_types, (nt, ntName) => {
          nt.doc = nt.description || nt.documentation || nt.doc;
          if (_.isArray(nt.doc)) nt.doc = nt.doc.join('\n');

          _.forEach(nt.properties_schema, (p, pName) => {
            p.doc = p.description || p.documentation || p.doc;
            if (_.isArray(p.doc)) p.doc = p.doc.join('\n');
          });
        });

        _.forEach(csarspec.artifacts, (art, artName) => {
          art.doc = art.description || art.documentation || art.doc;
          if (_.isArray(art.doc)) art.doc = art.doc.join('\n');
        });

        _.forEach(csarspec.topologies, (top, topName) => {
          top.doc = top.description || top.documentation || top.doc;
          if (_.isArray(top.doc)) top.doc = top.doc.join('\n');
        });

        // propagate namespaces
        _.forEach(csarspec.node_types, (nt, ntName) => {
          nt.namespace = nt.namespace || nt.node_type_namespace || csarspec.csar_namespace;
        });

        _.forEach(csarspec.topologies, (top, topName) => {
          top.namespace = top.namespace || top.topology_namespace || csarspec.csar_namespace;
        });

        // propagate default values of node type properties schema to topology nodes
        _.forEach(csarspec.topologies, (top, topName) => {
          _.forEach(top.nodes, (n, nName) => {
            n.properties = n.properties || {};

            _.forEach(_.get(csarspec, `node_types['${n.type}'].properties_schema`), (p, pName) => {
              if (!n.properties[pName] && p.default) n.properties[pName] = p.default;
            });
          });
        });

        // convert names to camelCase
        if (context.camelize) {
          // convert all node type names to camelCase
          const nodeTypes = {};

          _.forEach(csarspec.node_types, (nt, ntName) => {
            let newName = _.upperFirst(_.camelCase(ntName));

            if (nodeTypes[newName]) newName = _.upperFirst(_.camelCase(ntName + '_' + shortid.generate()));

            nodeTypes[newName] = nt;

            _.forEach(csarspec.topologies, (top, topName) => {
              _.forEach(top.nodes, (n, nName) => {
                if (n.type === ntName) n.type = newName;
              });
            });
          });

          csarspec.node_types = nodeTypes;

          // convert all artifact names to camelCase
          const artifacts = {};

          _.forEach(csarspec.artifacts, (a, aName) => {
            let newName = _.camelCase(aName);

            if (artifacts[newName]) newName = _.camelCase(aName + '_' + shortid.generate());

            artifacts[newName] = a;

            _.forEach(csarspec.node_types, (nt, ntName) => {
              _.forEach(nt.operations, (op, opName) => {
                nt.operations[opName] = _.uniq(_.map(op, (ref) => {
                  if (ref === aName) return newName;
                  else return ref;
                }));
              });

              if (nt.deployment_artifacts) nt.deployment_artifacts = _.uniq(_.map(nt.deployment_artifacts, (ref) => {
                if (ref === aName) return newName;
                else return ref;
              }));
            });

            _.forEach(csarspec.topologies, (top, topName) => {
              _.forEach(top.nodes, (n, nName) => {
                if (n.deployment_artifacts) n.deployment_artifacts = _.uniq(_.map(n.deployment_artifacts, (ref) => {
                  if (ref === aName) return newName;
                  else return ref;
                }));
              });
            });
          });

          csarspec.artifacts = artifacts;

          // convert all topology names to camelCase
          const topologies = {};

          _.forEach(csarspec.topologies, (top, topName) => {
            let newName = _.camelCase(topName);

            if (topologies[newName]) newName = _.camelCase(topName + '_' + shortid.generate());

            topologies[newName] = top;
          });

          csarspec.topologies = topologies;

          // convert all topology node names to camelCase
          _.forEach(csarspec.topologies, (top, topName) => {
            const nodes = {};

            _.forEach(top.nodes, (n, nName) => {
              let newName = _.camelCase(nName);

              if (nodes[newName]) newName = _.camelCase(nName + '_' + shortid.generate());

              nodes[newName] = n;

              _.forEach(top.relationships, (r, rName) => {
                if (r.source === nName) r.source = newName;
                if (r.target === nName) r.target = newName;
              });
            });

            top.nodes = nodes;
          });

          // convert all topology relationship names to camelCase
          const relationships = {};

          _.forEach(csarspec.topologies, (top, topName) => {
            _.forEach(top.relationships, (r, rName) => {
              let newName = _.camelCase(rName);

              if (relationships[newName]) newName = _.camelCase(rName + '_' + shortid.generate());

              relationships[newName] = r;
            });

            top.relationships = relationships;
          });
        }

        // enrich interface and operations definitions of node types
        // * "interfaces"
        //   * <name>
        //     * "implementation_artifacts": [ <artifactName> ] (implement all ops)
        //     * "operations"
        //       * <name>
        //         * "implementation_artifacts": [ <artifactName> ]
        // * "deployment_artifacts": [ <artifactName> ]
        _.forEach(csarspec.node_types, (nt, ntName) => {
          nt.interfaces = nt.interfaces || {};

          _.forEach(nt.operations, (op, opName) => {
            let ifaceName;

            if (_.includes(['install', 'configure', 'start', 'stop', 'uninstall'], opName)) {
              ifaceName = 'http://www.example.com/interfaces/lifecycle';
            } else if (_.includes(['createVM', 'terminateVM'], opName)) {
              ifaceName = 'CloudProviderInterface';
            } else if (_.includes(['installPackage', 'transferFile', 'runScript', 'waitForAvailability'], opName)) {
              ifaceName = 'OperatingSystemInterface';
            } else {
              ifaceName = 'DefaultInterface'
            }

            nt.interfaces[ifaceName] = nt.interfaces[ifaceName] || {};
            nt.interfaces[ifaceName].operations = nt.interfaces[ifaceName].operations || {};
            nt.interfaces[ifaceName].operations[opName] = { implementation_artifacts: op };
          });

          // move implementation artifact to interface if all its operations use the same artifacts
          _.forEach(nt.interfaces, (iface, ifaceName) => {
            if (_.size(iface.operations) < 2) return;

            const counts = _.reduce(iface.operations, (result, op, opName) => {
              _.forEach(op.implementation_artifacts, (ia) => {
                if (!result[ia]) result[ia] = 1;
                else result[ia]++;

                if (result[ia] === _.size(iface.operations)) result._toBeMoved.push(ia);
              });

              return result;
            }, { _toBeMoved: [] });

            if (!_.isEmpty(counts._toBeMoved)) {
              iface.implementation_artifacts = counts._toBeMoved;

              _.forEach(iface.operations, (op, opName) => {
                op.implementation_artifacts = _.compact(_.map(op.implementation_artifacts, (ia) => {
                  if (_.includes(iface.implementation_artifacts, ia)) {
                    return null;
                  } else {
                    return ia;
                  }
                }));
              });
            }
          });
        });

        done();
      },
      function(done) {
        // ensure that CSAR files are placed in output dir
        async.eachSeries(context.files, function(file, done) {
          const sourcePath = path.resolve(context.workingDir, file);
          const outputPath = path.resolve(context.outputDir, file);

          // if file does not exist in working dir, nothing to copy
          if (!_.includes(context.filesAbs, sourcePath)) return done();

          // if it's actually a directory, it should exist
          if (_.endsWith(file, '/')) return fs.ensureDir(outputPath, done);

          fs.ensureDir(path.dirname(outputPath), function(err) {
            if (err) return done(err);

            fs.copy(sourcePath, outputPath, done);
          });
        }, done);
      },
      function(done) {
        // wrap artifacts
        async.eachSeries(_.keys(csarspec.artifacts), function(artifactName, done) {
          const artifact = csarspec.artifacts[artifactName];

          wrapper.wrap(artifact, {
            baseDir: context.outputDir,
            artifactName: artifactName,
            wrapType: artifact.wrap
          }, (err, wrappedArtifact) => {
            if (err || !wrappedArtifact) return done(err);

            // add new references
            _.forEach(_.without.apply(this, [ wrappedArtifact.references ].concat(artifact.references)), (ref) => {
              if (_.endsWith(ref, '/')) return;

              ref = path.normalize(ref);

              context.files.push(ref);
              context.filesLow.push(ref.toLowerCase());
              context.filesAbs.push(path.join(context.outputDir, ref));
            });

            csarspec.artifacts[artifactName] = wrappedArtifact;

            done();
          });
        }, done);
      },
      function(done) {
        // check if artifact properties are wrapped correctly
        _.forEach(csarspec.artifacts, (a, aName) => {
          const propWrap = getArtifactType(a.type).propWrap || 'ArtifactProperties';

          if (_.isEmpty(a.properties)) return;
          else if (_.isPlainObject(a.properties) && _.size(a.properties) === 1 && !_.isEmpty(a.properties[propWrap])) return;

          const wrappedProperties = {};
          wrappedProperties[propWrap] = a.properties;
          a.properties = wrappedProperties;
        });

        // convert object-like property values to XML
        _.forEach(csarspec.topologies, (top, topName) => {
          _.forEach(top.nodes, (n, nName) => {
            _.forEach(n.properties, (pValue, pName) => {
              //if (_.isObjectLike(pValue))
              n.properties[pName] = data2xml(pName, pValue);
            });
          });
        });

        _.forEach(csarspec.artifacts, (a, aName) => {
          _.forEach(a.properties, (pValue, pName) => {
            a.properties[pName] = data2xml(pName, pValue);
          });
        });

        done();
      },
      function(done) {
        fs.ensureDir(path.resolve(context.outputDir, 'schema'), done);
      },
      function(done) {
        fs.ensureDir(path.resolve(context.outputDir, 'Definitions'), done);
      },
      function(done) {
        fs.ensureDir(path.resolve(context.outputDir, 'TOSCA-Metadata'), done);
      },
      function(done) {
        const properties = prettify(_.template(propertiesTpl)({
          csarspec: csarspec
        }));

        context.propertiesFilename = 'properties.xsd';

        if (_.includes(context.filesLow, path.join('schema', context.propertiesFilename))) {
          context.propertiesFilename = 'properties-' + shortid.generate() + '.xsd';
        }

        fs.writeFile(path.resolve(context.outputDir, 'schema', context.propertiesFilename), properties, done);
      },
      function(done) {
        const definitions = prettify(_.template(definitionsTpl)({
          csarspec: csarspec,
          artifactTypes: _.uniqBy(_.toArray(builtinArtifactTypes), (type) => { return type.name + type.namespace }),
          relationshipTypes: _.uniqBy(_.toArray(builtinRelationshipTypes), (type) => { return type.name + type.namespace }),
          propertiesFilename: context.propertiesFilename
        }));

        context.definitionsFilename = 'definitions.tosca';

        if (_.includes(context.filesLow, path.join('definitions', context.definitionsFilename))) {
          context.definitionsFilename = 'definitions-' + shortid.generate() + '.tosca';
        }

        fs.writeFile(path.resolve(context.outputDir, 'Definitions', context.definitionsFilename), definitions, done);
      },
      function(done) {
        const meta = _.template(metaTpl)({
          csarspec: csarspec,
          propertiesFilename: context.propertiesFilename,
          definitionsFilename: context.definitionsFilename,
          files: context.files
        });

        fs.writeFile(path.resolve(context.outputDir, 'TOSCA-Metadata', 'TOSCA.meta'), meta, done);
      },
      function(done) {
        fs.writeFile(path.resolve(context.outputDir, 'csarspec.json'), csarspecOutput, done);
      }
    ], function(err) {
      async.series([
        function(done) {
          if (context.workingDirCreated) fs.remove(context.workingDir, done);
          else done();
        },
        function(done) {
          if (err && context.outputDirCreated) fs.remove(context.outputDir, done);
          else done();
        }
      ], (err2) => {
        if (err2) console.error(err2);

        done(err, context.outputDir);
      });
    });
  };

  obj.generate = generate;

  return obj;
};
