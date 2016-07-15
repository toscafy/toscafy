<?xml version="1.0" encoding="UTF-8"?>
<schema attributeFormDefault="unqualified" elementFormDefault="qualified" targetNamespace="<%= spec.csar_namespace %>" xmlns:tns="<%= spec.csar_namespace %>" xmlns="http://www.w3.org/2001/XMLSchema">

  <% _.forEach(spec.node_types, function(nt, ntName) { %>
  <% if (!_.isEmpty(nt.properties_schema)) { %>
  <element name="<%= ntName %>Properties">
    <complexType>
      <sequence xmlns:xsd="http://www.w3.org/2001/XMLSchema">
        <% _.forEach(nt.properties_schema, function(p, pName) { %>
        <element name="<%= pName %>" type="<%= p.type %>" <% if (p.default) { %>default="<%= p.default %>"<% } %> minOccurs="0" maxOccurs="1"/>
        <% }); %>
        <any minOccurs="0" maxOccurs="unbounded" namespace="##targetNamespace"/>
      </sequence>
    </complexType>
  </element>
  <% } %>
  <% }); %>

  <% if (spec.xsd_types_xml) { %>
  <%= spec.xsd_types_xml %>
  <% } %>
</schema>
