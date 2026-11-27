import { tessellate } from './ifc-tessellate.js';

// The cheek faces on either side of a housed tread share partial edges.
// Export a conforming shell so a BIM reader needs no Boolean reconstruction.
export function newelShell(post, toLocal = p => [p.x,p.y,p.z]) {
  return tessellate({label:post.id,faces:post.meshFaces},toLocal,{
    splitTJunctions:true,expectedVolumeMm3:post.volume*1e9
  });
}
