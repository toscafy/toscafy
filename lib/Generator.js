'use strict';

const os = require('os');
const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const async = require('async');
const prettifyXml = require('prettify-xml'); // pretty-data
const glob = require('glob');
const shortid = require('shortid');
const request = require('request');
const ignore = require('ignore');
const archiver = require('archiver');
const getStream = require('get-stream');

const definitionsTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'definitions.tosca.tpl')).toString();
const propertiesTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'properties.xsd.tpl')).toString();
const metaTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'TOSCA.meta.tpl')).toString();



const builtinFunctionNames = [
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
  war: { name: 'WAR', namespace: 'http://www.example.com/ToscaTypes' },
  ansible: { name: 'Ansible', namespace: 'http://opentosca.org/artifacttypes' },
  docker: { name: 'DockerComposeArtifact', namespace: 'http://toscafy.github.io/artifacttypes' }
};
builtinArtifactTypes.zip = builtinArtifactTypes.archive;

const builtinRelationshipTypes = {
  host: { name: 'HostedOn', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' },
  connect: { name: 'ConnectsTo', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' }
};
builtinRelationshipTypes.peer = builtinRelationshipTypes.connect;

const builtinXsdTypes = {
  anytype: 'anyType',
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
  candidate = _.lowerCase(_.camelCase(candidate));

  let type;

  _.forEach(builtinArtifactTypes, (t, tMatch) => {
    if (_.includes(candidate, tMatch)) type = t;
  });

  return type;
};

const getRelationshipType = (candidate) => {
  candidate = _.lowerCase(_.camelCase(candidate));

  let type;

  _.forEach(builtinRelationshipTypes, (t, tMatch) => {
    if (_.includes(candidate, tMatch)) type = t;
  });

  return type;
};

const getXsdType = (candidate) => {
  candidate = _.lowerCase(_.camelCase(candidate));

  let type;

  _.forEach(builtinXsdTypes, (t, tMatch) => {
    if (_.startsWith(candidate, tMatch)) type = 'xsd:' + t;
  });

  return type;
};

const prettify = (xml) => {
  return prettifyXml(_.remove(xml.split('\n'), (line) => {
    return _.trim(line) !== '';
  }).join('\n'), {
    indent: 2
  }) + '\n';
};

const runBuiltinFunctions = (collection, context, done) => {
  async.eachSeries(_.keys(collection), function(key, done) {
    const val = collection[key];

    done = _.once(done);

    if (_.isArray(val)) return runBuiltinFunctions(val, context, done);

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

    if (_.isEmpty(funcName) && _.isPlainObject(val)) return runBuiltinFunctions(val, context, done);

    if (funcName === '$toscafy.fetchAsFile') {
      const url = val['$toscafy.fetchAsFile'];

      if (!_.isString(val.filename)) {
        return done(new Error('property \'filename\' missing for $toscafy.fetchAsFile: ' + url));
      }

      collection[key] = val.filename;

      const filePath = path.join(context.outputDir, val.filename);

      fs.ensureDir(path.dirname(path.dirname(filePath)), function(err) {
        request(url).on('error', (err) => {
          done(new Error('fetch failed: ' + url + '; ' + err));
        }).pipe(fs.createWriteStream(filePath)).on('error', (err) => {
          done(new Error('fetch failed: ' + url + '; ' + err));
        }).on('finish', done);
      });
    } else if (_.includes(['$toscafy.fetchAsText', '$toscafy.fetchAsJson', '$toscafy.fetchAsBase64'], funcName)) {
      const url = val['$toscafy.fetchAsText'] || val['$toscafy.fetchAsJson'] || val['$toscafy.fetchAsBase64'];

      request({url: url, encoding: null}, (err, response, body) => {
        if (err) return done(new Error('fetch failed: ' + url + '; ' + err));
        else if (response.statusCode !== 200) return done(new Error('fetch failed: ' + url + '; response status code ' + response.statusCode));

        if (funcName === '$toscafy.fetchAsText') {
          collection[key] = body.toString('utf8');
        } else if (funcName === '$toscafy.fetchAsJson') {
          try {
            collection[key] = JSON.parse(body.toString('utf8'));
          } catch (err) {
            return done(new Error('fetch failed: ' + url + '; cannot parse JSON: ' + err));
          }
        } else if (funcName === '$toscafy.fetchAsBase64') {
          collection[key] = body.toString('base64');
        }

        done();
      });
    } else if (_.includes(['$toscafy.embedFileAsText', '$toscafy.embedFileAsJson', '$toscafy.embedFileAsBase64'], funcName)) {
      const file = val['$toscafy.embedFileAsText'] || val['$toscafy.embedFileAsJson'] || val['$toscafy.embedFileAsBase64'];
      const filePath = path.resolve(context.workingDir, file);

      fs.readFile(filePath, (err, content) => {
        if (err) return done(new Error('embedding file failed: ' + filePath + '; ' + err));

        if (funcName === '$toscafy.embedFileAsText') {
          collection[key] = content.toString('utf8');
        } else if (funcName === '$toscafy.embedFileAsJson') {
          try {
            collection[key] = JSON.parse(content.toString('utf8'));
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
      const dirPath = path.resolve(context.workingDir, dir);

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
    } else {
      done();
    }
  }, done);
};



module.exports = () => {
  const obj = {};

  const generate = (csarSpec, context, done) => {
    if (_.isEmpty(csarSpec)) return done(new Error('CSAR spec missing'));
    else if (_.isEmpty(context)) return done(new Error('context missing'));
    else if (_.isEmpty(context.workingDir)) return done(new Error('working directory must be specified as part of context'));

    context.outputDir = context.outputDir || path.join(os.tmpdir(), 'toscafy-csar-' + shortid.generate());

    if (path.resolve(context.workingDir) === path.resolve(context.outputDir)) return done(new Error('working directory must be different from output directory'));

    context.workingDir = path.resolve(context.workingDir);
    context.outputDir = path.resolve(context.outputDir);

    if (!_.isBoolean(context.camelize)) context.camelize = false;

    try {
      if (_.isString(csarSpec) && _.isPlainObject(context.variables)) {
        csarSpec = JSON.parse(_.template(csarSpec)({
          variables: variables,
          vars: variables
        }));
      } else if (_.isString(csarSpec)) {
        csarSpec = JSON.parse(csarSpec);
      }
    } catch (err) {
      return done(err);
    }

    const csarSpecOutput = JSON.stringify(csarSpec, null, 2);

    async.series([
      function(done) {
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
        runBuiltinFunctions(csarSpec, context, done);
      },
      function(done) {
        context.files = [];
        context.filesLow = [];
        context.filesAbs = [];

        glob('**', {
          //mark: true, // add '/' character to directory matches
          nodir: true,
          dot: true,
          root: context.workingDir,
          cwd: context.workingDir
        }, (err, workingDirFiles) => {
          if (err) return done(err);

          const workingDirFilesAbs = _.map(workingDirFiles, (file) => {
            return path.join(context.workingDir, file);
          });

          glob('**', {
            //mark: true, // add '/' character to directory matches
            nodir: true,
            dot: true,
            root: context.outputDir,
            cwd: context.outputDir
          }, (err, outputDirFiles) => {
            if (err) return done(err);

            const outputDirFilesAbs = _.map(outputDirFiles, (file) => {
              return path.join(context.outputDir, file);
            });

            const csarIgnore = path.join(context.workingDir, '.csarignore');

            if (_.includes(workingDirFilesAbs, csarIgnore)) {
              workingDirFiles = ignore().add(fs.readFileSync(csarIgnore).toString()).filter(workingDirFiles);
            }

            context.files = _.uniq(workingDirFiles.concat(outputDirFiles));
            context.filesLow = _.map(context.files, (file) => { return file.toLowerCase() });
            context.filesAbs = workingDirFilesAbs.concat(outputDirFilesAbs);

            if (_.includes(context.filesLow, 'tosca.meta')) {
              return done(new Error(`TOSCA.meta is a reserved filename and must not exist in working or output directory`));
            }

            done();
          });
        });
      },
      function(done) {
        csarSpec.csar_name = csarSpec.csar_name || shortid.generate();
        csarSpec.csar_namespace = csarSpec.csar_namespace || 'http://toscafy.github.io/generated/' + csarSpec.csar_name;
        csarSpec.artifacts = csarSpec.artifacts || {};

        if (_.isArray(csarSpec.artifact_types_xml)) csarSpec.artifact_types_xml = csarSpec.artifact_types_xml.join('\n');
        if (_.isArray(csarSpec.relationship_types_xml)) csarSpec.relationship_types_xml = csarSpec.relationship_types_xml.join('\n');
        if (_.isArray(csarSpec.xsd_types_xml)) csarSpec.xsd_types_xml = csarSpec.xsd_types_xml.join('\n');

        // validation of CSAR spec
        try {
          // check if properties schema types are valid
          _.forEach(csarSpec.node_types, (nt, ntName) => {
            _.forEach(nt.properties_schema, (p, pName) => {
              p.type = p.type || 'xsd:anyType';

              let t = p.type;

              if (!_.includes(p.type, ':')) t = getXsdType(p.type) || 'tns:' + p.type;

              p.type = t;
            });
          });

          // check if referred artifacts are valid; move embedded artifacts to artifacts section
          _.forEach(csarSpec.node_types, (nt, ntName) => {
            _.forEach(nt.operations, (op, opName) => {
              if (_.isString(op) || _.isPlainObject(op)) op = [ op ];

              nt.operations[opName] = op;

              _.forEach(op, (ia, iaPosition) => {
                nt.has_implementation_artifacts = true;

                if (_.isPlainObject(ia)) {
                  let iaName = `${ntName}-${opName}`;
                  if (csarSpec.artifacts[iaName]) iaName = `${ntName}-${opName}-${shortid.generate()}`;

                  csarSpec.artifacts[iaName] = ia;
                  op[iaPosition] = iaName;
                } else if (!csarSpec.artifacts[ia]) {
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
                let daName = `${ntName}-da`;
                if (csarSpec.artifacts[daName]) daName = `${ntName}-da-${shortid.generate()}`;

                csarSpec.artifacts[daName] = da;
                nt.deployment_artifacts[daPosition] = daName;
              } else if (!csarSpec.artifacts[da]) {
                throw new Error(`deployment artifact '${da}' of node type '${ntName}' is not specified`);
              }
            });
          });

          _.forEach(csarSpec.topologies, (top, topName) => {
            _.forEach(top.nodes, (n, nName) => {
              if (_.isString(n.deployment_artifacts) || _.isPlainObject(n.deployment_artifacts)) {
                n.deployment_artifacts = [ n.deployment_artifacts ];
              } else if (_.isString(n.deployment_artifact) || _.isPlainObject(n.deployment_artifact)) {
                n.deployment_artifacts = [ n.deployment_artifact ];
              }

              _.forEach(n.deployment_artifacts, (da, daPosition) => {
                if (_.isPlainObject(da)) {
                  let daName = `${topName}-${nName}`;
                  if (csarSpec.artifacts[daName]) daName = `${topName}-${nName}-${shortid.generate()}`;

                  csarSpec.artifacts[daName] = da;
                  n.deployment_artifacts[daPosition] = daName;
                } else if (!csarSpec.artifacts[da]) {
                  throw new Error(`deployment artifact '${da}' of node '${nName}' of topology '${topName}' is not specified`);
                }
              });
            });
          });

          // check if artifact types are valid
          _.forEach(csarSpec.artifacts, (a, aName) => {
            if (!a.type) throw new Error(`type of artifact '${aName}' is not specified`);

            if (a.type && a.namespace) return; // if custom namespace is specified, assume it is correct

            const t = getArtifactType(a.type);

            if (!t) throw new Error(`type '${a.type}' of artifact '${aName}' is invalid`);

            a.type = t.name;
            a.namespace = t.namespace;
          });

          // check if files referenced by artifacts exist
          // (artifact references that point to directories are currently not supported)
          _.forEach(csarSpec.artifacts, (a, aName) => {
            _.forEach(a.references, (ref) => {
              if (_.isString(ref) &&
                 !_.includes(context.filesAbs, path.resolve(context.workingDir, ref)) &&
                 !_.includes(context.filesAbs, path.resolve(context.outputDir, ref))) {
                throw new Error(`file '${ref}' of artifact '${aName}' does not exist or is not part of working and output directory`);
              }
            });
          });

          _.forEach(csarSpec.topologies, (top, topName) => {
            // check if node types of topology nodes are valid
            _.forEach(top.nodes, (n, nName) => {
              if (!n.type) throw new Error(`type of node '${nName}' of topology '${topName}' is not specified`);

              if (!csarSpec.node_types[n.type]) throw new Error(`type '${n.type}' of node '${nName}' of topology '${topName}' is invalid`);
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

        // propagate default values of node type properties schema to topology nodes
        _.forEach(csarSpec.topologies, (top, topName) => {
          _.forEach(top.nodes, (n, nName) => {
            n.properties = n.properties || {};

            _.forEach(_.get(csarSpec, `node_types['${n.type}'].properties_schema`), (p, pName) => {
              if (!n.properties[pName] && p.default) n.properties[pName] = p.default;
            });
          });
        });

        // convert names to camelCase
        if (context.camelize) {
          // convert all node type names to camelCase
          const nodeTypes = {};

          _.forEach(csarSpec.node_types, (nt, ntName) => {
            let newName = _.upperFirst(_.camelCase(ntName));

            if (nodeTypes[newName]) newName = _.upperFirst(_.camelCase(ntName + '_' + shortid.generate()));

            nodeTypes[newName] = nt;

            _.forEach(csarSpec.topologies, (top, topName) => {
              _.forEach(top.nodes, (n, nName) => {
                if (n.type === ntName) n.type = newName;
              });
            });
          });

          csarSpec.node_types = nodeTypes;

          // convert all artifact names to camelCase
          const artifacts = {};

          _.forEach(csarSpec.artifacts, (a, aName) => {
            let newName = _.camelCase(aName);

            if (artifacts[newName]) newName = _.camelCase(aName + '_' + shortid.generate());

            artifacts[newName] = a;

            _.forEach(csarSpec.node_types, (nt, ntName) => {
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

            _.forEach(csarSpec.topologies, (top, topName) => {
              _.forEach(top.nodes, (n, nName) => {
                if (n.deployment_artifacts) n.deployment_artifacts = _.uniq(_.map(n.deployment_artifacts, (ref) => {
                  if (ref === aName) return newName;
                  else return ref;
                }));
              });
            });
          });

          csarSpec.artifacts = artifacts;

          // convert all topology names to camelCase
          const topologies = {};

          _.forEach(csarSpec.topologies, (top, topName) => {
            let newName = _.camelCase(topName);

            if (topologies[newName]) newName = _.camelCase(topName + '_' + shortid.generate());

            topologies[newName] = top;
          });

          csarSpec.topologies = topologies;

          // convert all topology node names to camelCase
          _.forEach(csarSpec.topologies, (top, topName) => {
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

          _.forEach(csarSpec.topologies, (top, topName) => {
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
        //     * "implementation_artifacts": [ {name, type, namespace}, ... ] (implement all ops)
        //     * "operations"
        //       * <name>
        //         * "implementation_artifacts": [ {name, type, namespace}, ... ]
        // * "deployment_artifacts": [ {name, type, namespace}, ... ]
        _.forEach(csarSpec.node_types, (nt, ntName) => {
          nt.interfaces = {};

          _.forEach(nt.operations, (op, opName) => {
            let ifaceName;

            if (_.includes(['install', 'configure', 'start', 'stop', 'uninstall'], opName)) {
              ifaceName = 'http://www.example.com/interfaces/lifecycle';
            } else if (_.includes(['createVM', 'terminateVM'], opName)) {
              ifaceName = 'CloudProviderInterface';
            } else if (_.includes(['installPackage', 'transferFile', 'runScript', 'waitForAvailability'], opName)) {
              ifaceName = 'OperatingSystemInterface';
            } else {
              ifaceName = 'CustomInterface'
            }

            nt.interfaces[ifaceName] = nt.interfaces[ifaceName] || {};
            nt.interfaces[ifaceName].operations = nt.interfaces[ifaceName].operations || {};
            nt.interfaces[ifaceName].operations[opName] = { implementation_artifacts: [] };

            _.forEach(op, (ref) => {
              const ia = csarSpec.artifacts[ref];

              nt.interfaces[ifaceName].operations[opName].implementation_artifacts.push({
                name: ref,
                type: ia.type,
                namespace: ia.namespace
              });
            });
          });

          // move implementation artifact to interface if all its operations use the same artifacts
          _.forEach(nt.interfaces, (iface, ifaceName) => {
            if (_.size(iface.operations) < 2) return;

            const counts = _.reduce(iface.operations, (result, op, opName) => {
              _.forEach(op.implementation_artifacts, (ia) => {
                if (!result[ia.name]) result[ia.name] = 1;
                else result[ia.name]++;

                if (result[ia.name] === _.size(iface.operations)) result._toBeMoved.push(ia);
              });

              return result;
            }, { _toBeMoved: [] });

            if (!_.isEmpty(counts._toBeMoved)) {
              iface.implementation_artifacts = counts._toBeMoved;

              _.forEach(iface.operations, (op, opName) => {
                op.implementation_artifacts = _.compact(_.map(op.implementation_artifacts, (ia) => {
                  if (_.includes(_.map(iface.implementation_artifacts, (iia) => { return iia.name }), ia.name)) {
                    return null;
                  } else {
                    return ia;
                  }
                }));
              });
            }
          });
        });

        // enrich deployment artifact references of node types and topology nodes
        _.forEach(csarSpec.node_types, (nt, ntName) => {
          if (nt.deployment_artifacts) nt.deployment_artifacts = _.map(nt.deployment_artifacts, (ref) => {
            const da = csarSpec.artifacts[ref];

            return {
              name: ref,
              type: da.type,
              namespace: da.namespace
            };
          });
        });

        _.forEach(csarSpec.topologies, (top, topName) => {
          _.forEach(top.nodes, (n, nName) => {
            if (n.deployment_artifacts) n.deployment_artifacts = _.map(n.deployment_artifacts, (ref) => {
              const da = csarSpec.artifacts[ref];

              return {
                name: ref,
                type: da.type,
                namespace: da.namespace
              };
            });
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
        async.eachSeries(context.files, function(file, done) {
          const sourcePath = path.resolve(context.workingDir, file);

          if (!_.includes(context.filesAbs, sourcePath)) return done();

          //const relativePath = path.relative(context.workingDir, filePath);
          //const outputPath = path.resolve(context.outputDir, relativePath);
          const outputPath = path.resolve(context.outputDir, file);

          fs.ensureDir(path.dirname(outputPath), function(err) {
            if (err) return done(err);

            fs.copy(sourcePath, outputPath, done);
          });
        }, done);
      },
      function(done) {
        const properties = prettify(_.template(propertiesTpl)({
          spec: csarSpec
        }));

        context.propertiesFilename = 'properties.xsd';

        if (_.includes(context.filesLow, path.join('schema', context.propertiesFilename))) {
          context.propertiesFilename = 'properties-' + shortid.generate() + '.xsd';
        }

        fs.writeFile(path.resolve(context.outputDir, 'schema', context.propertiesFilename), properties, done);
      },
      function(done) {
        const definitions = prettify(_.template(definitionsTpl)({
          spec: csarSpec,
          artifactTypes: _.uniqBy(_.toArray(builtinArtifactTypes), (type) => { return type.name + type.namespace }),
          relationshipTypes: _.uniqBy(_.toArray(builtinRelationshipTypes), (type) => { return type.name + type.namespace }),
          propertiesFilename: context.propertiesFilename
        }));

        context.definitionsFilename = 'definitions.tosca';

        if (_.includes(context.filesLow, path.join('Definitions', context.definitionsFilename))) {
          context.definitionsFilename = 'definitions-' + shortid.generate() + '.tosca';
        }

        fs.writeFile(path.resolve(context.outputDir, 'Definitions', context.definitionsFilename), definitions, done);
      },
      function(done) {
        const meta = _.template(metaTpl)({
          spec: csarSpec,
          propertiesFilename: context.propertiesFilename,
          definitionsFilename: context.definitionsFilename,
          files: context.files
        });

        fs.writeFile(path.resolve(context.outputDir, 'TOSCA-Metadata', 'TOSCA.meta'), meta, done);
      },
      function(done) {
        fs.writeFile(path.resolve(context.outputDir, 'csarspec.json'), csarSpecOutput, done);
      }
    ], function(err) {
      if (err && context.outputDirCreated) {
        fs.remove(context.outputDir, (err2) => {
          if (err2) console.error(err2);

          done(err, context.outputDir);
        });
      } else {
        done(err, context.outputDir);
      }
    });
  };

  obj.generate = generate;

  return obj;
};
