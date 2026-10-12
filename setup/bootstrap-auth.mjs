import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'backend/identity-service/modules/auth/src/main/resources/modules/auth/db/migration');
function checksum(sql){
 let crc=0xffffffff;
 for(const line of sql.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/)){
  for(const byte of Buffer.from(line,'utf8')){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 }
 return (crc^0xffffffff)|0;
}
const literal=s=>"'"+s.replaceAll("'","''")+"'";
let output=`CREATE SCHEMA identity;
CREATE TABLE identity.flyway_schema_history (
 installed_rank integer PRIMARY KEY, version varchar(50), description varchar(200) NOT NULL,
 type varchar(20) NOT NULL, script varchar(1000) NOT NULL, checksum integer,
 installed_by varchar(100) NOT NULL, installed_on timestamp NOT NULL DEFAULT now(),
 execution_time integer NOT NULL, success boolean NOT NULL);
CREATE INDEX flyway_schema_history_s_idx ON identity.flyway_schema_history(success);
`;
let rank=0;
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort((a,b)=>Number(a.match(/^V([0-9]+)/)[1])-Number(b.match(/^V([0-9]+)/)[1]))){
 const sql=fs.readFileSync(path.join(dir,file),'utf8');
 const version=file.match(/^V([0-9]+)/)[1];
 const description=file.split('__')[1].replace('.sql','').replaceAll('_',' ');
 output+=sql+'\n';
 output+='INSERT INTO identity.flyway_schema_history(installed_rank,version,description,type,script,checksum,installed_by,execution_time,success) VALUES ('+(++rank)+','+literal(version)+','+literal(description)+",'SQL',"+literal(file)+','+checksum(sql)+",'postgres',0,true);\n";
}
process.stdout.write(output);
