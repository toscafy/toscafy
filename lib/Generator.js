const _ = require('lodash');

module.exports = () => {
  const obj = {};

  const generate = (csarSpec, done) => {
    //TODO make all names (node type etc.) camelCase

    //TODO iterate prop_schema:
    // * set xsd:string as type if no type set
    // * if no colon in type, prefix with "xsd:"
    // * if default value give, propagate default values to node templates

    //TODO iterate all types and replace by real ones (WAR, connects_to, ...)

    //TODO iterate operations of each node type and generate for each node type:
    // * "interfaces"
    //   * <name>
    //     * <artifact-ref> (implements all ops)
    //     * "operations"
    //       * <name>
    //         * <artifact-ref>
    //... the following interfaces are known by convention:
    // http://www.example.com/interfaces/lifecycle
    //   install
    //   configure
    //   start
    //   stop
    //   uninstall
    // OperatingSystemInterface
    //   installPackage
    //   transferFile
    //   runScript
    //   waitForAvailability
    // CloudProviderInterface
    //   createVM
    //   terminateVM

    done();
  };

  obj.generate = generate;

  return obj;
};
