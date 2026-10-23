const fs=require('node:fs'),path=require('node:path');
const {hash,compatibility,validateBundle,assetName}=require('../src/updater.cjs');
function build(root){
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),files=[];
  function add(relative){
    const file=path.join(root,relative),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('Update files cannot be links');
    if(stat.isDirectory()){for(const name of fs.readdirSync(file).sort())add(relative+'/'+name);return;}
    const data=fs.readFileSync(file);files.push({path:relative,size:data.length,sha256:hash(data),content:data.toString('base64')});
  }
  add('src');add('package.json');
  const bundle={format:1,version:pkg.version,compatibility:compatibility(root),files};validateBundle(bundle,pkg.version,root);return bundle;
}
if(require.main===module){
  const root=path.resolve(__dirname,'..'),output=path.join(root,'dist',assetName),bundle=build(root);
  if(process.env.RELEASE_TAG&&process.env.RELEASE_TAG!=='v'+bundle.version)throw Error('Release tag must match package.json version');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(bundle));console.log('Built '+output);
}
module.exports={build};
