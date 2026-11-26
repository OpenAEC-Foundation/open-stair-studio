import * as IFC from 'web-ifc';
import webIfcWasmUrl from 'web-ifc/web-ifc.wasm?url';
import { createIfc4WithApi } from './ifc-export-core.js';

let apiPromise;
export async function createIfc4(model, geometry) {
  if (!apiPromise) {
    const api = new IFC.IfcAPI();
    apiPromise = api.Init(() => webIfcWasmUrl).then(() => api).catch(error => {
      apiPromise = undefined;
      throw error;
    });
  }
  return createIfc4WithApi(await apiPromise, model, geometry);
}
