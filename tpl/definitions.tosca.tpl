<?xml version="1.0" encoding="UTF-8"?>
<tosca:Definitions xmlns:tosca="http://docs.oasis-open.org/tosca/ns/2011/12" xmlns:winery="http://www.opentosca.org/winery/extensions/tosca/2013/02/12" xmlns:selfservice="http://www.eclipse.org/winery/model/selfservice" id="<%= csarspec.csar_name %>" xmlns:csar="<%= csarspec.csar_namespace %>" targetNamespace="<%= csarspec.csar_namespace %>">

  <% if (csarspec.doc) { %>
  <tosca:documentation><%= csarspec.doc %></tosca:documentation>
  <% } %>

  <!-- ============== -->
  <!-- Artifact Types -->
  <!-- ============== -->

  <% _.forEach(artifactTypes, function(at) { %>
  <tosca:ArtifactType name="<%= at.name %>" targetNamespace="<%= at.namespace %>"/>
  <% }); %>

  <% if (csarspec.artifact_types_xml) { %>
  <%= csarspec.artifact_types_xml %>
  <% } %>

  <!-- ================== -->
  <!-- Relationship Types -->
  <!-- ================== -->

  <% _.forEach(relationshipTypes, function(rt) { %>
  <tosca:RelationshipType name="<%= rt.name %>" targetNamespace="<%= rt.namespace %>"/>
  <% }); %>

  <% if (csarspec.relationship_types_xml) { %>
  <%= csarspec.relationship_types_xml %>
  <% } %>

  <!-- ========== -->
  <!-- Node Types -->
  <!-- ========== -->

  <tosca:Import namespace="<%= csarspec.csar_namespace %>" location="schema/<%= propertiesFilename %>" importType="http://www.w3.org/2001/XMLSchema"/>

  <% _.forEach(csarspec.node_types, function(nt, ntName) { %>
  <tosca:NodeType name="<%= ntName %>" targetNamespace="<%= nt.namespace %>">
    <% if (nt.doc) { %>
    <tosca:documentation><%= nt.doc %></tosca:documentation>
    <% } %>
    <% if (!_.isEmpty(nt.properties_schema)) { %>
    <winery:PropertiesDefinition elementname="<%= ntName %>_Properties" namespace="<%= csarspec.csar_namespace %>">
      <% _.forEach(nt.properties_schema, function(p, pName) { %>
      <winery:properties>
        <winery:key><%= pName %></winery:key>
        <winery:type><%= p.type %></winery:type>
      </winery:properties>
      <% }); %>
    </winery:PropertiesDefinition>
    <tosca:PropertiesDefinition element="csar:<%= ntName %>_Properties"/>
    <% } %>
    <% if (!_.isEmpty(nt.interfaces)) { %>
    <tosca:Interfaces>
      <% _.forEach(nt.interfaces, function(iface, ifaceName) { %>
      <tosca:Interface name="<%= ifaceName %>">
        <% _.forEach(iface.operations, function(op, opName) { %>
        <tosca:Operation name="<%= opName %>">
          <% if (_.includes(nt.has_input_parameters, opName)) { %>
          <tosca:InputParameters>
            <% _.forEach(nt.properties_schema, function(p, pName) { if (_.includes(p.input, opName)) { %>
            <tosca:InputParameter name="<%= pName %>" type="<%= p.type %>"/> <!-- required="yes" -->
            <% } }); %>
          </tosca:InputParameters>
          <% } %>
          <% if (_.includes(nt.has_output_parameters, opName)) { %>
          <tosca:OutputParameters>
            <% _.forEach(nt.properties_schema, function(p, pName) { if (_.includes(p.output, opName)) { %>
            <tosca:OutputParameter name="<%= pName %>" type="<%= p.type %>"/>
            <% } }); %>
          </tosca:OutputParameters>
          <% } %>
        </tosca:Operation>
        <% }); %>
      </tosca:Interface>
      <% }); %>
    </tosca:Interfaces>
    <% } %>
  </tosca:NodeType>

  <% if (nt.has_implementation_artifacts || !_.isEmpty(nt.deployment_artifacts)) { %>
  <tosca:NodeTypeImplementation name="<%= ntName %>_Impl" xmlns:nt="<%= nt.namespace %>" nodeType="nt:<%= ntName %>" targetNamespace="<%= nt.namespace %>">
    <% if (nt.doc) { %>
    <tosca:documentation><%= nt.doc %></tosca:documentation>
    <% } %>
    <% if (nt.has_implementation_artifacts) { %>
    <tosca:ImplementationArtifacts>
      <% _.forEach(nt.interfaces, function(iface, ifaceName) { %>
      <% if (iface.implementation_artifacts) { %>
      <% _.forEach(iface.implementation_artifacts, function(ia) { %>
      <tosca:ImplementationArtifact xmlns:ia="<%= csarspec.artifacts[ia].namespace %>" name="IA-<%= ia %>" interfaceName="<%= ifaceName %>" artifactType="ia:<%= csarspec.artifacts[ia].type %>" artifactRef="csar:<%= ia %>"/>
      <% }); %>
      <% } %>
      <% _.forEach(iface.operations, function(op, opName) { %>
      <% if (op.implementation_artifacts) { %>
      <% _.forEach(op.implementation_artifacts, function(ia) { %>
      <tosca:ImplementationArtifact xmlns:ia="<%= csarspec.artifacts[ia].namespace %>" name="IA-<%= opName %>-<%= ia %>" interfaceName="<%= ifaceName %>" operationName="<%= opName %>" artifactType="ia:<%= csarspec.artifacts[ia].type %>" artifactRef="csar:<%= ia %>"/>
      <% }); %>
      <% } %>
      <% }); %>
      <% }); %>
    </tosca:ImplementationArtifacts>
    <% } %>
    <% if (!_.isEmpty(nt.deployment_artifacts)) { %>
    <tosca:DeploymentArtifacts>
      <% _.forEach(nt.deployment_artifacts, function(da) { %>
      <tosca:DeploymentArtifact xmlns:da="<%= csarspec.artifacts[da].namespace %>" name="DA-<%= da %>" artifactType="da:<%= csarspec.artifacts[da].type %>" artifactRef="csar:<%= da %>"/>
      <% }); %>
    </tosca:DeploymentArtifacts>
    <% } %>
  </tosca:NodeTypeImplementation>
  <% } %>
  <% }); %>

  <!-- ================== -->
  <!-- Artifact Templates -->
  <!-- ================== -->

  <% _.forEach(csarspec.artifacts, function(art, artName) { %>
  <tosca:ArtifactTemplate xmlns:at="<%= art.namespace %>" xmlns="<%= art.namespace %>" id="<%= artName %>" type="at:<%= art.type %>">
    <% if (art.doc) { %>
    <tosca:documentation><%= art.doc %></tosca:documentation>
    <% } %>
    <% if (!_.isEmpty(art.properties)) { %>
    <tosca:Properties>
      <% _.forEach(art.properties, function(prop) { %>
      <%= prop %>
      <% }); %>
    </tosca:Properties>
    <% } %>
    <% if (!_.isEmpty(art.references)) { %>
    <tosca:ArtifactReferences>
      <% _.forEach(art.references, function(ref) { %>
      <tosca:ArtifactReference reference="<%= ref %>"/>
      <% }); %>
    </tosca:ArtifactReferences>
    <% } %>
  </tosca:ArtifactTemplate>
  <% }); %>

  <!-- ============================ -->
  <!-- Service & Topology Templates -->
  <!-- ============================ -->

  <% _.forEach(csarspec.topologies, function(top, topName) { %>
  <tosca:ServiceTemplate id="<%= topName %>" name="<%= topName %>" targetNamespace="<%= top.namespace %>">
    <tosca:TopologyTemplate>
      <% if (top.doc) { %>
      <tosca:documentation><%= top.doc %></tosca:documentation>
      <% } %>
      <% _.forEach(top.nodes, function(n, nName) { %>
      <tosca:NodeTemplate name="<%= nName %>" minInstances="1" maxInstances="1" id="<%= nName %>" xmlns:nt="<%= csarspec.node_types[n.type].namespace %>" type="nt:<%= n.type %>">
        <% if (!_.isEmpty(n.properties)) { %>
        <tosca:Properties>
          <csar:<%= n.type %>_Properties xmlns="<%= csarspec.csar_namespace %>">
            <% _.forEach(n.properties, function(prop) { %>
            <%= prop %>
            <% }); %>
          </csar:<%= n.type %>_Properties>
        </tosca:Properties>
        <% } %>
        <% if (!_.isEmpty(n.deployment_artifacts)) { %>
        <tosca:DeploymentArtifacts>
          <% _.forEach(n.deployment_artifacts, function(da) { %>
          <tosca:DeploymentArtifact xmlns:da="<%= csarspec.artifacts[da].namespace %>" name="DA-<%= da %>" artifactType="da:<%= csarspec.artifacts[da].type %>" artifactRef="csar:<%= da %>"/>
          <% }); %>
        </tosca:DeploymentArtifacts>
        <% } %>
      </tosca:NodeTemplate>
      <% }); %>
      <% _.forEach(top.relationships, function(r, rName) { %>
      <tosca:RelationshipTemplate xmlns:rt="<%= r.namespace %>" name="<%= rName %>" id="<%= rName %>" type="rt:<%= r.type %>">
        <tosca:SourceElement ref="<%= r.source %>"/>
        <tosca:TargetElement ref="<%= r.target %>"/>
      </tosca:RelationshipTemplate>
      <% }); %>
    </tosca:TopologyTemplate>
  </tosca:ServiceTemplate>
  <% }); %>

</tosca:Definitions>
