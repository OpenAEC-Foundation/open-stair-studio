import {readFileSync,writeFileSync} from 'node:fs';

const [destination]=process.argv.slice(2);
const {OSS_RELEASE_TAG:tag,OSS_INSTALLER_NAME:name,OSS_SIGNATURE_PATH:signaturePath}=process.env;
if(!destination||!tag||!name||!signaturePath||!/^v\d+\.\d+\.\d+$/.test(tag)||
  !/^Open.Stair.Studio_\d+\.\d+\.\d+_x64-setup\.exe$/i.test(name))
  throw new Error('Release tag, installer or signature path is invalid.');
const signature=readFileSync(signaturePath,'utf8').trim();
if(!signature)throw new Error('Empty updater signature.');
const encoded=encodeURIComponent(name);
const manifest={version:tag.slice(1),notes:'Open Stair Studio update',
  platforms:{'windows-x86_64':{
    url:`https://github.com/OpenAEC-Foundation/open-stair-studio/releases/download/${tag}/${encoded}`,
    signature
  }}};
writeFileSync(destination,JSON.stringify(manifest,null,2)+'\n');
console.log(`Manifest for ${tag} and windows-x86_64 validated.`);
