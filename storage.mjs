import fs from 'node:fs';
import path from 'node:path';

export const localMediaRoot=process.env.MEDIA_PATH||path.join(process.cwd(),'public','uploads');
fs.mkdirSync(localMediaRoot,{recursive:true});
const s3Enabled=Boolean(process.env.S3_ENDPOINT&&process.env.S3_BUCKET&&process.env.S3_ACCESS_KEY_ID&&process.env.S3_SECRET_ACCESS_KEY);
let s3Client;
const cleanName=name=>String(name||'image').toLowerCase().replace(/[^a-zа-яё0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(-100)||'image';
const publicUrl=key=>process.env.S3_PUBLIC_URL?`${process.env.S3_PUBLIC_URL.replace(/\/$/,'')}/${key}`:`${process.env.S3_ENDPOINT.replace(/\/$/,'')}/${process.env.S3_BUCKET}/${key}`;

async function client(){
  if(!s3Client){const {S3Client}=await import('@aws-sdk/client-s3');s3Client=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION||'ru-central1',credentials:{accessKeyId:process.env.S3_ACCESS_KEY_ID,secretAccessKey:process.env.S3_SECRET_ACCESS_KEY},forcePathStyle:process.env.S3_FORCE_PATH_STYLE!=='false'});}
  return s3Client;
}

export async function storeMedia({id,name,mime,buffer}){
  const key=`media/${id}-${cleanName(name)}`;
  if(s3Enabled){
    const {PutObjectCommand}=await import('@aws-sdk/client-s3');
    await (await client()).send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:key,Body:buffer,ContentType:mime,CacheControl:'public, max-age=31536000, immutable'}));
    return {storage:'s3',key,url:publicUrl(key)};
  }
  const filename=`${id}-${cleanName(name)}`;
  fs.writeFileSync(path.join(localMediaRoot,filename),buffer);
  return {storage:'local',key:filename,url:`/uploads/${filename}`};
}

export async function deleteMedia(storage,key){
  if(storage==='s3'&&s3Enabled){
    const {DeleteObjectCommand}=await import('@aws-sdk/client-s3');
    await (await client()).send(new DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:key}));
    return;
  }
  if(storage==='local')fs.rmSync(path.join(localMediaRoot,path.basename(key)),{force:true});
}

export const storageStatus=()=>({driver:s3Enabled?'s3':'local',s3Configured:s3Enabled});
