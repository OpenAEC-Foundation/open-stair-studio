import * as IFC from 'web-ifc';
import webIfcWasmUrl from 'web-ifc/web-ifc.wasm?url';
import { createIfc4WithApi } from './ifc-export-core.js';

let apiPromise;
function exportApi() {
  if (!apiPromise) {
    const api = new IFC.IfcAPI();
    apiPromise = api.Init(() => webIfcWasmUrl).then(() => api).catch(error => {
      apiPromise = undefined;
      throw error;
    });
  }
  return apiPromise;
}
export async function createIfc4(model, geometry) {
  return createIfc4WithApi(await exportApi(), model, geometry);
}
export async function createIfcx(bytes) {
  const {createIfcxWithApi} = await import('./ifcx-export.js');
  return createIfcxWithApi(await exportApi(), bytes);
}
