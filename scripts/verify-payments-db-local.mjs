import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime=path.join(root,'.runtime/main');
const cfg=JSON.parse(fs.readFileSync(path.join(runtime,'config.json'),'utf8').replace(/^\uFEFF/,''));
const db='clinic_v2_s1_billing_sandbox';
if(db===cfg.databaseName||!['127.0.0.1','localhost'].includes(cfg.databaseHost))throw new Error('Use an isolated local payment test database.');
const role='clinic_payments_qa_'+randomBytes(6).toString('hex');
const password=randomBytes(32).toString('hex');
const sql=(q,database='postgres')=>execFileSync(cfg.psqlPath,['-X','-w','-h',cfg.databaseHost,'-p',String(cfg.databasePort),'-U',cfg.databaseUser,'-d',database,'-At','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGPASSWORD:cfg.databasePassword},input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
let roleCreated=false;
try{
 if(sql(`select count(*) from pg_database where datname='${db}'`) === '0')sql(`create database ${db}`);
 // This dedicated sandbox contains only synthetic fixtures. Global provider references
 // must not survive between suite runs; preserve Flyway's migration history.
 sql(`do $$ declare targets text; begin
  if current_database() <> 'clinic_v2_s1_billing_sandbox' then raise exception 'Wrong payment test database'; end if;
  select string_agg(format('%I.%I',schemaname,tablename),',') into targets from pg_tables
   where schemaname='billing_v2' and tablename <> 'flyway_schema_history';
  if targets is not null then execute 'truncate table ' || targets || ' restart identity cascade'; end if;
 end $$;`,db);
 sql(`create role ${role} login password '${password}'`);roleCreated=true;
 const env={...process.env,JAVA_HOME:cfg.toolchain.javaHome,Path:`${cfg.toolchain.javaHome}/bin;${process.env.Path??process.env.PATH}`,BILLING_IT_MIGRATION_USER:cfg.databaseUser,BILLING_IT_MIGRATION_PASSWORD:cfg.databasePassword,BILLING_IT_RUNTIME_USER:role,BILLING_IT_RUNTIME_PASSWORD:password};
 const log=fs.openSync(path.join(runtime,'payment-database-tests.log'),'w');
 const mvn=path.join(cfg.toolchain.mavenBin,'mvn.cmd');
 const args=['-q','-f','backend/pom.xml','-pl','billing-service/modules/billing','-am','test','-Dtest=BillingPostgresTest','-Dsurefire.failIfNoSpecifiedTests=false','-Dbilling.it.enabled=true',`-Dbilling.it.jdbc-url=jdbc:postgresql://127.0.0.1:${cfg.databasePort}/${db}`];
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 // Secrets are environment variables; the command contains only tool paths and test options.
 const command='& '+[mvn,...args].map(quote).join(' ')+'; exit $LASTEXITCODE';
 const child=spawn(cfg.toolchain.pwsh,['-NoProfile','-Command',command],{cwd:root,env,windowsHide:true,stdio:['ignore',log,log]});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});fs.closeSync(log);
 console.log(JSON.stringify({database:db,integrationEnabled:true,exitCode:code}));process.exitCode=code??1;
}catch(e){console.error('Isolated payment verification failed; inspect the private test log.');process.exitCode=1;}
finally{if(roleCreated){try{sql(`drop role ${role}`);}catch{console.error('Temporary payment test role needs cleanup; no production data was changed.');process.exitCode=1;}}}
