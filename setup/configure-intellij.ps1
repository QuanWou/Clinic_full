#requires -Version 7.4
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskCfg=Get-Content (Join-Path $taskRoot '.runtime/main/config.json') -Raw | ConvertFrom-Json -AsHashtable
$taskRunDir=Join-Path $taskRoot '.run'
New-Item -ItemType Directory -Force -Path $taskRunDir | Out-Null
function Escape-Xml([string]$value){[Security.SecurityElement]::Escape($value)}
foreach($taskRun in @(
 @{name='Clinic - Run All';script='start-local.ps1';file='Clinic_Run_All'},
 @{name='Clinic - Build All';script='build-local.ps1';file='Clinic_Build_All'},
 @{name='Clinic - Stop All';script='stop-dev.ps1';file='Clinic_Stop_All'}
)){
 $taskXml=@'
<component name="ProjectRunConfigurationManager">
  <configuration default="false" name="__NAME__" type="ShConfigurationType">
    <option name="SCRIPT_TEXT" value="" />
    <option name="SCRIPT_PATH" value="$PROJECT_DIR$/setup/__SCRIPT__" />
    <option name="SCRIPT_OPTIONS" value="" />
    <option name="SCRIPT_WORKING_DIRECTORY" value="$PROJECT_DIR$" />
    <option name="INTERPRETER_PATH" value="__PWSH__" />
    <option name="INTERPRETER_OPTIONS" value="-NoProfile -ExecutionPolicy Bypass -File" />
    <option name="EXECUTE_IN_TERMINAL" value="false" />
    <option name="EXECUTE_SCRIPT_FILE" value="true" />
    <envs />
    <method v="2" />
  </configuration>
</component>
'@
 $taskXml=$taskXml.Replace('__NAME__',(Escape-Xml $taskRun.name)).Replace('__SCRIPT__',$taskRun.script).Replace('__PWSH__',(Escape-Xml $taskCfg.toolchain.pwsh.Replace('\','/')))
 $taskXml | Set-Content -LiteralPath (Join-Path $taskRunDir "$($taskRun.file).run.xml") -Encoding utf8
}
$taskIdea=Join-Path $taskRoot '.idea'
$taskDataSource=Join-Path $taskIdea 'dataSources.xml'
$taskDataSourceName=if($taskCfg.currentDataSnapshot){'Clinic Current PostgreSQL'}else{'Clinic Local PostgreSQL'}
if(-not(Test-Path -LiteralPath $taskDataSource)){
 $taskDataXml=@'
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="DataSourceManagerImpl" format="xml" multifile-model="true">
    <data-source source="LOCAL" name="__NAME__" uuid="__UUID__">
      <driver-ref>postgresql</driver-ref>
      <synchronize>true</synchronize>
      <jdbc-driver>org.postgresql.Driver</jdbc-driver>
      <jdbc-url>jdbc:postgresql://__HOST__:__PORT__/__DATABASE__</jdbc-url>
      <user-name>__USER__</user-name>
      <working-dir>$ProjectFileDir$</working-dir>
    </data-source>
  </component>
</project>
'@
 $taskDataXml=$taskDataXml.Replace('__NAME__',$taskDataSourceName).Replace('__UUID__',[guid]::NewGuid().ToString()).Replace('__HOST__',$taskCfg.databaseHost).Replace('__PORT__',[string]$taskCfg.databasePort).Replace('__DATABASE__',$taskCfg.databaseName).Replace('__USER__',$taskCfg.databaseUser)
 $taskDataXml | Set-Content -LiteralPath $taskDataSource -Encoding utf8
}else{
 [xml]$taskDataXml=Get-Content -LiteralPath $taskDataSource -Raw
 $taskManagedDataSource=$taskDataXml.SelectSingleNode("/project/component/data-source[@name='$taskDataSourceName']")
 if(-not $taskManagedDataSource){
  $taskDataComponent=$taskDataXml.SelectSingleNode("/project/component[@name='DataSourceManagerImpl']")
  if(-not $taskDataComponent){
   $taskDataComponent=$taskDataXml.CreateElement('component')
   $taskDataComponent.SetAttribute('name','DataSourceManagerImpl')
   $taskDataComponent.SetAttribute('format','xml')
   $taskDataComponent.SetAttribute('multifile-model','true')
   $null=$taskDataXml.project.AppendChild($taskDataComponent)
  }
  $taskManagedDataSource=$taskDataXml.CreateElement('data-source')
  $taskManagedDataSource.SetAttribute('source','LOCAL')
  $taskManagedDataSource.SetAttribute('name',$taskDataSourceName)
  $taskManagedDataSource.SetAttribute('uuid',[guid]::NewGuid().ToString())
  $null=$taskDataComponent.AppendChild($taskManagedDataSource)
 }
 foreach($taskDataField in @{'driver-ref'='postgresql';'synchronize'='true';'jdbc-driver'='org.postgresql.Driver';'jdbc-url'="jdbc:postgresql://$($taskCfg.databaseHost):$($taskCfg.databasePort)/$($taskCfg.databaseName)";'user-name'=$taskCfg.databaseUser;'working-dir'='$ProjectFileDir$'}.GetEnumerator()){
  $taskDataNode=$taskManagedDataSource.SelectSingleNode($taskDataField.Key)
  if(-not $taskDataNode){$taskDataNode=$taskDataXml.CreateElement($taskDataField.Key);$null=$taskManagedDataSource.AppendChild($taskDataNode)}
  $taskDataNode.InnerText=$taskDataField.Value
 }
 $taskDataXml.Save($taskDataSource)
}
# IntelliJ 2024.1 stores Maven import/runner preferences in workspace.xml.
$taskWorkspacePath=Join-Path $taskIdea 'workspace.xml'
$taskWorkspace=[xml](Get-Content -LiteralPath $taskWorkspacePath -Raw)
function Ensure-XmlChild($taskParent,[string]$taskTag,[string]$taskName=''){
 $taskSelector=if($taskName){"$taskTag[@name='$taskName']"}else{$taskTag}
 $taskChild=$taskParent.SelectSingleNode($taskSelector)
 if(-not $taskChild){$taskChild=$taskWorkspace.CreateElement($taskTag);if($taskName){$taskChild.SetAttribute('name',$taskName)};$null=$taskParent.AppendChild($taskChild)}
 return $taskChild
}
function Set-XmlOption($taskParent,[string]$taskName,[string]$taskValue){
 $taskOption=Ensure-XmlChild $taskParent 'option' $taskName
 $taskOption.SetAttribute('value',$taskValue)
}
$taskPreferences=Ensure-XmlChild $taskWorkspace.project 'component' 'MavenImportPreferences'
$taskGeneralOption=Ensure-XmlChild $taskPreferences 'option' 'generalSettings'
$taskGeneral=Ensure-XmlChild $taskGeneralOption 'MavenGeneralSettings'
Set-XmlOption $taskGeneral 'mavenHome' (Split-Path $taskCfg.toolchain.mavenBin).Replace('\','/')
$taskImportOption=Ensure-XmlChild $taskPreferences 'option' 'importingSettings'
$taskImport=Ensure-XmlChild $taskImportOption 'MavenImportingSettings'
Set-XmlOption $taskImport 'jdkForImporter' '21'
$taskRunner=Ensure-XmlChild $taskWorkspace.project 'component' 'MavenRunner'
Set-XmlOption $taskRunner 'jreName' '21'
$taskRunManager=Ensure-XmlChild $taskWorkspace.project 'component' 'RunManager'
$taskRunManager.SetAttribute('selected','Shell Script.Clinic - Run All')
$taskWorkspace.Save($taskWorkspacePath)
# Remove only the obsolete preferences file created by this setup.
$taskOldMavenPath=Join-Path $taskIdea 'maven.xml'
if(Test-Path -LiteralPath $taskOldMavenPath){
 $taskOldMaven=[xml](Get-Content -LiteralPath $taskOldMavenPath -Raw)
 if(@($taskOldMaven.project.component).Count -eq 2 -and $taskOldMaven.SelectSingleNode("/project/component[@name='MavenGeneralSettings']/option[@name='mavenHome']").value -eq (Split-Path $taskCfg.toolchain.mavenBin).Replace('\','/')){Remove-Item -LiteralPath $taskOldMavenPath}
}
Write-Host 'IntelliJ run configurations and PostgreSQL data source saved.'
