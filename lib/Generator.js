'use strict';

const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const async = require('async');
const prettify = require('prettify-xml');
const glob = require('glob');
const shortid = require('shortid');
const request = require('request');

const definitionsTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'definitions.xml.tpl')).toString();
const propertiesTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'properties.xsd.tpl')).toString();
const metaTpl = fs.readFileSync(path.resolve(__dirname, '..', 'tpl', 'TOSCA.meta.tpl')).toString();

//TODO
// * toscafy project contains lib+cli+api to generate CSARs, merge CSARs, generate topologies, ...
// * toscafy-chef, toscafy-docker, toscafy-devopsbase, ...



//TODO add more types, see /Users/jojo/Repositories/toscafy/_private/types
const knownArtifactTypes = {
  script: { name: 'ScriptArtifact', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' },
  war: { name: 'WAR', namespace: 'http://www.example.com/ToscaTypes' },
  docker: { name: 'DockerComposeArtifact', namespace: 'http://toscafy.github.io/artifacttypes' }
};

const knownRelationshipTypes = {
  host: { name: 'HostedOn', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' },
  connect: { name: 'ConnectsTo', namespace: 'http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes' }
};
knownRelationshipTypes.peer = knownRelationshipTypes.connect;

const knownXsdTypes = {
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

  _.forEach(knownArtifactTypes, (t, tMatch) => {
    if (_.includes(candidate, tMatch)) type = t;
  });

  return type;
};

const getRelationshipType = (candidate) => {
  candidate = _.lowerCase(_.camelCase(candidate));

  let type;

  _.forEach(knownRelationshipTypes, (t, tMatch) => {
    if (_.includes(candidate, tMatch)) type = t;
  });

  return type;
};

const getXsdType = (candidate) => {
  candidate = _.lowerCase(_.camelCase(candidate));

  let type;

  _.forEach(knownXsdTypes, (t, tMatch) => {
    if (_.startsWith(candidate, tMatch)) type = 'xsd:' + t;
  });

  return type;
};



module.exports = () => {
  const obj = {};

  const generate = (csarSpec, context, done) => {
    if (_.isEmpty(csarSpec)) return done(new Error('CSAR spec missing'));
    else if (_.isEmpty(context)) return done(new Error('context missing'));
    else if (_.isEmpty(context.workingDir)) return done(new Error('working directory must be specified as part of context'));
    else if (_.isEmpty(context.outputDir)) return done(new Error('output directory must be specified as part of context'));
    else if (path.resolve(context.workingDir) === path.resolve(context.outputDir)) return done(new Error('working directory must be different from output directory'));

    context.workingDir = path.resolve(context.workingDir);
    context.outputDir = path.resolve(context.outputDir);

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

    const names = {
      nodeTypes: [],
      artifacts: [],
      topologies: [],
      nodes: [],
      relationships: []
    };

    async.series([
      function(done) {
        fs.access(context.workingDir, fs.R_OK, (err) => {
          if (err) done(new Error('cannot read working directory'));
          else done();
        });
      },
      function(done) {
        fs.ensureDir(context.outputDir, done);
      },
      function(done) {
        fs.access(context.outputDir, fs.R_OK | fs.W_OK, (err) => {
          if (err) done(new Error('cannot read/write output directory'));
          else done();
        });
      },
      function(done) {
        // fetch remotely stored files
        async.eachSeries(_.values(csarSpec.artifacts), function(artifact, done) {
          async.eachSeries(_.values(artifact), function(prop, done) {
            done = _.once(done);

            if (_.isPlainObject(prop) && prop['$toscafy.fetch'] && prop.to) {
              request(prop['$toscafy.fetch']).pipe(fs.createWriteStream(path.join(context.outputDir, prop.to))).on('error', (err) => {
                done(new Error('fetch failed: ' + prop['$toscafy.fetch'] + '; ' + err));
              }).on('finish', done);
            } else if (_.isPlainObject(prop) || _.isArray(prop)) {
              async.eachSeries(_.values(prop), function(prop, done) {
                done = _.once(done);

                if (_.isPlainObject(prop) && prop['$toscafy.fetch'] && prop.to) {
                  request(prop['$toscafy.fetch']).pipe(fs.createWriteStream(path.join(context.outputDir, prop.to))).on('error', (err) => {
                    done(new Error('fetch failed: ' + prop['$toscafy.fetch'] + '; ' + err));
                  }).on('finish', done);
                }
              });
            }
          }, done);
        }, done);
      },
      function(done) {
        csarSpec.files = csarSpec.files || [];

        glob(path.join(context.workingDir, '**'), {
          //mark: true, // add '/' character to directory matches
          nodir: true
        }, (err, files) => {
          if (err) return done(err);

          const csarIgnore = path.resolve(context.workingDir, '.csarignore');

          if (_.includes(files, csarIgnore)) {
            files = ignore().add(fs.readFileSync(csarIgnore).toString()).filter(files);
          }

          csarSpec.files = _.uniq(_.map(csarSpec.files.concat(filtered), (filePath) => {
            return path.resolve(filePath);
          }));

          done();
        });
      },
      function(done) {    
        csarSpec.csar_name = csarSpec.csar_name || shortid.generate();
        csarSpec.csar_namespace = csarSpec.csar_namespace || 'http://toscafy.github.io/generated/' + csarSpec.csar_name;
        csarSpec.artifacts = csarSpec.artifacts || {};

        if (_.isArray(spec.artifact_types_xml)) spec.artifact_types_xml = spec.artifact_types_xml.join('\n');
        if (_.isArray(spec.relationship_types_xml)) spec.relationship_types_xml = spec.relationship_types_xml.join('\n');
        if (_.isArray(spec.xsd_types_xml)) spec.xsd_types_xml = spec.xsd_types_xml.join('\n');

        // validation of CSAR spec
        try {
          // check if properties schema types are valid
          _.forEach(csarSpec.node_types, (nt, ntName) => {
            _.forEach(nt.properties_schema, (p, pName) => {
              p.type = p.type || 'xsd:anyType';

              const t = p.type;

              if (!_.includes(p.type, ':')) t = getXsdType(p.type) || 'tns:' + p.type;

              p.type = t;
            });
          });

          // check if referred artifacts are valid
          _.forEach(csarSpec.node_types, (nt, ntName) => {
            _.forEach(nt.operations, (op, opName) => {
              _.forEach(op, (ia) => {
                nt.has_implementation_artifacts = true;

                if (!csarSpec.artifacts[ia]) throw new Error(`implementation artifact '${ia}' of node type '${ntName}' is not specified`);
              });
            });

            _.forEach(nt.deployment_artifacts, (da) => {
              if (!csarSpec.artifacts[da]) throw new Error(`deployment artifact '${da}' of node type '${ntName}' is not specified`);
            });
          });

          _.forEach(csarSpec.topologies, (top, topName) => {
            _.forEach(top.nodes, (n, nName) => {
              _.forEach(n.deployment_artifacts, (da) => {
                if (!csarSpec.artifacts[da]) throw new Error(`deployment artifact '${da}' of node '${nName}' of topology '${topName}' is not specified`);
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
          _.forEach(csarSpec.artifacts, (a, aName) => {
            _.forEach(a.references, (ref) => {
              if (!_.includes(csarSpec.files, path.resolve(context.workingDir, ref))) {
                throw new Error(`file '${ref}' of artifact '${aName}' does not exist or is not part of working directory '${context.workingDir}'`);
              }
            });

            const refProperties = {
              DockerComposeArtifact: [ 'dockerComposeYml', 'context' ]
            };

            if (refProperties[a.type]) {
              _.forEach(refProperties[a.type], (propName) => {
                if (a[propName] && !_.includes(csarSpec.files, path.resolve(context.workingDir, a[propName]))) {
                  throw new Error(`file '${a[propName]}' of artifact '${aName}' does not exist or is not part of working directory '${context.workingDir}'`);
                }
              });
            }
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

            _.forEach(_.get(`csarSpec.node_types['${n.type}'].properties_schema`), (p, pName) => {
              if (!n.properties[pName] && p.default) n.properties[pName] = p.default;
            });
          });
        });

        // convert all node type names to camelCase
        _.forEach(csarSpec.node_types, (nt, ntName) => {
          let newName = _.upperFirst(_.camelCase(ntName));

          if (_.includes(names.nodeTypes, newName)) newName = _.upperFirst(_.camelCase(ntName + '_' + shortid.generate()));

          names.nodeTypes.push(newName);

          csarSpec.node_types[newName] = nt;
          delete csarSpec.node_types[ntName];

          _.forEach(csarSpec.topologies, (top, topName) => {
            _.forEach(top.nodes, (n, nName) => {
              if (n.type === ntName) n.type = newName;
            });
          });
        });

        // convert all artifact names to camelCase
        _.forEach(csarSpec.artifacts, (a, aName) => {
          let newName = _.upperFirst(_.camelCase(aName));

          if (_.includes(names.artifacts, newName)) newName = _.upperFirst(_.camelCase(aName + '_' + shortid.generate()));

          names.artifacts.push(newName);

          csarSpec.artifacts[newName] = a;
          delete csarSpec.artifacts[aName];

          _.forEach(csarSpec.node_types, (nt, ntName) => {
            _.forEach(nt.operations, (op, opName) => {
              nt.operations[opName] = _.uniq(_.map(op, (ref) => {
                if (ref === aName) return newName;
                else return aName;
              }));
            });

            if (nt.deployment_artifacts) nt.deployment_artifacts = _.uniq(_.map(nt.deployment_artifacts, (ref) => {
              if (ref === aName) return newName;
              else return aName;
            }));
          });

          _.forEach(csarSpec.topologies, (top, topName) => {
            _.forEach(top.nodes, (n, nName) => {
              if (n.deployment_artifacts) n.deployment_artifacts = _.uniq(_.map(n.deployment_artifacts, (ref) => {
                if (ref === aName) return newName;
                else return aName;
              }));
            });
          });
        });

        // convert all topology names to camelCase
        _.forEach(csarSpec.topologies, (top, topName) => {
          let newName = _.upperFirst(_.camelCase(topName));

          if (_.includes(names.topologies, newName)) newName = _.upperFirst(_.camelCase(topName + '_' + shortid.generate()));

          names.topologies.push(newName);

          csarSpec.topologies[newName] = top;
          delete csarSpec.topologies[topName];
        });

        // convert all topology node names to camelCase
        _.forEach(csarSpec.topologies, (top, topName) => {
          _.forEach(top.nodes, (n, nName) => {
            let newName = _.upperFirst(_.camelCase(nName));

            if (_.includes(names.nodes, newName)) newName = _.upperFirst(_.camelCase(nName + '_' + shortid.generate()));

            names.nodes.push(newName);

            top.nodes[newName] = n;
            delete top.nodes[nName];

            _.forEach(top.relationships, (r, rName) => {
              if (r.source === nName) r.source = newName;
              if (r.target === nName) r.target = newName;
            });
          });
        });

        // convert all topology relationship names to camelCase
        _.forEach(csarSpec.topologies, (top, topName) => {
          _.forEach(top.relationships, (r, rName) => {
            let newName = _.upperFirst(_.camelCase(rName));

            if (_.includes(names.relationships, newName)) newName = _.upperFirst(_.camelCase(rName + '_' + shortid.generate()));

            names.relationships.push(newName);

            top.relationships[newName] = r;
            delete top.relationships[rName];
          });
        });

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

                if (_.size(result[ia.name]) === _.size(iface.operations)) result.toBeMoved.push(ia);
              });

              return result;
            }, { toBeMoved: [] });

            if (!_.isEmpty(counts.toBeMoved)) {
              iface.implementation_artifacts = counts.toBeMoved;

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
        async.eachSeries(csarSpec.files, function(filePath, done) {
          const relativePath = path.relative(context.workingDir, filePath);
          const outputPath = path.resolve(context.outputDir, relativePath);

          fs.ensureDir(path.dirname(outputPath), function(err) {
            if (err) return done(err);

            fs.copy(filePath, outputPath, done);
          });
        }, done);
      },
      function(done) {
        const properties = prettify(_.template(propertiesTpl)({
          spec: csarSpec
        }), {
          indent: 2
        });

        fs.writeFile(path.resolve(context.outputDir, 'properties.xsd'), properties, done);
      },
      function(done) {
        const definitions = prettify(_.template(definitionsTpl)({
          spec: csarSpec,
          knownArtifactTypes: knownArtifactTypes,
          knownRelationshipTypes: knownRelationshipTypes
        }), {
          indent: 2
        });

        fs.writeFile(path.resolve(context.outputDir, 'definitions.xml'), definitions, done);
      },
      function(done) {
        const meta = _.template(metaTpl)({
          spec: csarSpec
        });

        fs.writeFile(path.resolve(context.outputDir, 'TOSCA.meta'), meta, done);
      }
    ], done);
  };

  obj.generate = generate;

  return obj;
};
