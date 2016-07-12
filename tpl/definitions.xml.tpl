<?xml version="1.0" encoding="UTF-8"?>
<tosca:Definitions xmlns:tosca="http://docs.oasis-open.org/tosca/ns/2011/12" xmlns:winery="http://www.opentosca.org/winery/extensions/tosca/2013/02/12" xmlns:selfservice="http://www.eclipse.org/winery/model/selfservice" id="<%= csarId %>" targetNamespace="http://toscafy.github.io/generated/<%= csarId %>">

  <!-- ============== -->
  <!-- Artifact Types -->
  <!-- ============== -->

  <tosca:ArtifactType name="ScriptArtifact" targetNamespace="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes"/>
  <tosca:ArtifactType name="WAR" targetNamespace="http://www.example.com/ToscaTypes"/>
  <tosca:ArtifactType name="DockerComposeArtifact" targetNamespace="http://toscafy.github.io/artifacttypes"/>

  <!-- ================== -->
  <!-- Relationship Types -->
  <!-- ================== -->

  <tosca:RelationshipType name="HostedOn" targetNamespace="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes"/>
  <tosca:RelationshipType name="ConnectsTo" targetNamespace="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes"/>

  <!-- ========== -->
  <!-- Node Types -->
  <!-- ========== -->

  <tosca:Import namespace="http://toscafy.github.io/nodetypes" location="./properties.xsd" importType="http://www.w3.org/2001/XMLSchema"/>

  <% if (spec.node_types) _.forEach(spec.node_types), function(nt, ntName) { %>
  <tosca:NodeType name="<%= ntName %>" targetNamespace="http://toscafy.github.io/nodetypes" xmlns:tns="http://toscafy.github.io/nodetypes">
    <winery:PropertiesDefinition elementname="<%= ntName %>Properties" namespace="http://toscafy.github.io/nodetypes">
      <winery:properties>
        <winery:key>DBName</winery:key>
        <winery:type>xsd:string</winery:type>
      </winery:properties>
      <winery:properties>
        <winery:key>DBUser</winery:key>
        <winery:type>xsd:string</winery:type>
      </winery:properties>
      <winery:properties>
        <winery:key>DBPassword</winery:key>
        <winery:type>xsd:string</winery:type>
      </winery:properties>
    </winery:PropertiesDefinition>
    <tosca:PropertiesDefinition type="tns:MySQLDBProperties"/>
    <tosca:Interfaces>
      <tosca:Interface name="http://www.example.com/interfaces/lifecycle">
        <tosca:Operation name="install">
          <tosca:InputParameters>
            <tosca:InputParameter name="DBName" type="xsd:string" required="yes"/>
            <tosca:InputParameter name="DBUser" type="xsd:string" required="yes"/>
            <tosca:InputParameter name="DBPassword" type="xsd:string" required="yes"/>
          </tosca:InputParameters>
        </tosca:Operation>
        <tosca:Operation name="configure">
          <tosca:InputParameters>
            <tosca:InputParameter name="DBName" type="xsd:string" required="yes"/>
            <tosca:InputParameter name="DBUser" type="xsd:string" required="yes"/>
            <tosca:InputParameter name="DBPassword" type="xsd:string" required="yes"/>
          </tosca:InputParameters>
        </tosca:Operation>
      </tosca:Interface>
    </tosca:Interfaces>
  </tosca:NodeType>

  <tosca:NodeTypeImplementation xmlns:tns="http://toscafy.github.io/nodetypes" name="MySQL-DB_Impl" targetNamespace="http://toscafy.github.io/nodetypes" nodeType="tns:MySQL-DB">
    <tosca:ImplementationArtifacts>
      <tosca:ImplementationArtifact xmlns:tbt="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes" name="MySQL-DB-InstallIA" interfaceName="http://www.example.com/interfaces/lifecycle" operationName="install" artifactType="tbt:ScriptArtifact" artifactRef="tns:MySQL-DB-InstallIA"/>
      <tosca:ImplementationArtifact xmlns:tbt="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes" name="MySQL-DB-ConfigureIA" interfaceName="http://www.example.com/interfaces/lifecycle" operationName="configure" artifactType="tbt:ScriptArtifact" artifactRef="tns:MySQL-DB-ConfigureIA"/>
    </tosca:ImplementationArtifacts>
  </tosca:NodeTypeImplementation>
  <% }); %>

  <!-- ================== -->
  <!-- Artifact Templates -->
  <!-- ================== -->

  <tosca:ArtifactTemplate xmlns:tbt="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes" id="MySQL-DB-InstallIA" type="tbt:ScriptArtifact">
    <tosca:ArtifactReferences>
      <tosca:ArtifactReference reference="./files/install.sh"/>
    </tosca:ArtifactReferences>
  </tosca:ArtifactTemplate>

  <tosca:ArtifactTemplate xmlns:extt2="http://www.example.com/ToscaTypes" id="Ubuntu-14.04-VM_OperatingSystemInterface_IA" type="extt2:WAR">
    <tosca:Properties>
      <ot:WSProperties xmlns:ot="http://www.uni-stuttgart.de/opentosca" xmlns="http://www.uni-stuttgart.de/opentosca">
        <ServiceEndpoint>/services/org_opentosca_NodeTypes_UbuntuPort</ServiceEndpoint>
        <PortType>{http://opentosca.org/NodeTypes}org_opentosca_NodeTypes_Ubuntu</PortType>
        <InvocationType>SOAP/HTTP</InvocationType>
      </ot:WSProperties>
    </tosca:Properties>
    <tosca:ArtifactReferences>
      <tosca:ArtifactReference reference="./org_opentosca_NodeTypes_Ubuntu-14_04-VM__OperatingSystemInterface.war"/>
      <tosca:ArtifactReference reference="./org_opentosca_NodeTypes_Ubuntu-14_04-VM__OperatingSystemInterface.zip"/>
    </tosca:ArtifactReferences>
  </tosca:ArtifactTemplate>

  <!-- ============================ -->
  <!-- Service & Topology Templates -->
  <!-- ============================ -->

  <tosca:ServiceTemplate id="MySQL-DB-ServiceTemplate" name="MySQL-DB-ServiceTemplate" targetNamespace="http://toscafy.github.io/servicetemplates" xmlns:tns="http://toscafy.github.io/nodetypes">
    <tosca:TopologyTemplate>
      <tosca:NodeTemplate name="OpenStack-Liberty-12" minInstances="1" maxInstances="1" id="openstackCloudProvider" type="tns:OpenStack-Liberty-12">
        <tosca:Properties>
          <tns:CloudProviderProperties xmlns="http://toscafy.github.io/nodetypes">
            <tns:APIEndpoint>129.69.209.127</tns:APIEndpoint>
            <tns:APIUser>openTOSCA.kalman</tns:APIUser>
            <tns:APIPassword/>
          </tns:CloudProviderProperties>
        </tosca:Properties>
      </tosca:NodeTemplate>
      <tosca:NodeTemplate xmlns:tns="http://toscafy.github.io/nodetypes" name="Ubuntu-14.04-VM" minInstances="1" maxInstances="1" id="ubuntuVM" type="tns:Ubuntu-14.04-VM">
        <tosca:Properties>
          <tns:VirtualMachineProperties xmlns="http://toscafy.github.io/nodetypes">
            <tns:InstanceId/>
            <tns:IP/>
            <tns:KeyPairName>KalleMarvinKey</tns:KeyPairName>
            <tns:User>ubuntu</tns:User>
            <tns:Password/>
            <tns:SecurityGroup>default</tns:SecurityGroup>
            <tns:Type>m1.medium</tns:Type>
          </tns:VirtualMachineProperties>
        </tosca:Properties>
      </tosca:NodeTemplate>
      <tosca:NodeTemplate xmlns:tns="http://toscafy.github.io/nodetypes" name="MySQL-DBMS-5.5" minInstances="1" maxInstances="1" id="mySqlDBMS" type="tns:MySQL-DBMS-5.5">
        <tosca:Properties>
          <tns:MySQLDBMSProperties xmlns="http://toscafy.github.io/nodetypes">
            <tns:DBMSUser>kalle</tns:DBMSUser>
            <tns:DBMSPassword>walle</tns:DBMSPassword>
            <tns:DBMSPort>3003</tns:DBMSPort>
          </tns:MySQLDBMSProperties>
        </tosca:Properties>
      </tosca:NodeTemplate>
      <tosca:NodeTemplate xmlns:tns="http://toscafy.github.io/nodetypes" name="MySQL-DB" minInstances="1" maxInstances="1" id="mySQLDb" type="tns:MySQL-DB">
        <tosca:Properties>
          <tns:MySQLDBProperties xmlns="http://toscafy.github.io/nodetypes">
            <tns:DBName>OpenTOSCATestDatabase</tns:DBName>
            <tns:DBUser>openTOSCADBUser</tns:DBUser>
            <tns:DBPassword>openTOSCADBPassword</tns:DBPassword>
          </tns:MySQLDBProperties>
        </tosca:Properties>
        <!-- <tosca:DeploymentArtifacts>
          <tosca:DeploymentArtifact xmlns:ns122="http://opentosca.org/artifacttypes" xmlns:ns121="http://toscafy.github.io/servicetemplates" name="MySQL-DB-OpenTOSCADB-SQL-DA" artifactType="ns122:SQLArtifact" artifactRef="ns121:MySQL-DB-OpenTOSCADB-SQL-ArtifactTemplate"/>
        </tosca:DeploymentArtifacts> -->
      </tosca:NodeTemplate>
      <tosca:RelationshipTemplate xmlns:tbt="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes" name="con_11" id="con_11" type="tbt:HostedOn">
        <tosca:SourceElement ref="mySQLDb"/>
        <tosca:TargetElement ref="mySqlDBMS"/>
      </tosca:RelationshipTemplate>
      <tosca:RelationshipTemplate xmlns:tbt="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes" name="con_23" id="con_23" type="tbt:HostedOn">
        <tosca:SourceElement ref="mySqlDBMS"/>
        <tosca:TargetElement ref="ubuntuVM"/>
      </tosca:RelationshipTemplate>
      <tosca:RelationshipTemplate xmlns:tbt="http://docs.oasis-open.org/tosca/ns/2011/12/ToscaBaseTypes" name="con_35" id="con_35" type="tbt:HostedOn">
        <tosca:SourceElement ref="ubuntuVM"/>
        <tosca:TargetElement ref="openstackCloudProvider"/>
      </tosca:RelationshipTemplate>
    </tosca:TopologyTemplate>
  </tosca:ServiceTemplate>

</tosca:Definitions>
