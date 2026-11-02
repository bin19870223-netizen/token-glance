function displayIdentity(display){
  return {label:display.label||'',...display.bounds,internal:!!display.internal};
}
function resolveDisplay(displays,settings){
  const target=settings.displayTarget;
  if(!target)return displays.find(d=>d.id===settings.displayId)||null;
  const named=target.label?displays.filter(d=>d.label===target.label):displays;
  if(target.label&&named.length===1)return named[0];
  const byId=named.find(d=>d.id===settings.displayId);if(byId)return byId;
  const sized=named.filter(d=>d.internal===target.internal&&d.bounds.width===target.width&&d.bounds.height===target.height);
  if(sized.length===1)return sized[0];
  const positioned=sized.filter(d=>d.bounds.x===target.x&&d.bounds.y===target.y);
  return positioned.length===1?positioned[0]:null;
}
module.exports={displayIdentity,resolveDisplay};
