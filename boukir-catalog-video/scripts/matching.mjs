export const key = (reference) => typeof reference === 'string' ? reference.trim() : '';
export function chooseVideo(product, clips, sharedApprovals = []) {
  const ref=key(product.reference);
  const exact=ref?clips.filter(c=>key(c.reference)===ref && c.usable):[];
  if(exact.length) return {usageVideo:rank(exact)[0].path,videoSource:'exact_reference',hasVideo:true};
  for(const approval of sharedApprovals) {
    if(approval.targetReference!==ref || approval.parentProductId!==product.parentProductId || approval.identicalUsage!==true || !approval.evidence?.trim()) continue;
    const sibling=product.variants?.find(v=>key(v.reference) && key(v.reference)===approval.sourceReference && v.parentProductId===product.parentProductId);
    if(!sibling) continue;
    const shared=clips.filter(c=>key(c.reference)===key(sibling.reference)&&c.usable);
    if(shared.length) return {usageVideo:rank(shared)[0].path,videoSource:'shared_variant',hasVideo:true};
  }
  return {usageVideo:null,videoSource:'none',hasVideo:false};
}
export function rank(clips) {
  // A reviewed usage score takes precedence. Metadata ranking is explicitly a fallback.
  return [...clips].sort((a,b)=>(b.reviewedUsageScore??-1)-(a.reviewedUsageScore??-1) || Math.min(b.duration,12)-Math.min(a.duration,12) || b.width*b.height-a.width*a.height || a.path.localeCompare(b.path));
}
