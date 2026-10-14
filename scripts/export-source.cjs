const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
if(!process.argv[2])throw new Error('Usage: npm run export:source -- <new directory outside this checkout>');
const destination=path.resolve(process.argv[2]);
const relative=path.relative(root,destination);
if(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw new Error('Export must be outside the checkout.');
if(fs.existsSync(destination))throw new Error('Destination already exists; choose a new directory.');
const entries=['.github','.gitignore','.gitattributes','src','tests','scripts','docs','examples','README.md','LICENSE','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','package.json','package-lock.json','START.vbs'];
const forbidden=/^(?:node_modules|runtime|work|references|dist|\.git)$|^\.env(?:\.|$)|^(?:auth|credentials|settings|usage|sources)\.json$|\.(?:exe|lnk|log|zip|pem|key)$/i;
function copy(source,target){
  const stat=fs.lstatSync(source);
  if(stat.isSymbolicLink()||forbidden.test(path.basename(source)))throw new Error('Unexpected export entry: '+path.relative(root,source));
  if(stat.isDirectory()){fs.mkdirSync(target,{recursive:true});for(const entry of fs.readdirSync(source))copy(path.join(source,entry),path.join(target,entry));}
  else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);}
}
for(const entry of entries)copy(path.join(root,entry),path.join(destination,entry));
console.log('Clean source exported to '+destination);
