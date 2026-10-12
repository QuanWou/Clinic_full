import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'.runtime/main'),configPath=path.join(runtime,'config.json');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const cfg=read(configPath),databaseName=process.argv[2]??'clinic_team_current';
if(!cfg.bundleDevelopment||!cfg.nativePostgres||cfg.databaseHost!=='127.0.0.1')throw Error('Local native PostgreSQL configuration required');
if(!/^[a-fA-F0-9]{64}$/.test(cfg.runtimePassword??''))throw Error('Invalid runtime password configuration');
if(!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName)||['postgres','template0','template1','clinic_db',cfg.databaseName].includes(databaseName))throw Error('Use a new development database name');
const statePath=path.join(runtime,'processes.json');
if(fs.existsSync(statePath)&&read(statePath).status==='RUNNING')throw Error('Stop the application before restoring');
const env={...process.env,PGPASSWORD:cfg.databasePassword??'',PGCLIENTENCODING:'UTF8'};
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const identifier=value=>'"'+String(value).replaceAll('"','""')+'"';
function sql(query,db='postgres'){
 return execFileSync(cfg.psqlPath,['-X','-w','-q','-At','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',db,'-v','ON_ERROR_STOP=1'],{input:Buffer.from(query,'utf8'),env,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','inherit']}).trim();
}
const data=path.join(root,'database'),snapshot=read(path.join(data,'snapshot.json'));
if(path.basename(snapshot.dumpFile)!==snapshot.dumpFile)throw Error('Invalid dump file path');
const dump=path.join(data,snapshot.dumpFile);
if(createHash('sha256').update(fs.readFileSync(dump)).digest('hex')!==snapshot.dumpSha256)throw Error('Database dump checksum differs');
if(sql('SELECT count(*) FROM pg_database WHERE datname='+literal(databaseName)+';')!=='0')throw Error('Database already exists and has been preserved: '+databaseName);
const roles=read(path.join(data,'roles.json')),memberships=read(path.join(data,'role-memberships.json'));
const existing=JSON.parse(sql('SELECT coalesce(json_agg(row_to_json(r)),\'[]\'::json) FROM (SELECT rolname,rolcanlogin,rolsuper,rolbypassrls FROM pg_roles) r;'));
const roleNames=new Set(roles.map(role=>role.name));
let roleSql='BEGIN;';
for(const role of roles){
 if(!/^(clinic|main)_v2_[a-z]+_runtime$/.test(role.name))throw Error('Unexpected role name');
 const current=existing.find(item=>item.rolname===role.name);
 const login=role.name.startsWith('main_v2_');
 if(current){
  if(current.rolsuper||current.rolbypassrls||(login&&!current.rolcanlogin))throw Error('Existing runtime role has incompatible privileges: '+role.name);
 }else{
  roleSql+='CREATE ROLE '+identifier(role.name)+' '+(login?'LOGIN':'NOLOGIN')+' NOSUPERUSER NOBYPASSRLS '+(role.inherit?'INHERIT':'NOINHERIT')+(login?' PASSWORD '+literal(cfg.runtimePassword):'')+';';
 }
}
for(const grant of memberships){
 if(!roleNames.has(grant.role)||!roleNames.has(grant.member))throw Error('Unexpected role membership');
 roleSql+='GRANT '+identifier(grant.role)+' TO '+identifier(grant.member)+';';
}
sql(roleSql+'COMMIT;');
sql('CREATE DATABASE '+identifier(databaseName)+' OWNER '+identifier(cfg.databaseUser)+';');
execFileSync(path.join(path.dirname(cfg.psqlPath),'pg_restore.exe'),['-w','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',databaseName,'--no-owner','--exit-on-error','--single-transaction',dump],{env,stdio:['ignore','ignore','inherit']});
const expected=read(path.join(data,'table-counts.json'));
const parts=expected.map(table=>'SELECT '+literal(table.schema)+' AS schema,'+literal(table.name)+' AS name,count(*) AS rows FROM '+identifier(table.schema)+'.'+identifier(table.name));
const actual=JSON.parse(sql('SELECT json_agg(t ORDER BY schema,name) FROM ('+parts.join(' UNION ALL ')+') t;',databaseName));
const actualMap=new Map(actual.map(table=>[table.schema+'.'+table.name,Number(table.rows)]));
for(const table of expected)if(actualMap.get(table.schema+'.'+table.name)!==Number(table.rows))throw Error('Restored row count differs: '+table.schema+'.'+table.name+'; config has not been switched');
const actualTableCount=Number(sql("SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema');",databaseName));
if(actualTableCount!==snapshot.tableCount||actual.length!==snapshot.tableCount)throw Error('Restored table count differs; config has not been switched');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=path.join(runtime,'config-before-data-'+stamp+'.json');
fs.copyFileSync(configPath,backup,fs.constants.COPYFILE_EXCL);
cfg.currentDataSnapshot={...snapshot,restoredDatabase:databaseName,previousDatabase:cfg.databaseName,previousConfigFile:backup,verifiedTables:actual.length,restoredAt:new Date().toISOString()};
cfg.databaseName=databaseName;cfg.clinic=snapshot.clinicId;cfg.branch=snapshot.branchId;
fs.writeFileSync(configPath,JSON.stringify(cfg,null,2)+'\n');
fs.writeFileSync(path.join(runtime,'restored-snapshot.json'),JSON.stringify(cfg.currentDataSnapshot,null,2)+'\n');
fs.writeFileSync(path.join(runtime,'snapshot-table-verification.json'),JSON.stringify({status:'PASS',database:databaseName,verifiedTables:actual.length,tables:actual},null,2)+'\n');
fs.writeFileSync(path.join(runtime,'database-initialized'),'Current snapshot restored\n');
console.log('Restored and verified '+actual.length+' tables in '+databaseName+'. Previous database '+cfg.currentDataSnapshot.previousDatabase+' has been preserved.');
console.log('Run setup/link-snapshot-test-accounts.mjs before starting the application to keep the requested test accounts.');
